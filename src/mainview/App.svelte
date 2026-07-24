<script>
  import './theme.css';
  import { appState } from './store.svelte.js';
  import { loadSample, saveSamples } from './io.js';
  import Waveform from './components/Waveform.svelte';
  import Toolbar from './components/Toolbar.svelte';
  import Splash from './components/Splash.svelte';
  import OptionsModal from './components/OptionsModal.svelte';
  import ExportModal from './components/ExportModal.svelte';
  import Toast from './components/Toast.svelte';
  import EffectsRack from './components/EffectsRack.svelte';
  import { renderExport } from './exportEngine.js';
  import { showToast } from './toastState.svelte.js';
  import logoUrlDark from './assets/sopitalogo_dark.svg';
  import logoUrlLight from './assets/sopitalogo_light.svg';

  // Svelte 5 uses runes like $state for local component reactivity.
  // Reassigning these variables will automatically trigger DOM updates where they are used.
  let showExportModal = $state(false);
  let showOptionsModal = $state(false);

  // The $effect rune automatically tracks reactive dependencies used inside it (appState.theme).
  // Whenever the theme changes, this side-effect re-runs to update the root DOM attribute,
  // which instantly toggles all our CSS variables globally.
  $effect(() => {
    document.documentElement.setAttribute('data-theme', appState.theme);
  });

  // Bridges the desktop I/O layer with our reactive state.
  // Once the raw audio file is read from the system, assigning it to appState.rawAudio
  // triggers a cascade of reactivity, hiding the splash screen and initializing Wavesurfer.
  async function handleLoad() {
    const fileData = await loadSample();
    if (fileData) {
      appState.rawAudio = fileData;
    }
  }

  // Orchestrates the offline export pipeline, decoupling DSP processing from file saving.
  // 1. Requests the rendered audio buffers from the DSP engine based on user config.
  // 2. Hands the processed blobs over to the I/O system to write to disk.
  // 3. Triggers global toast notifications to reflect success or failure.
  async function executeExport(config) {
    showExportModal = false;
    
    try {
      const exportedFiles = await renderExport(appState, config);
      const result = await saveSamples(exportedFiles);
      
      if (result) {
        if (result.success) {
          showToast(result.message, 'success');
        } else {
          showToast(result.message, 'error', 5000);
        }
      }
    } catch (error) {
      console.error("Export failed:", error);
      showToast("There was an error rendering the audio.", 'error');
    }
  }
</script>

<main class="app-container">
  <header>
    <div class="logo-container">
      <img class="logo" src={ appState.theme === 'dark' ? logoUrlDark : logoUrlLight} alt="logo" />
      <h1>SOPITA</h1>
    </div>
    <div class="header-actions">

      <button class="btn btn-ghost" onclick={() => showOptionsModal = true}>
        Settings & about
      </button>

      {#if appState.buffer}
        <button class="btn btn-ghost" onclick={handleLoad}>
          Load File
        </button>

        <button class="btn btn-primary" onclick={() => showExportModal = true}>
          {#if appState.appMode === 'trim'}
            EXPORT SAMPLE
          {:else}
            EXPORT SLICES
          {/if}
        </button>
      {/if}
    </div>
  </header>

  <!-- 
    The core view routing of the app is handled via this simple conditional.
    If no audio data exists, we show the generative Splash screen.
    Once loaded, the workspace and signal processing chain mount to the DOM.
  -->
  {#if !appState.rawAudio}
    <Splash onLoad={handleLoad} />
  {:else}
    <div class="workspace">
      <Waveform />
      <Toolbar />
    </div>

    <EffectsRack />
  {/if}
</main>

{#if showExportModal}
  <ExportModal 
    onClose={() => showExportModal = false} 
    onExport={executeExport} 
  />
{/if}

{#if showOptionsModal}
  <OptionsModal onClose={() => showOptionsModal = false} />
{/if}

<Toast />

<style>
  .app-container {
    display: flex;
    flex-direction: column;
    min-height: 100vh;
    padding: 1rem;
    box-sizing: border-box;
    gap: 1rem;
  }

  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: var(--border-strong);
    padding-bottom: 1rem;
    flex-shrink: 0; 
  }

  h1 {
    margin: 0;
    font-family: var(--font-mono);
    font-size: 1.5rem;
    letter-spacing: -0.5px;
  }

  .header-actions {
    display: flex;
    gap: 0.5rem;
  }

  .workspace {
    background: var(--bg-panel);
    border-radius: var(--radius-md);
    display: flex;
    flex-direction: column;
    overflow: hidden; 
    border: var(--border-strong);
  }

  .logo-container {
    display: flex;
    align-items: center;
    gap: 20px;
  }

  .logo {
    width: 50px;
  }
</style>