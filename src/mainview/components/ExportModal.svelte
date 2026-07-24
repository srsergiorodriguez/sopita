<script>
  import { appState } from '../store.svelte.js';

  // Svelte 5 explicitly declares incoming component props.
  let { onClose, onExport } = $props();

  // Local Component State:
  // We use $state() here instead of modifying appState directly because we only want 
  // these values to exist temporarily while the modal is open. If the user clicks 'Cancel', 
  // the state is simply destroyed without affecting the rest of the application.
  let preset = $state('standard');
  let layout = $state('separate');
  let sampleRate = $state(44100);
  let bitDepth = $state(16);
  let channels = $state(1); 

  // Reactive State Syncing:
  // This $effect watches the 'preset' variable. Whenever the user changes the dropdown, 
  // this block automatically executes, overwriting the custom parameters to match the preset's hardware specs.
  $effect(() => {
    if (preset === 'standard') {
      sampleRate = 44100;
      bitDepth = 16;
      channels = 1;
      if (layout === 'grid') layout = 'separate';
    } else if (preset === 'modern') {
      sampleRate = 48000;
      bitDepth = 16;
      channels = 1;
      if (layout === 'grid') layout = 'separate';
    } else if (preset === 'lofi12') {
      sampleRate = 12000;
      bitDepth = 16;
      channels = 1;
      layout = 'grid'; 
    } else if (preset === 'tracker') {
      sampleRate = 8000;
      bitDepth = 8;
      channels = 1;
      if (layout === 'grid') layout = 'separate';
    }
  });

  function handleExport() {
    // Packages the finalized local state into an object and passes it back to the parent component (App.svelte)
    onExport({
      preset,
      layout,
      sampleRate,
      bitDepth,
      channels
    });
  }
</script>

<!-- 
  Accessibility ignores: 
  Svelte warns when adding click handlers to non-interactive elements (like a div backdrop) 
  because screen readers might miss them. Since this is just a convenience to close the modal 
  by clicking outside of it, it is safe to suppress the warnings here.
-->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="modal-backdrop" onclick={onClose}>
  <!-- e.stopPropagation() prevents clicks inside the white modal box from bubbling up and triggering the backdrop close event -->
  <div class="modal-container" onclick={(e) => e.stopPropagation()}>
    
    <div class="modal-header">
      <h2>Export Configuration</h2>
      <button class="close-btn" onclick={onClose}>×</button>
    </div>

    <div class="modal-body">
      <!-- TARGET PRESET SECTION -->
      <div class="config-group">
        <label for="preset-select">Target Format</label>
        <!-- bind:value creates a two-way connection. When the user picks an option, the 'preset' variable updates instantly -->
        <select id="preset-select" bind:value={preset} class="ui-select">
          <option value="standard">Standard (44.1kHz, 16-bit, Separate) - Wave Bard, SunVox, Polyend</option>
          <option value="modern">Modern (48kHz, 16-bit, Separate) - SP-404 MK2, Digitakt</option>
          <option value="lofi12">Lofi (12kHz, 16-bit, Grid) - Sonicware Lofi-12</option>
          <option value="tracker">Vintage (8kHz, 8-bit, Separate) - MilkyTracker, Amiga</option>
          <option value="custom">Custom...</option>
        </select>
      </div>

      <!-- CUSTOM PARAMETERS SECTION -->
      <!-- class:disabled applies a CSS class that dims the section and disables pointer events if the user hasn't selected 'Custom' -->
      <div class="custom-params" class:disabled={preset !== 'custom'}>
        <div class="param-row">
          <div class="config-group">
            <label for="sr-select">Sample Rate</label>
            <select id="sr-select" bind:value={sampleRate} disabled={preset !== 'custom'} class="ui-select">
              <option value={48000}>48000 Hz</option>
              <option value={44100}>44100 Hz</option>
              <option value={24000}>24000 Hz</option>
              <option value={12000}>12000 Hz</option>
              <option value={8000}>8000 Hz</option>
            </select>
          </div>
          
          <div class="config-group">
            <label for="bd-select">Bit Depth</label>
            <select id="bd-select" bind:value={bitDepth} disabled={preset !== 'custom'} class="ui-select">
              <option value={8}>8-bit</option>
              <option value={16}>16-bit</option>
              <!-- FIX: Replaced 24-bit with 32-bit Float to match the encoder's capabilities -->
              <option value={32}>32-bit (Float)</option>
            </select>
          </div>

          <div class="config-group">
            <label for="ch-select">Channels</label>
            <select id="ch-select" bind:value={channels} disabled={preset !== 'custom'} class="ui-select">
              <option value={1}>Mono</option>
              <option value={2}>Stereo</option>
            </select>
          </div>
        </div>
      </div>

      <!-- LAYOUT SECTION -->
      <!-- Only renders if the app is currently in slice mode, keeping the UI clean during simple trim operations -->
      {#if appState.appMode === 'slice'}
        <div class="config-group layout-group">
          <span class="group-title">Slice Layout</span> 
          <div class="ui-toggle-bar">
            <!-- 
              bind:group allows multiple radio buttons to share and update a single state variable ('layout'). 
              class:active is used to style the selected button differently. 
            -->
            <label class="ui-toggle-btn" class:active={layout === 'separate'}>
              <input type="radio" bind:group={layout} value="separate" />
              Separate Files
            </label>
            <label class="ui-toggle-btn" class:active={layout === 'grid'}>
              <input type="radio" bind:group={layout} value="grid" />
              Spaced Grid (Single WAV)
            </label>
          </div>
        </div>
      {/if}
    </div>

    <div class="modal-footer">
      <button class="btn btn-ghost" onclick={onClose}>Cancel</button>
      <button class="btn btn-primary" onclick={handleExport}>Render Audio</button>
    </div>

  </div>
</div>

<style>
  .modal-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background: rgba(0, 0, 0, 0.7);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .modal-container {
    width: 480px;
    background: var(--bg-main);
    border: var(--border-strong);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-modal);
    display: flex;
    flex-direction: column;
    font-family: var(--font-sans);
  }

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem 1.5rem;
    border-bottom: var(--border-subtle);
  }

  .modal-header h2 {
    margin: 0;
    font-size: 1.1rem;
    font-family: var(--font-mono);
    color: var(--text-main);
  }

  .close-btn {
    background: transparent;
    border: none;
    color: var(--text-muted);
    font-size: 1.5rem;
    cursor: pointer;
    line-height: 1;
    padding: 0;
  }

  .close-btn:hover {
    color: var(--text-main);
  }

  .modal-body {
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .config-group {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .config-group label,
  .config-group .group-title {
    font-size: 0.8rem;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    font-family: var(--font-mono);
  }

  .param-row {
    display: flex;
    gap: 1rem;
  }

  .param-row .config-group {
    flex: 1;
  }

  .custom-params {
    padding: 1rem;
    background: var(--bg-panel);
    border-radius: var(--radius-sm);
    border: var(--border-subtle);
    transition: opacity 0.2s ease;
  }

  .custom-params.disabled {
    opacity: 0.5;
    pointer-events: none;
  }

  .layout-group {
    margin-top: 0.5rem;
  }

  .modal-footer {
    padding: 1rem 1.5rem;
    background: var(--bg-panel);
    border-top: var(--border-strong);
    border-radius: 0 0 var(--radius-md) var(--radius-md);
    display: flex;
    justify-content: flex-end;
    gap: 1rem;
  }
</style>