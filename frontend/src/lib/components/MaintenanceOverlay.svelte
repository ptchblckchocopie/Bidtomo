<script lang="ts">
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';

  const POLL_INTERVAL = 10_000; // 10 seconds
  const INITIAL_DELAY = 3_000; // Wait 3s before first check (give backend a chance)

  let isDown = $state(false);
  let isChecking = $state(false);
  let fadeOut = $state(false);
  let dotCount = $state(1);

  async function checkHealth(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      const res = await fetch('/api/bridge/health', { signal: controller.signal });
      clearTimeout(timeout);
      if (!res.ok) return false;
      const data = await res.json();
      return data.status === 'ok';
    } catch {
      return false;
    }
  }

  onMount(() => {
    if (!browser) return;

    let disposed = false;
    let pollTimer: ReturnType<typeof setTimeout>;
    let dotTimer: ReturnType<typeof setInterval>;

    // Animate the dots
    dotTimer = setInterval(() => {
      dotCount = (dotCount % 3) + 1;
    }, 500);

    async function poll() {
      if (disposed) return;
      isChecking = true;
      const healthy = await checkHealth();
      isChecking = false;
      if (disposed) return;

      if (healthy && isDown) {
        // Backend is back — fade out
        fadeOut = true;
        setTimeout(() => {
          if (!disposed) isDown = false;
        }, 600);
      } else if (!healthy) {
        isDown = true;
        fadeOut = false;
      }

      if (!disposed) {
        pollTimer = setTimeout(poll, POLL_INTERVAL);
      }
    }

    // Delay initial check so we don't flash the overlay on normal page loads
    const initialTimer = setTimeout(poll, INITIAL_DELAY);

    return () => {
      disposed = true;
      clearTimeout(initialTimer);
      clearTimeout(pollTimer);
      clearInterval(dotTimer);
    };
  });
</script>

{#if isDown}
  <div class="maintenance-overlay" class:fade-out={fadeOut} aria-live="assertive">
    <div class="maintenance-content">
      <!-- Animated wrench icon -->
      <div class="maintenance-icon" aria-hidden="true">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/>
        </svg>
      </div>

      <h1 class="maintenance-title">Under Maintenance</h1>
      <p class="maintenance-subtitle">
        We're deploying an update. Be right back{'.'.repeat(dotCount)}
      </p>

      <!-- Pulse bar -->
      <div class="pulse-bar" aria-hidden="true">
        <div class="pulse-bar-inner"></div>
      </div>

      <p class="maintenance-note">
        This page will automatically reload when the server is back online.
      </p>
    </div>
  </div>
{/if}

<style>
  .maintenance-overlay {
    position: fixed;
    inset: 0;
    z-index: 9990;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(10, 10, 10, 0.97);
    backdrop-filter: blur(30px);
    -webkit-backdrop-filter: blur(30px);
    animation: overlayIn 0.4s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .maintenance-overlay.fade-out {
    animation: overlayOut 0.6s cubic-bezier(0.4, 0, 0.2, 1) forwards;
  }

  @keyframes overlayIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  @keyframes overlayOut {
    from { opacity: 1; }
    to { opacity: 0; }
  }

  .maintenance-content {
    text-align: center;
    max-width: 420px;
    padding: 2rem;
    animation: contentIn 0.5s cubic-bezier(0.4, 0, 0.2, 1) 0.1s both;
  }

  @keyframes contentIn {
    from { opacity: 0; transform: translateY(16px) scale(0.97); }
    to { opacity: 1; transform: translateY(0) scale(1); }
  }

  .maintenance-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 96px;
    height: 96px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.06);
    color: var(--color-accent, #10B981);
    margin-bottom: 1.5rem;
    animation: iconPulse 2s ease-in-out infinite;
  }

  @keyframes iconPulse {
    0%, 100% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.15); }
    50% { box-shadow: 0 0 0 16px rgba(16, 185, 129, 0); }
  }

  .maintenance-title {
    font-family: var(--font-display, 'Outfit', sans-serif);
    font-size: 1.75rem;
    font-weight: 700;
    letter-spacing: -0.02em;
    color: var(--color-fg, #F5F5F3);
    margin-bottom: 0.75rem;
  }

  .maintenance-subtitle {
    font-family: var(--font-body, 'Inter', sans-serif);
    font-size: 1rem;
    color: var(--color-muted-fg, #71717A);
    line-height: 1.6;
    margin-bottom: 2rem;
    min-width: 280px;
  }

  .pulse-bar {
    width: 200px;
    height: 3px;
    background: rgba(255, 255, 255, 0.06);
    border-radius: 2px;
    margin: 0 auto 1.5rem;
    overflow: hidden;
  }

  .pulse-bar-inner {
    width: 40%;
    height: 100%;
    background: linear-gradient(90deg, transparent, var(--color-accent, #10B981), transparent);
    border-radius: 2px;
    animation: pulseSlide 1.5s ease-in-out infinite;
  }

  @keyframes pulseSlide {
    0% { transform: translateX(-100%); }
    100% { transform: translateX(350%); }
  }

  .maintenance-note {
    font-family: var(--font-body, 'Inter', sans-serif);
    font-size: 0.75rem;
    color: rgba(255, 255, 255, 0.25);
    letter-spacing: 0.02em;
  }
</style>
