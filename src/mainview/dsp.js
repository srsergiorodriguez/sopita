// --- Math helpers for waveshapers ---
// The Web Audio API WaveShaperNode requires a Float32Array (a curve) to map input signals to output signals.
// The index of the array represents the incoming audio sample value (from -1.0 to 1.0),
// and the value at that index becomes the new output sample.
function makeDistortionCurve(amount) {
  const n_samples = 44100;
  const curve = new Float32Array(n_samples);
  const drive = 1 + (amount * 0.5); 
  
  for (let i = 0; i < n_samples; ++i) {
    // Normalize 'i' from [0, 44100] to a range of [-1.0, 1.0] to represent the audio wave
    const x = (i * 2) / n_samples - 1;
    // Math.tanh applies a mathematical curve that smoothly rounds off the peaks of the wave,
    // preventing harsh digital clipping and mimicking analog tube warmth.
    curve[i] = Math.tanh(x * drive);
  }
  return curve;
}

// Bitcrushing reduces the vertical resolution of the audio wave (amplitude quantization).
function makeBitcrushCurve(bits) {
  const levels = Math.pow(2, bits);
  const n_samples = 44100;
  const curve = new Float32Array(n_samples);
  
  for (let i = 0; i < n_samples; i++) {
    const x = (i * 2) / n_samples - 1;
    // By rounding the smooth input wave to discrete steps (levels), 
    // we introduce deliberate quantization noise, creating a retro sampler sound.
    curve[i] = Math.round(x * levels) / levels;
  }
  return curve;
}

// --- AudioWorklet Processor for Decimator ---
// AudioWorklet runs processing on a dedicated audio worker thread.
// This prevents audio stuttering when the UI thread is busy rendering graphics or executing state updates.
// Defining the code string inline allows us to dynamically instantiate it without extra build-tool bundling config.
const decimatorWorkletCode = `
  class DecimatorProcessor extends AudioWorkletProcessor {
    constructor() {
      super();
      this.holdFactor = 1;
      this.counter = 0;
      this.lastLeft = 0;
      this.lastRight = 0;
      
      // Receives message payloads (like holdFactor) sent across the thread boundary via postMessage
      this.port.onmessage = (e) => {
        if (e.data.holdFactor !== undefined) {
          this.holdFactor = e.data.holdFactor;
        }
      };
    }

    // AudioWorklet processes audio in continuous small blocks (typically 128 frames).
    process(inputs, outputs) {
      const input = inputs[0];
      const output = outputs[0];
      
      if (!input || input.length === 0) return true;
      
      const inL = input[0];
      const inR = input.length > 1 ? input[1] : inL;
      const outL = output[0];
      const outR = output.length > 1 ? output[1] : outL;

      if (!inL || !outL) return true;

      for (let i = 0; i < inL.length; i++) {
        // We simulate sample rate reduction by holding a single sample value constant
        // for 'holdFactor' number of frames before capturing a new input value.
        if (this.counter % this.holdFactor === 0) {
          this.lastLeft = inL[i];
          this.lastRight = inR[i];
        }
        
        outL[i] = this.lastLeft;
        if (output.length > 1) {
          outR[i] = this.lastRight;
        }
        
        // Modulo arithmetic ensures the counter safely wraps around, preventing integer overflow over long sessions
        this.counter = (this.counter + 1) % this.holdFactor;
      }
      return true;
    }
  }
  registerProcessor('decimator-processor', DecimatorProcessor);
`;

// Creates an in-memory Object URL for the script string so the Web Audio context can load it as a module source.
const decimatorBlobUrl = URL.createObjectURL(new Blob([decimatorWorkletCode], { type: 'application/javascript' }));

// Set to track contexts that have registered the worklet module, as distinct AudioContext instances 
// (e.g. real-time playback vs OfflineAudioContext) maintain independent module registries.
const loadedWorkletContexts = new Set();

// --- Node factory ---
// Asynchronously instantiates and configures Web Audio API nodes for the DSP chain.
export async function createEffectNode(ctx, type) {
  switch (type) {
    case 'Lowpass': {
      const node = ctx.createBiquadFilter();
      node.type = 'lowpass';
      return node;
    }
    case 'Highpass': {
      const node = ctx.createBiquadFilter();
      node.type = 'highpass';
      return node;
    }
    case 'Distortion': {
      const node = ctx.createWaveShaper();
      // Oversampling creates a higher-resolution internal processing buffer before shaping,
      // drastically reducing unwanted high-frequency aliasing artifacts.
      node.oversample = '4x';
      return node;
    }
    case 'Bitcrush': {
      return ctx.createWaveShaper();
    }
    case 'Decimate': {
      // Register the worklet module on the specific context if it hasn't been loaded yet
      if (!loadedWorkletContexts.has(ctx)) {
        await ctx.audioWorklet.addModule(decimatorBlobUrl);
        loadedWorkletContexts.add(ctx);
      }
      
      return new AudioWorkletNode(ctx, 'decimator-processor', {
        outputChannelCount: [2]
      });
    }
    case 'Tremolo': {
      // Tremolo modulates signal gain using a low-frequency oscillator (LFO)
      const node = ctx.createGain();
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      
      lfo.type = 'sine';
      lfo.connect(lfoGain);
      lfoGain.connect(node.gain);
      lfo.start();
      
      // Store references to internal nodes so parameter updates can adjust the oscillator directly
      node._lfo = lfo;
      node._lfoGain = lfoGain;
      return node;
    }
    case 'Limiter': {
      const node = ctx.createDynamicsCompressor();
      // Configured as a brickwall limiter to catch sharp transients and prevent digital clipping
      node.knee.value = 0.0;      
      node.attack.value = 0.005;  
      node.release.value = 0.050; 
      node.ratio.value = 20.0;    
      return node;
    }
    default:
      return ctx.createGain();
  }
}

// --- Heuristic mapping ---
// Translates 0 to 100 UI control values into non-linear, musically meaningful DSP parameters.
export function updateEffectParameters(node, type, value) {
  if (!node) return;
  const norm = Math.max(0, Math.min(100, value)) / 100;

  switch (type) {
    case 'Lowpass':
      // Exponential mapping matches the logarithmic nature of human pitch perception
      node.frequency.value = 20 * Math.pow(1000, 1 - norm);
      node.Q.value = norm * 8; 
      break;

    case 'Highpass':
      node.frequency.value = 20 * Math.pow(750, norm);
      break;

    case 'Distortion':
      node.curve = makeDistortionCurve(value);
      break;

    case 'Bitcrush':
      const bits = Math.max(2, 16 - (norm * 14)); 
      node.curve = makeBitcrushCurve(bits);
      break;

    case 'Decimate':
      const hold = Math.floor(1 + (norm * 39));
      // Cross-thread message sending to update the background AudioWorklet processor
      if (node instanceof AudioWorkletNode) {
        node.port.postMessage({ holdFactor: hold });
      }
      break;

    case 'Tremolo':
      node._lfo.frequency.value = 1 + (norm * 14);
      node._lfoGain.gain.value = norm * 0.5;
      node.gain.value = 1 - (norm * 0.25);
      break;

    case 'Limiter':
      node.threshold.value = -2 - (norm * 22);
      break;
  }
}