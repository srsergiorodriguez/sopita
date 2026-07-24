<script>
  import { appState } from '../store.svelte.js';
  import EffectModule from './EffectModule.svelte';
  import Knob from './Knob.svelte';
  import { createEffectNode, updateEffectParameters } from '../dsp.js';

  // Map instance to keep persistent Web Audio node references indexed by unique effect IDs.
  // Storing nodes in a Map keeps DSP node lookup fast during graph rebuilds and parameter updates.
  const audioNodes = new Map();
  let masterGainNode = null;

  // Initial setup effect: Instantiates Web Audio nodes for each effect in state
  // and establishes the initial Web Audio routing graph.
  $effect(() => {
    if (appState.audioCtx && appState.fadeNode && !masterGainNode) {
      masterGainNode = appState.audioCtx.createGain();
      
      // Because createEffectNode is async (due to AudioWorklet module loading),
      // we instantiate nodes sequentially in an async IIFE before building the audio graph.
      (async () => {
        for (const effect of appState.effectsChain) {
          const node = await createEffectNode(appState.audioCtx, effect.type);
          audioNodes.set(effect.id, node);
          updateEffectParameters(node, effect.type, effect.value);
        }

        rebuildAudioGraph();
      })();
    }
  });

  // Parameter synchronization effect:
  // Svelte 5 tracks dependencies dynamically based on what is READ during execution.
  // Because audio nodes build asynchronously, 'node' is undefined on the first pass.
  // We MUST read 'effect.value' unconditionally outside the if(node) check 
  // so Svelte registers it as a dependency and re-runs this block when knobs are turned.
  $effect(() => {
    appState.effectsChain.forEach(effect => {
      // 1. Force the reactive reads unconditionally
      const currentValue = effect.value;
      const currentType = effect.type;
      
      const node = audioNodes.get(effect.id);
      if (node) {
        // 2. Send the tracked values to the DSP engine
        updateEffectParameters(node, currentType, currentValue);
      }
    });
  });

  // Dynamic Audio Graph Builder:
  // Web Audio API requires explicit node-to-node connections. 
  // To toggle effects or reorder the processing chain, we disconnect all existing nodes,
  // filter for active effects, and string them together sequentially:
  // Source (fadeNode) -> Effect 1 -> Effect 2 -> Master Gain -> Audio Destination
  function rebuildAudioGraph() {
    if (!appState.audioCtx || !appState.fadeNode || !masterGainNode) return;

    // Disconnect all existing connections to avoid duplicate audio paths
    audioNodes.forEach(node => {
      try { node.disconnect(); } catch (e) {}
    });
    if (masterGainNode) {
      try { masterGainNode.disconnect(); } catch (e) {}
    }
    try { appState.fadeNode.disconnect(); } catch (e) {}

    const activeEffects = appState.effectsChain.filter(e => e.active);
    let currentNode = appState.fadeNode;

    // Chain each active DSP node in series
    activeEffects.forEach(effect => {
      const dspNode = audioNodes.get(effect.id);
      if (dspNode) {
        currentNode.connect(dspNode);
        currentNode = dspNode;
      }
    });

    // Pipe the final effect into the master gain, then out to system speakers
    currentNode.connect(masterGainNode);
    masterGainNode.connect(appState.audioCtx.destination);
  }

  // Handles UI drag/reorder actions:
  // Re-orders the state array and triggers a graph rebuild to update signal flow.
  function handleMove(fromIndex, toIndex) {
    if (toIndex < 0 || toIndex >= appState.effectsChain.length) return;
    const chain = [...appState.effectsChain];
    const [moved] = chain.splice(fromIndex, 1);
    chain.splice(toIndex, 0, moved);
    
    // Reassigning state in Svelte 5 notifies subscribers of array structure updates
    appState.effectsChain = chain;

    rebuildAudioGraph();
  }

  function handlePowerToggle() {
    rebuildAudioGraph();
  }

  // Reactive master gain synchronization
  $effect(() => {
    if (masterGainNode) {
      masterGainNode.gain.value = appState.envelopes.volume / 100;
    }
  });
</script>

<div class="rack-container">
  <div class="effects-rack">
    {#each appState.effectsChain as effect, index (effect.id)}
      <EffectModule 
        {effect} 
        {index} 
        total={appState.effectsChain.length} 
        onMove={handleMove}
        onChange={handlePowerToggle}
      >
        <Knob 
          bind:value={effect.value} 
          label={effect.type} 
          min={0} 
          max={100}
        />
      </EffectModule>
    {/each}
  </div>

  <div class="master-section">
    <Knob 
      bind:value={appState.envelopes.volume} 
      label="Master Vol" 
      min={0} 
      max={100} 
    />
  </div>
</div>

<style>
  .rack-container {
    display: flex;
    gap: 1rem;
    align-items: stretch;
  }

  .effects-rack {
    background: var(--bg-panel);
    border-radius: var(--radius-md);
    border: var(--border-strong);
    display: flex;
    flex: 1;
    align-items: center;
    justify-content: space-around;
    padding: 1rem;
    gap: 0.5rem;
    overflow-x: auto;
  }

  .master-section {
    background: var(--bg-panel);
    border-radius: var(--radius-md);
    border: var(--border-strong);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem 1.5rem;
  }
</style>