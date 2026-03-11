<script lang="ts">
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';
  import type { Snippet } from 'svelte';

  const POLL_INTERVAL = 10_000; // 10 seconds

  let { children }: { children: Snippet } = $props();

  // Start as "checking" — user sees nothing until we know the backend status
  let status = $state<'checking' | 'healthy' | 'down'>('checking');
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
      const healthy = await checkHealth();
      if (disposed) return;

      if (healthy) {
        if (status === 'down') {
          // Was down, now recovering — fade out maintenance screen
          fadeOut = true;
          setTimeout(() => {
            if (!disposed) status = 'healthy';
          }, 600);
        } else {
          status = 'healthy';
        }
      } else {
        status = 'down';
        fadeOut = false;
      }

      // Keep polling even when healthy — detect if backend goes down again
      if (!disposed) {
        pollTimer = setTimeout(poll, POLL_INTERVAL);
      }
    }

    // Check immediately — no delay
    poll();

    return () => {
      disposed = true;
      clearTimeout(pollTimer);
      clearInterval(dotTimer);
    };
  });
</script>

{#if status === 'checking'}
  <!-- Brief loading state while we check backend health -->
  <div class="maintenance-gate" aria-live="polite">
    <div class="maintenance-content">
      <div class="loading-logo">
        <img src="/bidmo.to.png" alt="BidMo.to" class="logo-img" />
      </div>
      <div class="pulse-bar" aria-hidden="true">
        <div class="pulse-bar-inner"></div>
      </div>
    </div>
  </div>
{:else if status === 'down'}
  <!-- Backend is down — full maintenance page -->
  <div class="maintenance-gate" class:fade-out={fadeOut} aria-live="assertive">
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
        This page will automatically refresh when we're back online.
      </p>
    </div>
  </div>
{:else}
  <!-- Backend is healthy — render the actual site -->
  {@render children()}
{/if}

<style>
  .maintenance-gate {
    position: fixed;
    inset: 0;
    z-index: 9990;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #0A0A0A;
    animation: gateIn 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .maintenance-gate.fade-out {
    animation: gateOut 0.6s cubic-bezier(0.4, 0, 0.2, 1) forwards;
  }

  @keyframes gateIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  @keyframes gateOut {
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

  /* Loading state — just logo + pulse bar */
  .loading-logo {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 2rem;
  }

  .logo-img {
    height: 48px;
    width: auto;
    opacity: 0.6;
    animation: logoPulse 1.5s ease-in-out infinite;
  }

  @keyframes logoPulse {
    0%, 100% { opacity: 0.4; }
    50% { opacity: 0.8; }
  }

  /* Maintenance state — icon + text */
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
