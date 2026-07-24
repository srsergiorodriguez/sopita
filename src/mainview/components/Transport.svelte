<script>
  import { appState } from '../store.svelte.js';

  let activeSource = null;
  let animFrame = null;

  // Immediately halts any running audio and cleans up the visual playhead.
  function stopAudio() {
    if (activeSource) {
      try { activeSource.stop(); } catch(e) {}
      activeSource.disconnect();
      activeSource = null;
    }
    appState.isPlaying = false;
    cancelAnimationFrame(animFrame);
    
    // Web Audio API Trap: If an audio parameter (like volume) is in the middle of a ramp 
    // when the audio is stopped, it will stay stuck at that exact value forever.
    // We explicitly cancel any pending fade-outs and reset the volume to 1 (100%).
    if (appState.fadeNode && appState.audioCtx) {
      appState.fadeNode.gain.cancelScheduledValues(appState.audioCtx.currentTime);
      appState.fadeNode.gain.setValueAtTime(1, appState.audioCtx.currentTime);
    }
  }

  // Custom playback engine. 
  // We do not use Wavesurfer.play() because HTML5 MediaElements suffer from high latency 
  // and cannot execute mathematically perfect fade envelopes.
  function executePlay(start, end, applyFades = true) {
    const { audioCtx, fadeNode, envelopes, buffer, wavesurfer } = appState;
    if (!audioCtx || !buffer) return;
    
    // Browsers suspend audio contexts until the user interacts with the page.
    if (audioCtx.state === 'suspended') audioCtx.resume();

    const now = audioCtx.currentTime;
    const duration = end - start;

    // Sampler behavior: Triggering a pad immediately chokes (stops) the previous sound.
    stopAudio();

    // Ensure Wavesurfer's internal sluggish player doesn't try to compete with our Web Audio graph.
    wavesurfer.pause();

    // Web Audio API AudioBufferSourceNodes are strictly single-use (one-shot) items.
    // They cannot be paused or restarted. To replay a sound, we must instantiate a brand new node.
    // This is incredibly cheap computationally and guarantees zero latency.
    activeSource = audioCtx.createBufferSource();
    activeSource.buffer = buffer;
    activeSource.connect(fadeNode);

    // AudioParam Automation:
    // We schedule volume changes directly on the audio thread's internal clock (now).
    // This guarantees the fade curves execute with sample-accuracy, completely immune to main-thread UI lag.
    if (applyFades) {
      const fadeInSecs = envelopes.fadeIn / 1000;
      const fadeOutSecs = envelopes.fadeOut / 1000;

      fadeNode.gain.setValueAtTime(0, now);
      fadeNode.gain.linearRampToValueAtTime(1, now + fadeInSecs);

      const fadeOutStartTime = now + duration - fadeOutSecs;
      
      // Safeguard: If the user sets fade durations longer than the slice itself, 
      // prevent the fade-out from overriding the fade-in curve.
      if (fadeOutStartTime > now + fadeInSecs) {
        fadeNode.gain.setValueAtTime(1, fadeOutStartTime);
        fadeNode.gain.linearRampToValueAtTime(0, now + duration);
      } else {
        fadeNode.gain.linearRampToValueAtTime(0, now + duration);
      }
    } else {
      fadeNode.gain.setValueAtTime(1, now);
    }

    // Tell the audio thread to begin reading the buffer at 'start' for exactly 'duration' seconds.
    activeSource.start(now, start, duration);
    appState.isPlaying = true;

    // UI Syncing:
    // Because we bypassed Wavesurfer's playback, its playhead won't move automatically.
    // We use requestAnimationFrame tied to the browser's high-resolution performance clock
    // to smoothly push the visual cursor forward at 60fps without burdening the audio thread.
    const startSysTime = performance.now();
    function animatePlayhead() {
      const elapsed = (performance.now() - startSysTime) / 1000;
      if (elapsed < duration) {
        wavesurfer.setTime(start + elapsed);
        animFrame = requestAnimationFrame(animatePlayhead);
      } else {
        wavesurfer.setTime(start); 
      }
    }
    animatePlayhead();

    // The 'onended' event fires natively when the buffer finishes playing its scheduled duration,
    // allowing us to cleanly reset our UI state and clean up the animation loop.
    activeSource.onended = () => {
      appState.isPlaying = false;
      activeSource = null;
      cancelAnimationFrame(animFrame);
      wavesurfer.setTime(start);
    };
  }

  // Determines which slice of audio to pass to the playback engine based on the active UI state.
  function triggerPlay() {
    if (!appState.wavesurfer || !appState.buffer) return;

    let start, end;
    
    if (appState.appMode === 'trim') {
      start = appState.trimStart;
      end = appState.trimEnd;
    } else {
      const activeSlice = appState.slices.find(s => s.id === appState.activeSliceId);
      if (activeSlice) {
        start = activeSlice.start;
        end = activeSlice.end;
      } else if (appState.slices.length > 0) {
        start = appState.slices[0].start;
        end = appState.slices[0].end;
        appState.activeSliceId = appState.slices[0].id;
      } else {
        start = 0;
        end = appState.duration;
      }
    }
    
    executePlay(start, end, true);
  }

  // Master audition function. Bypasses the slice boundaries and DSP fades to preview the raw file.
  function playAll() {
    if (!appState.wavesurfer || !appState.buffer) return;
    
    if (appState.isPlaying) {
      stopAudio();
    } else {
      executePlay(0, appState.duration, false);
    }
  }

  function handleKeydown(e) {
    if (e.code === 'Space') {
      e.preventDefault(); 
      if (e.shiftKey) {
        playAll();
      } else {
        triggerPlay();
      }
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="transport-container">
  <button 
    class="btn play-all-btn" 
    onclick={playAll}
    disabled={!appState.buffer}
    title="Play All / Stop (Shift + Space)"
  >
    <!-- Dynamic SVG rendering driven by Svelte 5 reactivity on appState.isPlaying -->
    {#if appState.isPlaying}
      <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
        <rect x="5" y="5" width="14" height="14" />
      </svg>
    {:else}
      <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
        <polygon points="4,5 11,12 4,19" />
        <polygon points="11,5 18,12 11,19" />
      </svg>
    {/if}
  </button>

  <button 
    class="btn play-btn" 
    class:active={appState.isPlaying} 
    onclick={triggerPlay}
    disabled={!appState.buffer}
    title="Trigger Selection (Space)"
  >
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
      <polygon points="5,3 19,12 5,21" />
    </svg>
  </button>
</div>

<style>
  .transport-container {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    justify-content: center;
  }

  .btn {
    width: 60px;
    height: 40px;
    background: var(--bg-main);
    color: var(--text-muted);
    border: 2px solid var(--bg-main);
    border-radius: var(--radius-sm);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.1s ease-in-out;
  }

  .btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  .btn:not(:disabled):hover {
    background: var(--bg-panel);
    color: var(--text-main);
  }

  .btn:not(:disabled):active {
    transform: translateY(2px);
  }

  .play-btn.active {
    border-color: var(--accent);
    color: var(--accent);
    background: rgba(var(--accent-rgb), 0.1);
    box-shadow: inset 0 0 8px rgba(var(--accent-rgb), 0.2);
  }
</style>