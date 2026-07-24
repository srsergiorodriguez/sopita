<script>
  import { toastState } from '../toastState.svelte.js';
</script>

{#if toastState.visible}
  <div class="toast-wrapper">
    <div class="toast toast-{toastState.type}">
      {toastState.message}
    </div>
  </div>
{/if}

<style>
  .toast-wrapper {
    position: fixed;
    bottom: 2rem;
    left: 50%;
    transform: translateX(-50%);
    z-index: 9999;
    pointer-events: none; /* Let clicks pass through to the app */
    animation: slideUpFade 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
  }

  .toast {
    background: var(--bg-main);
    color: var(--text-main);
    border: var(--border-strong);
    padding: 0.75rem 1.5rem;
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-modal);
    font-family: var(--font-mono);
    font-size: 0.85rem;
    letter-spacing: 0.5px;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  
  .toast-success {
    border-bottom: 2px solid var(--accent);
  }

  .toast-error {
    border-bottom: 2px solid var(--accent);
  }

  .toast-info {
    border-bottom: 2px solid var(--text-muted);
  }

  @keyframes slideUpFade {
    0% {
      opacity: 0;
      transform: translateY(20px);
    }
    100% {
      opacity: 1;
      transform: translateY(0);
    }
  }
</style>