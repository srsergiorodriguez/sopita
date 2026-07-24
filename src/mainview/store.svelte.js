// In Svelte 5, state can be extracted outside of components into plain .svelte.js files.
// By wrapping our global object in the $state rune here, we create a deeply reactive store.
// Any component that imports 'appState' and reads one of its properties will automatically 
// re-render whenever that specific property changes, without needing the '$' prefix syntax from Svelte 4.
export const appState = $state({
  // --- Audio Data & Web Audio API References ---
  // We keep the raw file bytes separate from the decoded audio buffer.
  // The raw ArrayBuffer is needed for the offline export engine to process cleanly, 
  // while the decoded AudioBuffer is used for real-time live playback.
  rawAudio: null,
  buffer: null,
  
  // We store references to our active Web Audio nodes and Wavesurfer UI instance globally.
  // This allows deeply nested components (like the toolbar or effects rack) to control 
  // playback and DSP routing without having to pass props down multiple levels.
  wavesurfer: null,     
  audioCtx: null,
  sourceNode: null,
  fadeNode: null,

  // --- UI & Application State ---
  theme: "dark",
  // 'trim' restricts the UI to a single editable region loop.
  // 'slice' enables multi-region drum chopping based on transient detection.
  appMode: 'trim', 
  slices: [],      
  transientSensitivity: 50, 
  activeSliceId: null,

  // --- Playback State ---
  isPlaying: false,
  playheadPosition: 0,
  duration: 0,
  trimStart: 0,
  trimEnd: 0,

  // --- DSP Parameters ---
  // Amplitude modulation envelopes stored in milliseconds and percentage
  envelopes: {
    fadeIn: 0,
    fadeOut: 0,
    volume: 80 
  },
  
  // The sequential audio processing chain. 
  // Because the $state rune is deeply reactive by default, updating a nested property 
  // (e.g., appState.effectsChain[2].value = 50) will instantly trigger any $effect blocks 
  // that are watching that specific object property across the entire application.
  effectsChain: [
    { id: 'lp', type: 'Lowpass', active: false, value: 0 },
    { id: 'hp', type: 'Highpass', active: false, value: 0 },
    { id: 'dist', type: 'Distortion', active: false, value: 0 },
    { id: 'crush', type: 'Bitcrush', active: false, value: 0 },
    { id: 'deci', type: 'Decimate', active: false, value: 0 },
    { id: 'trem', type: 'Tremolo', active: false, value: 0 },
    { id: 'lim', type: 'Limiter', active: false, value: 0 }
  ]
});