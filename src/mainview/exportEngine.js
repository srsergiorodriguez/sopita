import { encodeWAV } from './wavEncoder.js';
import { createEffectNode, updateEffectParameters } from './dsp.js';

// The export engine orchestrates non-realtime (offline) audio rendering.
// Instead of playing audio in real-time through system speakers, it uses an OfflineAudioContext
// to process DSP chains, envelope curves, and slice boundaries as fast as the CPU allows.
export async function renderExport(appState, config) {
  const { buffer, envelopes, effectsChain, appMode, slices, trimStart, trimEnd } = appState;
  const sr = config.sampleRate;
  const channels = config.channels;

  // Builds and connects the DSP chain for an OfflineAudioContext.
  // Made async to properly await the worklet module loading inside createEffectNode.
  async function applyDSPChain(oac, sourceNode, gainNode) {
    const activeEffects = effectsChain.filter(e => e.active);
    let currentNode = sourceNode;

    for (const effect of activeEffects) {
      const dspNode = await createEffectNode(oac, effect.type);
      updateEffectParameters(dspNode, effect.type, effect.value);
      currentNode.connect(dspNode);
      currentNode = dspNode;
    }

    currentNode.connect(gainNode);
  }

  // Renders a discrete audio segment in memory with gain envelopes and active DSP effects.
  async function renderChunk(startSec, endSec) {
    const duration = endSec - startSec;
    
    // OfflineAudioContext creates an in-memory buffer for rendering audio offline.
    // Total sample frames needed = duration in seconds * target sample rate.
    const oac = new OfflineAudioContext(channels, Math.ceil(duration * sr), sr);
    
    const source = oac.createBufferSource();
    source.buffer = buffer;
    
    const gainNode = oac.createGain();
    
    // Wire up the asynchronous DSP chain to the offline processing context
    await applyDSPChain(oac, source, gainNode);
    gainNode.connect(oac.destination);
    
    // Fade calculations: Safeguard fade durations so they never exceed half the total slice length
    const maxFade = duration / 2;
    const fIn = Math.min(envelopes.fadeIn / 1000, maxFade);
    const fOut = Math.min(envelopes.fadeOut / 1000, maxFade);
    
    // AudioParam automation scheduling for clean fade-in and fade-out curves
    gainNode.gain.setValueAtTime(0, 0);
    gainNode.gain.linearRampToValueAtTime(1, fIn);
    gainNode.gain.setValueAtTime(1, Math.max(fIn, duration - fOut));
    gainNode.gain.linearRampToValueAtTime(0, duration);
    
    // Schedule buffer playback at offset startSec for the calculated duration
    source.start(0, startSec, duration);
    
    // oac.startRendering() renders the graph in a background thread and returns an AudioBuffer
    return await oac.startRendering();
  }

  // --- MODE: TRIM ---
  if (appMode === 'trim') {
    const rendered = await renderChunk(trimStart, trimEnd);
    return [{ 
      name: 'sopita_sample.wav', 
      blob: encodeWAV(rendered, config.bitDepth) 
    }];
  } 
  
  // --- MODE: SLICE ---
  else if (appMode === 'slice') {
    
    // Layout Option A: Individual WAV files per slice
    if (config.layout === 'separate') {
      const files = [];
      for (let i = 0; i < slices.length; i++) {
        const s = slices[i];
        const rendered = await renderChunk(s.start, s.end);
        
        const idx = String(i + 1).padStart(2, '0');
        files.push({ 
          name: `sopita_slice_${idx}.wav`, 
          blob: encodeWAV(rendered, config.bitDepth) 
        });
      }
      return files;
    } 
    
    // Layout Option B: Continuous grid sample file with uniform spacing
    else if (config.layout === 'grid') {
      const maxLen = Math.max(...slices.map(s => s.end - s.start));
      const totalDur = maxLen * slices.length;
      
      const oac = new OfflineAudioContext(channels, Math.ceil(totalDur * sr), sr);

      // Sequential loop ensures async DSP initialization per slice is properly awaited
      for (let i = 0; i < slices.length; i++) {
        const s = slices[i];
        const dur = s.end - s.start;
        const source = oac.createBufferSource();
        source.buffer = buffer;
        const gain = oac.createGain();
        
        const maxFade = dur / 2;
        const fIn = Math.min(envelopes.fadeIn / 1000, maxFade);
        const fOut = Math.min(envelopes.fadeOut / 1000, maxFade);
        
        const startTime = i * maxLen;
        
        gain.gain.setValueAtTime(0, startTime);
        gain.gain.linearRampToValueAtTime(1, startTime + fIn);
        gain.gain.setValueAtTime(1, Math.max(startTime + fIn, startTime + dur - fOut));
        gain.gain.linearRampToValueAtTime(0, startTime + dur);
        
        await applyDSPChain(oac, source, gain);
        gain.connect(oac.destination);
        source.start(startTime, s.start, dur);
      }
      
      const rendered = await oac.startRendering();
      return [{ 
        name: 'sopita_grid.wav', 
        blob: encodeWAV(rendered, config.bitDepth) 
      }];
    }
  }
}