<script>
  import { appState } from '../store.svelte.js';
  import Transport from './Transport.svelte';
  import Knob from './Knob.svelte';
</script>

<div class="toolbar">
  <div class="toolbar-left">
    <!-- 
      Mode Toggle:
      1. class:active={condition} is a Svelte directive that dynamically adds the 'active' CSS class if the condition is true.
      2. Because appState is a deeply reactive $state object, mutating it directly via the onclick 
         handler (appState.appMode = 'slice') instantly notifies all other components watching this value. 
         No need for actions, reducers, or set() methods.
    -->
    <div class="mode-toggle">
      <button 
        class="mode-btn" 
        class:active={appState.appMode === 'trim'} 
        onclick={() => appState.appMode = 'trim'}
      >TRIM</button>
      <button 
        class="mode-btn" 
        class:active={appState.appMode === 'slice'} 
        onclick={() => appState.appMode = 'slice'}
      >SLICE</button>
    </div>
    <Transport />
  </div>
  
  <div class="toolbar-right">
    <!-- 
      Conditional UI Rendering:
      This block is dynamically inserted or removed from the DOM based on the active mode.
      When appMode changes to 'trim', this component is completely destroyed, freeing up memory.
    -->
    {#if appState.appMode === 'slice'}
      <!-- 
        Two-Way Binding (bind:value):
        Instead of passing a value down and emitting an event back up, bind:value creates a two-way street.
        When the Knob component internally updates its 'value' prop, Svelte automatically reaches into 
        our global appState and updates transientSensitivity. 
        This immediately triggers the $effect in Waveform.svelte to recalculate the drum slices!
      -->
      <Knob 
        bind:value={appState.transientSensitivity} 
        label="Sensitivity" 
        min={0} 
        max={100} 
        step={1} 
        size={40} 
      />
    {/if}
    
    <Knob 
      bind:value={appState.envelopes.fadeIn} 
      label="Fade In" 
      min={0} 
      max={500} 
      step={2} 
      size={40} 
    />
    <Knob 
      bind:value={appState.envelopes.fadeOut} 
      label="Fade Out" 
      min={0} 
      max={500} 
      step={2} 
      size={40} 
    />
  </div>
</div>

<style>
  .toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.5rem 1rem;
    background: var(--bg-main);
    border-top: 1px solid var(--bg-panel);
  }

  .toolbar-left, .toolbar-right {
    display: flex;
    align-items: center;
    gap: 1.5rem;
  }

  .mode-toggle {
    display: flex;
    background: var(--bg-panel);
    border-radius: var(--radius-md);
    padding: 2px;
    border: 1px solid var(--bg-main);
  }

  .mode-btn {
    background: transparent;
    border: none;
    padding: 0.5rem 1rem;
    font-size: 0.8rem;
    color: var(--text-muted);
    border-radius: var(--radius-sm);
    transition: all 0.1s ease;
    cursor: pointer;
    font-family: var(--font-mono);
  }

  .mode-btn.active {
    background: var(--bg-main);
    color: var(--accent);
  }

  .mode-btn:hover:not(.active) {
    color: var(--text-main);
  }
</style>