<script>
  // Svelte 5 consolidates all component inputs into the $props() rune.
  // This cleanly extracts standard data (effect, index), event callbacks (onMove, onChange),
  // and even the inner HTML content (children) into local variables.
  let { effect, index, total, onMove, onChange, children } = $props();

  // Routing handlers: Prevent out-of-bounds array manipulation by checking against the total length.
  function moveLeft() {
    if (index > 0) onMove(index, index - 1);
  }

  function moveRight() {
    if (index < total - 1) onMove(index, index + 1);
  }
</script>

<!-- 
  Dynamic Class Directive: class:active={condition} 
  Automatically toggles the 'active' CSS class based on the module's power state, 
  dimming the entire container when bypassed.
-->
<div class="effect-module" class:active={effect.active}>
  
  <div class="module-knob">
    <!-- 
      Snippet Rendering:
      Svelte 5 replaces the old <slot /> architecture with snippets. 
      The <Knob> component we wrote between the <EffectModule> tags in the parent file 
      is passed down as the 'children' function, which we explicitly render here.
    -->
    {@render children()}
  </div>

  <!-- Bottom Bar: Routing & Power Toggle -->
  <div class="module-footer">
    <button class="arrow-btn" onclick={moveLeft} disabled={index === 0}>‹</button>
    
    <!--
      State Mutation:
      Because 'effect' is a reference to an object inside our globally reactive appState array,
      mutating 'effect.active' directly here instantly updates the global state and triggers
      the DSP graph rebuild in the parent component.
    -->
    <button 
      class="power-btn" 
      class:is-on={effect.active} 
      onclick={() => { effect.active = !effect.active; onChange(); }}
    >
      {effect.active ? 'ON' : 'OFF'}
    </button>
    
    <button class="arrow-btn" onclick={moveRight} disabled={index === total - 1}>›</button>
  </div>
</div>

<style>
  .effect-module {
    background: var(--bg-main);
    border: var(--border-strong);
    border-radius: var(--radius-md);
    display: flex;
    flex-direction: column;
    width: 120px;
    transition: all 0.2s ease;
    /* Defaults to a dimmed state to visually indicate when the DSP node is bypassed */
    opacity: 0.6;
  }

  .effect-module.active {
    opacity: 1;
    border-color: var(--text-muted);
  }

  .module-knob {
    padding: 1.5rem 0 1rem 0; 
    display: flex;
    justify-content: center;
  }

  .module-footer {
    border-top: var(--border-subtle);
    display: flex;
    align-items: center;
    background: rgba(0,0,0,0.2);
  }

  .arrow-btn {
    background: transparent;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    font-size: 1.2rem;
    padding: 0.25rem 0.5rem;
    line-height: 1;
  }

  .arrow-btn:disabled {
    opacity: 0.2;
    cursor: default;
  }

  .arrow-btn:hover:not(:disabled) {
    color: var(--text-main);
  }

  .power-btn {
    flex: 1;
    background: transparent;
    border: none;
    padding: 0.5rem;
    font-family: var(--font-mono);
    font-size: 0.75rem;
    color: var(--text-muted);
    cursor: pointer;
    transition: all 0.1s ease;
    border-left: var(--border-subtle);
    border-right: var(--border-subtle);
  }

  .power-btn.is-on {
    background: rgba(var(--accent-rgb), 0.1);
    color: var(--accent);
  }
</style>