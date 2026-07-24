<script>
  import { appState } from '../store.svelte.js';
  import { saveSamples } from '../io.js';
  import { showToast } from '../toastState.svelte.js';

  // Vite Asset Handling: 
  // The '?raw' suffix is a Vite-specific feature. It tells the bundler to read the file
  // as a plain string instead of trying to parse it as JavaScript or a URL asset.
  // This bundles the documentation directly into your application code.
  import guideContent from '../assets/guide.md?raw';
  import licenseContent from '../assets/licenses.md?raw';

  let { onClose } = $props();

  // State Mutation:
  // Because appState is a deeply reactive $state object, changing this string instantly
  // triggers a re-render in any component reading appState.theme (like the Splash canvas).
  function toggleTheme() {
    appState.theme = appState.theme === 'dark' ? 'light' : 'dark';
  }

  // Generic File Exporter:
  // Blobs (Binary Large Objects) are not just for audio! Here we take the raw Markdown string,
  // encode it into a UTF-8 text Blob, and pass it to the exact same saveSamples() 
  // function we use for WAV files, successfully recycling the IPC bridge.
  async function downloadMarkdown(filename, content) {
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    
    try {
      const result = await saveSamples([{ name: filename, blob }]);
      if (result) {
        if (result.success) {
          showToast(`Successfully exported ${filename}`, 'success');
        } else {
          showToast(result.message, 'error', 5000);
        }
      }
    } catch (error) {
      console.error("Markdown export failed:", error);
      showToast(`Error exporting ${filename}`, 'error');
    }
  }

  function handleDownloadGuide() {
    downloadMarkdown('sopita_guide.md', guideContent);
  }

  function handleDownloadLicenses() {
    downloadMarkdown('sopita_licenses.md', licenseContent);
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="modal-backdrop" onclick={onClose}>
  <div class="modal-container" onclick={(e) => e.stopPropagation()}>
    
    <div class="modal-header">
      <h2>Settings & about</h2>
      <button class="close-btn" onclick={onClose}>×</button>
    </div>

    <div class="modal-body">

      <!-- ABOUT SECTION -->
      <div class="config-group">
        <span class="group-title">About</span>
        <div class="credits-box">
          <h3 class="app-title">SOPITA</h3>
          <p class="app-version">A minimal sample editor</p>
          <p class="app-version">Version 1.0.0-beta</p>
          <p class="app-author">by Sergio Rodríguez Gómez</p>
        </div>
      </div>

      <hr class="divider" />

      <!-- PREFERENCES SECTION -->
      <div class="config-group">
        <span class="group-title">Preferences</span>
        
        <div class="setting-row">
          <label for="theme-toggle">Theme: </label>
          <button id="theme-toggle" class="btn btn-ghost" onclick={toggleTheme}>
            {appState.theme === 'light' ? 'Light' : 'Dark'}
          </button>
        </div>
      </div>

      <hr class="divider" />

      <!-- DOCUMENTATION SECTION -->
      <div class="config-group">
        <span class="group-title">Documentation</span>
        
        <div class="doc-buttons">
          <button class="btn btn-outline" onclick={handleDownloadGuide}>
            Download User Guide (.md)
          </button>
          <button class="btn btn-outline" onclick={handleDownloadLicenses}>
            Download Licenses (.md)
          </button>
        </div>
      </div>

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
    width: 420px;
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
    gap: 0.75rem;
  }

  .group-title {
    font-size: 0.8rem;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    font-family: var(--font-mono);
  }

  .setting-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: var(--bg-panel);
    padding: 0.75rem 1rem;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border-subtle);
  }

  .setting-row label {
    font-size: 0.9rem;
    color: var(--text-main);
  }
  
  .doc-buttons {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .btn-outline {
    background: transparent;
    border: 1px solid var(--border-strong);
    color: var(--text-main);
    padding: 0.5rem;
    border-radius: var(--radius-sm);
    cursor: pointer;
    font-family: var(--font-sans);
    font-size: 0.85rem;
    transition: all 0.1s ease;
  }

  .btn-outline:hover {
    background: var(--bg-panel);
    border-color: var(--text-muted);
  }

  .divider {
    border: none;
    border-top: 1px solid var(--border-subtle);
    margin: 0;
  }

  .credits-box {
    text-align: center;
    padding: 1.5rem;
    background: var(--bg-panel);
    border-radius: var(--radius-sm);
    border: 1px solid var(--border-subtle);
  }

  .app-title {
    margin: 0 0 0.25rem 0;
    font-family: var(--font-mono);
    font-size: 1.25rem;
    color: var(--text-main);
    letter-spacing: -0.5px;
  }

  .app-version {
    margin: 0 0 1rem 0;
    font-size: 0.8rem;
    color: var(--text-muted);
    font-family: var(--font-mono);
  }

  .app-author {
    margin: 0;
    font-size: 0.9rem;
    color: var(--text-main);
  }
</style>