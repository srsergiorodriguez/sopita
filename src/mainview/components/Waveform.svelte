<script>
  import { onMount, onDestroy, untrack } from 'svelte';
  import WaveSurfer from 'wavesurfer.js';
  import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.esm.js';
  import { appState } from '../store.svelte.js';
  import { detectTransients } from '../audioMath.js';

  let container;
  let wavesurfer = null;
  let wsRegions = null;

  // Formats raw seconds into a readable 3-decimal string for the HUD.
  function formatTime(seconds) {
    if (isNaN(seconds) || seconds === 0) return '0.000s';
    return seconds.toFixed(3) + 's';
  }

  // --- Svelte 5 Derived State ---
  // The $derived rune replaces Svelte 4's reactive statements ($:). 
  // It automatically recalculates its value whenever any of the state variables inside it (like appState.slices) change.
  // This keeps our HUD math perfectly synchronized with the global state without manual event listeners.
  let activeIndex = $derived(appState.slices.findIndex(s => s.id === appState.activeSliceId));
  let activeSlice = $derived(appState.slices[activeIndex]);
  let maxSliceLen = $derived(
    appState.slices.length > 0 
      ? Math.max(...appState.slices.map(s => s.end - s.start)) 
      : 0
  );

  // Maps the DSP envelope fade values into CSS percentage widths for visual overlays.
  // Because this is $derived, adjusting a fade knob in the UI instantly recalculates these CSS positions.
  let slicesWithFades = $derived(appState.slices.map(slice => {
    const dur = appState.duration || 1;
    const sliceLeft = (slice.start / dur) * 100;
    const sliceWidth = ((slice.end - slice.start) / dur) * 100;
    
    const maxFadeSecs = (slice.end - slice.start) / 2;
    const vFadeIn = Math.min(appState.envelopes.fadeIn / 1000, maxFadeSecs);
    const vFadeOut = Math.min(appState.envelopes.fadeOut / 1000, maxFadeSecs);
    
    const fadeInPct = (vFadeIn / dur) * 100;
    const fadeOutPct = (vFadeOut / dur) * 100;
    
    return {
      id: slice.id,
      left: sliceLeft,
      width: sliceWidth,
      fadeInPct,
      fadeOutPct,
      fadeOutLeft: sliceLeft + sliceWidth - fadeOutPct
    };
  }));

  // Allows precise 1ms adjustments to region boundaries using the keyboard.
  function handleKeydown(e) {
    if (['ArrowLeft', 'ArrowRight'].includes(e.code)) {
      if (!wsRegions) return;
      e.preventDefault(); 
      
      const nudgeAmount = 0.001; 
      const dir = e.code === 'ArrowRight' ? 1 : -1;
      const delta = nudgeAmount * dir;

      let targetRegion = null;
      if (appState.appMode === 'trim') {
        const regions = wsRegions.getRegions();
        if (regions.length > 0) targetRegion = regions[0];
      } else if (appState.activeSliceId) {
        targetRegion = wsRegions.getRegions().find(r => r.id === appState.activeSliceId);
      }

      if (targetRegion) {
        let newStart = targetRegion.start;
        let newEnd = targetRegion.end;

        if (e.shiftKey) {
          newEnd += delta; // Shift + Arrow manipulates the slice end point
        } else {
          newStart += delta; // Standard Arrow manipulates the slice start point
        }

        // Clamp boundaries to prevent audio buffer overruns
        newStart = Math.max(0, newStart);
        newEnd = Math.min(appState.duration, newEnd);
        
        // Prevent collapsing the region entirely
        if (newStart >= newEnd - 0.001) return;

        targetRegion.setOptions({ start: newStart, end: newEnd });
        
        if (appState.appMode === 'trim') {
          appState.trimStart = newStart;
          appState.trimEnd = newEnd;
        }
        syncRegionsToStore();
      }
    }
  }

  onMount(() => {
    // Reads CSS variables from the DOM to ensure the canvas waveform perfectly matches the active theme
    const rootStyles = getComputedStyle(document.documentElement);
    const waveColor = rootStyles.getPropertyValue('--text-muted').trim();
    const progressColor = rootStyles.getPropertyValue('--accent').trim();
    const cursorColor = rootStyles.getPropertyValue('--text-main').trim();

    wavesurfer = WaveSurfer.create({
      container: container,
      waveColor: waveColor,
      progressColor: progressColor,
      cursorColor: cursorColor,
      cursorWidth: 2,
      height: 100,
      responsive: true,
      normalize: true,
    });

    // Initializes the primary Web Audio API context for real-time playback.
    // latencyHint: 'interactive' requests the smallest possible audio buffer size from the OS,
    // prioritizing immediate responsiveness over power saving.
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)({
      latencyHint: 'interactive'
    });
    
    // Hooks Wavesurfer's internal audio element into our custom Web Audio graph for DSP routing.
    const mediaElement = wavesurfer.getMediaElement();
    const source = audioCtx.createMediaElementSource(mediaElement);
    const fadeNode = audioCtx.createGain();
    
    source.connect(fadeNode);

    // Bluetooth Wake-Lock Hack:
    // Some Bluetooth headphones and OS power-saving modes suspend audio processing when there is silence.
    // When playback resumes, the delay in waking up the hardware cuts off the first few milliseconds of transients.
    // By running an inaudible oscillator continuously, we force the audio stream to remain open and active.
    const silentOsc = audioCtx.createOscillator();
    const silentGain = audioCtx.createGain();
    silentGain.gain.value = 0; 
    silentOsc.connect(silentGain);
    silentGain.connect(audioCtx.destination);
    silentOsc.start(); 

    // Store references in global state so the EffectsRack can access them and build the DSP chain
    appState.audioCtx = audioCtx;
    appState.fadeNode = fadeNode;

    wsRegions = wavesurfer.registerPlugin(RegionsPlugin.create());

    // Two-way synchronization between Wavesurfer's internal region objects and our global appState
    wsRegions.on('region-updated', (region) => {
      if (appState.appMode === 'trim') {
        appState.trimStart = region.start;
        appState.trimEnd = region.end;
      }
      syncRegionsToStore();
    });
    
    wsRegions.on('region-created', syncRegionsToStore);

    wsRegions.on('region-clicked', (region, e) => {
      // Double-click removes a slice manually
      if (e.detail === 2) {
        region.remove();
        syncRegionsToStore();
      } else {
        appState.activeSliceId = region.id;
      }
    });

    wavesurfer.on('audioprocess', (currentTime) => {
      appState.playheadPosition = currentTime;
    });

    wavesurfer.on('finish', () => {
      appState.isPlaying = false;
    });

    appState.wavesurfer = wavesurfer;

    // Reactively highlights the currently active slice region by manipulating its background color
    $effect(() => {
      if (wsRegions && appState.slices) {
        const regions = wsRegions.getRegions();
        regions.forEach(r => {
          const isActive = r.id === appState.activeSliceId;
          r.setOptions({
            color: isActive ? 'rgba(var(--accent-rgb), 0.4)' : 'rgba(var(--accent-rgb), 0.15)'
          });
        });
      }
    });

    // Master Mode Switcher: Listens for changes to appMode or transientSensitivity
    $effect(() => {
      const mode = appState.appMode;
      const sens = appState.transientSensitivity;
      
      if (!wavesurfer || !appState.buffer) return;

      // untrack() is a Svelte 5 utility. 
      // It executes the code block but tells the reactivity engine to IGNORE any state reads inside it.
      // This prevents the $effect from accidentally re-triggering itself or responding to unintended dependencies.
      untrack(() => {
        if (mode === 'trim') {
          wsRegions.clearRegions();
          wsRegions.addRegion({
            start: appState.trimStart,
            end: appState.trimEnd,
            color: 'rgba(var(--accent-rgb), 0.15)',
            drag: true,
            resize: true
          });
          syncRegionsToStore();
        } 
        else if (mode === 'slice') {
          if (sens > 0) {
            const hits = detectTransients(appState.buffer, sens);
            wsRegions.clearRegions();
            
            // Map the detected zero-crossing timestamps into physical region blocks on the waveform
            hits.forEach((hitTime, index) => {
              const nextHit = hits[index + 1];
              const endTime = nextHit ? nextHit : appState.buffer.duration;
              
              wsRegions.addRegion({
                start: hitTime,
                end: endTime,
                color: 'rgba(var(--accent-rgb), 0.15)',
                drag: true,
                resize: true
              });
            });
            syncRegionsToStore();
            
            if (wsRegions.getRegions().length > 0) {
              appState.activeSliceId = wsRegions.getRegions()[0].id;
            }
          }
        }
      });
    });
  });

  onDestroy(() => {
    if (wavesurfer) {
      wavesurfer.destroy();
    }
  });

  // Helper to convert Wavesurfer plugin objects into plain JS objects for our global state
  function syncRegionsToStore() {
    appState.slices = wsRegions.getRegions().map(r => ({
      id: r.id,
      start: r.start,
      end: r.end
    }));
  }

  // File Loader Effect: 
  // Triggers automatically when a user loads a new audio file via the I/O system.
  $effect(() => {
    if (wavesurfer && appState.rawAudio) {
      // Re-encapsulates the raw binary array into a Blob so Wavesurfer can parse it natively
      const blob = new Blob([appState.rawAudio]);
      wavesurfer.loadBlob(blob);
      
      wavesurfer.once('ready', () => {
        appState.buffer = wavesurfer.getDecodedData();
        const dur = wavesurfer.getDuration();
        
        appState.duration = dur;
        appState.trimStart = 0;
        appState.trimEnd = dur;

        wsRegions.clearRegions();
        
        if (appState.appMode === 'trim') {
          wsRegions.addRegion({
            start: 0,
            end: dur,
            color: 'rgba(var(--accent-rgb), 0.15)',
            drag: true,
            resize: true
          });
          syncRegionsToStore();
        }
      });
    }
  });
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="waveform-layout">
  {#if appState.buffer}
    <div class="hud-bar">
      <div class="hud-left">
        <span class="hud-item">FILE: {formatTime(appState.duration)}</span>
        
        {#if appState.appMode === 'trim'}
          <span class="hud-item">LOOP: {formatTime(appState.trimEnd - appState.trimStart)}</span>
        {:else}
          <span class="hud-item">SLICES: {appState.slices.length}</span>
          {#if activeSlice}
            <span class="hud-item">
              SEL: {activeIndex + 1}/{appState.slices.length} [{formatTime(activeSlice.end - activeSlice.start)}]
            </span>
          {/if}
          <span class="hud-item">MAX: {formatTime(maxSliceLen)}</span>
        {/if}
      </div>
      
      <div class="hud-right">
      </div>
    </div>
  {/if}

  <div class="waveform-wrapper">
    <div class="waveform-container">
      <div bind:this={container} class="ws-mount"></div>
      
      <!-- Visual Fade Overlays driven by Svelte 5 $derived state -->
      {#if appState.buffer}
        {#each slicesWithFades as slice (slice.id)}
          {#if slice.fadeInPct > 0}
            <div 
              class="fade-overlay fade-in" 
              style="left: {slice.left}%; width: {slice.fadeInPct}%;">
            </div>
          {/if}
          
          {#if slice.fadeOutPct > 0}
            <div 
              class="fade-overlay fade-out" 
              style="left: {slice.fadeOutLeft}%; width: {slice.fadeOutPct}%;">
            </div>
          {/if}
        {/each}
      {/if}
    </div>
  </div>
</div>

<style>
  .waveform-layout {
    display: flex;
    flex-direction: column;
    width: 100%;
  }

  .hud-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.5rem 1rem;
    background: var(--bg-main);
    border-bottom: 1px solid var(--bg-panel);
  }

  .hud-left, .hud-right {
    display: flex;
    gap: 1.5rem;
  }

  .hud-item {
    font-size: 0.75rem;
    color: var(--text-muted);
    font-family: var(--font-mono);
    letter-spacing: 0.5px;
  }

  .waveform-wrapper {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
    box-sizing: border-box;
  }

  .waveform-container {
    width: 100%;
    background: var(--bg-main);
    border-radius: var(--radius-md);
    border: 1px solid var(--bg-panel);
    position: relative;
    overflow: hidden; 
  }

  .ws-mount {
    width: 100%;
    height: 100%;
  }

  .fade-overlay {
    position: absolute;
    top: 0;
    bottom: 0;
    pointer-events: none;
    z-index: 10;
  }

  .fade-in {
    background: linear-gradient(to right, var(--bg-main) 0%, transparent 100%);
  }

  .fade-out {
    background: linear-gradient(to right, transparent 0%, var(--bg-main) 100%);
  }
</style>