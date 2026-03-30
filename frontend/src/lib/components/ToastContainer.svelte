<script lang="ts">
  import { toastStore, dismissToast, type Toast } from '$lib/stores/toast';
  import { fly } from 'svelte/transition';
  import { flip } from 'svelte/animate';

  let toasts: Toast[] = $state([]);

  toastStore.subscribe((value) => {
    toasts = value;
  });

  const icons: Record<Toast['type'], string> = {
    success: 'M5 13l4 4L19 7',
    error: 'M6 18L18 6M6 6l12 12',
    warning: 'M12 9v4m0 4h.01M12 3L2 21h20L12 3z',
    info: 'M13 16h-1v-4h-1m1-4h.01M12 2a10 10 0 110 20 10 10 0 010-20z',
  };

  const colors: Record<Toast['type'], string> = {
    success: 'bg-emerald-600 border-emerald-400',
    error: 'bg-red-600 border-red-400',
    warning: 'bg-amber-600 border-amber-400',
    info: 'bg-blue-600 border-blue-400',
  };
</script>

{#if toasts.length > 0}
  <div class="toast-container" aria-live="polite" aria-atomic="false">
    {#each toasts as toast (toast.id)}
      <div
        class="toast {colors[toast.type]}"
        role="alert"
        transition:fly={{ x: 300, duration: 300 }}
        animate:flip={{ duration: 200 }}
      >
        <svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d={icons[toast.type]} />
        </svg>
        <span class="toast-message">{toast.message}</span>
        <button
          class="toast-close"
          onclick={() => dismissToast(toast.id)}
          aria-label="Dismiss"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
    {/each}
  </div>
{/if}

<style>
  .toast-container {
    position: fixed;
    bottom: 1.5rem;
    right: 1.5rem;
    z-index: 9999;
    display: flex;
    flex-direction: column-reverse;
    gap: 0.5rem;
    max-width: 420px;
    width: calc(100% - 3rem);
    pointer-events: none;
  }

  .toast {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.875rem 1rem;
    border-left: 3px solid;
    border-radius: 6px;
    color: white;
    font-size: 0.875rem;
    font-weight: 500;
    line-height: 1.4;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
    pointer-events: auto;
    backdrop-filter: blur(8px);
  }

  .toast-icon {
    width: 1.25rem;
    height: 1.25rem;
    flex-shrink: 0;
  }

  .toast-message {
    flex: 1;
    min-width: 0;
  }

  .toast-close {
    flex-shrink: 0;
    width: 1.25rem;
    height: 1.25rem;
    background: none;
    border: none;
    color: rgba(255, 255, 255, 0.7);
    cursor: pointer;
    padding: 0;
    transition: color 0.15s;
  }

  .toast-close:hover {
    color: white;
  }

  .toast-close svg {
    width: 100%;
    height: 100%;
  }

  @media (max-width: 480px) {
    .toast-container {
      bottom: 1rem;
      right: 1rem;
      width: calc(100% - 2rem);
    }
  }
</style>
