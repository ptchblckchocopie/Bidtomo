<script lang="ts">
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';
  import { maintenanceStore } from '$lib/stores/maintenance';
  import { authStore } from '$lib/stores/auth';
  import { getGlobalSSE } from '$lib/sse';
  import type { Snippet } from 'svelte';

  const POLL_INTERVAL = 10_000;
  const MIN_INTRO_MS = 2800;

  let { children }: { children: Snippet } = $props();

  // phase: intro → intro-exit (fade out) → maintenance | revealing → healthy
  let phase = $state<'intro' | 'intro-exit' | 'revealing' | 'healthy' | 'maintenance' | 'recovering'>('intro');
  let dotCount = $state(1);
  let introStep = $state(0);

  // Scheduled maintenance countdown
  let scheduledAt = $state<number | null>(null);
  let scheduledMessage = $state('');
  let countdown = $state('');
  let bannerDismissed = $state(false);

  // Track if this is admin-triggered maintenance (so admins can still see the site)
  let isManualMaintenance = $state(false);

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

  async function checkManualMaintenance(): Promise<{ enabled: boolean; scheduledAt: number | null; message: string }> {
    try {
      const res = await fetch('/api/bridge/maintenance');
      if (!res.ok) return { enabled: false, scheduledAt: null, message: '' };
      return await res.json();
    } catch {
      return { enabled: false, scheduledAt: null, message: '' };
    }
  }

  function formatCountdown(ms: number): string {
    if (ms <= 0) return '0:00';
    const totalSec = Math.floor(ms / 1000);
    const hours = Math.floor(totalSec / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    const secs = totalSec % 60;
    if (hours > 0) return `${hours}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    return `${mins}:${String(secs).padStart(2, '0')}`;
  }

  onMount(() => {
    if (!browser) return;

    let disposed = false;
    let pollTimer: ReturnType<typeof setTimeout>;
    let countdownTimer: ReturnType<typeof setInterval>;
    let sseUnsub: (() => void) | null = null;

    const dotTimer = setInterval(() => { dotCount = (dotCount % 3) + 1; }, 500);

    // Staggered intro animation
    setTimeout(() => { if (!disposed) introStep = 1; }, 300);
    setTimeout(() => { if (!disposed) introStep = 2; }, 800);
    setTimeout(() => { if (!disposed) introStep = 3; }, 1400);
    setTimeout(() => { if (!disposed) introStep = 4; }, 1900);

    const introStart = Date.now();

    // Run health check + maintenance status check in parallel
    Promise.all([checkHealth(), checkManualMaintenance()]).then(([healthy, maint]) => {
      if (disposed) return;

      const elapsed = Date.now() - introStart;
      const remaining = Math.max(0, MIN_INTRO_MS - elapsed);

      setTimeout(() => {
        if (disposed) return;

        // Manual maintenance takes priority (unless user is admin)
        const isAdmin = $authStore.user?.role === 'admin';
        if ((maint.enabled && !isAdmin) || !healthy) {
          if (maint.enabled && !isAdmin) isManualMaintenance = true;
          // Smooth crossfade: fade out intro content, then show maintenance
          phase = 'intro-exit';
          setTimeout(() => {
            if (disposed) return;
            phase = 'maintenance';
            startPolling();
          }, 700);
        } else {
          phase = 'revealing';
          setTimeout(() => { if (!disposed) phase = 'healthy'; }, 900);
        }

        // Set scheduled maintenance state
        if (maint.scheduledAt) {
          scheduledAt = maint.scheduledAt;
          scheduledMessage = maint.message;
          startCountdown();
        }

        // Connect to SSE for real-time maintenance events
        connectSSE();
      }, remaining);
    });

    function startPolling() {
      pollTimer = setTimeout(async function poll() {
        if (disposed) return;

        const [healthy, maint] = await Promise.all([checkHealth(), checkManualMaintenance()]);
        if (disposed) return;

        const isAdmin = $authStore.user?.role === 'admin';

        // If manual maintenance was turned off or backend is back
        if (isManualMaintenance && !maint.enabled) {
          isManualMaintenance = false;
          if (healthy) {
            phase = 'recovering';
            setTimeout(() => { if (!disposed) phase = 'healthy'; }, 900);
            return;
          }
        }

        if (!isManualMaintenance && healthy && !maint.enabled) {
          phase = 'recovering';
          setTimeout(() => { if (!disposed) phase = 'healthy'; }, 900);
          return;
        }

        if (maint.enabled && !isAdmin) {
          isManualMaintenance = true;
          phase = 'maintenance';
        }

        pollTimer = setTimeout(poll, POLL_INTERVAL);
      }, POLL_INTERVAL);
    }

    function startCountdown() {
      if (countdownTimer) clearInterval(countdownTimer);
      countdownTimer = setInterval(() => {
        if (!scheduledAt || disposed) {
          clearInterval(countdownTimer);
          return;
        }
        const remaining = scheduledAt - Date.now();
        countdown = formatCountdown(remaining);

        // Auto-trigger maintenance when countdown reaches 0
        if (remaining <= 0) {
          clearInterval(countdownTimer);
          scheduledAt = null;
          const isAdmin = $authStore.user?.role === 'admin';
          if (!isAdmin) {
            isManualMaintenance = true;
            phase = 'maintenance';
            startPolling();
          }
        }
      }, 1000);
    }

    function connectSSE() {
      try {
        const sse = getGlobalSSE();
        sse.connect();
        sseUnsub = sse.subscribe((event: any) => {
          if (event.type === 'maintenance_toggle') {
            maintenanceStore.handleSSE(event);
            const isAdmin = $authStore.user?.role === 'admin';
            if (event.enabled && !isAdmin) {
              isManualMaintenance = true;
              if (phase === 'healthy') {
                phase = 'maintenance';
                startPolling();
              }
            } else if (!event.enabled && isManualMaintenance) {
              isManualMaintenance = false;
              phase = 'recovering';
              setTimeout(() => { if (!disposed) phase = 'healthy'; }, 900);
            }
          } else if (event.type === 'maintenance_scheduled') {
            maintenanceStore.handleSSE(event);
            scheduledAt = event.scheduledAt || null;
            scheduledMessage = event.message || '';
            bannerDismissed = false;
            if (scheduledAt) startCountdown();
          }
        });
      } catch {
        // SSE unavailable — rely on polling
      }
    }

    return () => {
      disposed = true;
      clearTimeout(pollTimer);
      clearInterval(dotTimer);
      clearInterval(countdownTimer);
      if (sseUnsub) sseUnsub();
    };
  });
</script>

{#if phase === 'intro' || phase === 'revealing' || phase === 'intro-exit'}
  <!-- Cinematic intro -->
  <div class="gate" class:gate-reveal={phase === 'revealing'}>
    <div class="intro-glow" class:glow-active={introStep >= 1} aria-hidden="true"></div>
    <div class="intro-glow-ring" class:glow-active={introStep >= 1} aria-hidden="true"></div>

    <div class="intro-content" class:intro-content-exit={phase === 'intro-exit'}>
      <div class="intro-logo" class:logo-visible={introStep >= 0}>
        <img src="/bidmo.to.png" alt="BidMo.to" class="intro-logo-img" />
      </div>

      <h1 class="intro-brand" class:text-visible={introStep >= 2}>
        <span class="intro-letter" style="--i:0">B</span><span class="intro-letter" style="--i:1">i</span><span class="intro-letter" style="--i:2">d</span><span class="intro-letter" style="--i:3">M</span><span class="intro-letter" style="--i:4">o</span><span class="intro-letter" style="--i:5">.</span><span class="intro-letter" style="--i:6">t</span><span class="intro-letter" style="--i:7">o</span>
      </h1>

      <p class="intro-tagline" class:text-visible={introStep >= 3}>
        The Filipino Auction Marketplace
      </p>

      <div class="intro-line" class:line-visible={introStep >= 4} aria-hidden="true"></div>
    </div>

    <div class="intro-particles" class:intro-content-exit={phase === 'intro-exit'} aria-hidden="true">
      {#each Array(6) as _, i}
        <div class="particle" style="--pi:{i}"></div>
      {/each}
    </div>
  </div>
{:else if phase === 'maintenance' || phase === 'recovering'}
  <!-- Maintenance gate -->
  <div class="gate gate-maintenance" class:gate-reveal={phase === 'recovering'}>
    <div class="intro-glow glow-active glow-maintenance" aria-hidden="true"></div>

    <div class="maintenance-content">
      <div class="maintenance-icon" aria-hidden="true">
        <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/>
        </svg>
      </div>

      <h1 class="maint-title">Under Maintenance</h1>
      <p class="maint-subtitle">
        {#if isManualMaintenance}
          We're performing scheduled maintenance{'.'.repeat(dotCount)}
        {:else}
          We're deploying updates. Be right back{'.'.repeat(dotCount)}
        {/if}
      </p>

      <div class="maint-bar" aria-hidden="true">
        <div class="maint-bar-inner"></div>
      </div>

      <p class="maint-note">
        This page will automatically refresh when we're back online.
      </p>
    </div>
  </div>
{:else}
  <!-- Site is live -->
  {@render children()}

  <!-- Scheduled maintenance countdown banner -->
  {#if scheduledAt && !bannerDismissed}
    <div class="countdown-banner" aria-live="polite">
      <div class="countdown-inner">
        <svg class="countdown-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
        <span class="countdown-text">
          Scheduled maintenance in <strong>{countdown}</strong>
          {#if scheduledMessage}
            &mdash; {scheduledMessage}
          {/if}
        </span>
        <button class="countdown-dismiss" onclick={() => { bannerDismissed = true; }} aria-label="Dismiss">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  {/if}
{/if}

<style>
  /* ─── Gate (shared) ─── */
  .gate {
    position: fixed;
    inset: 0;
    z-index: 9990;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #0A0A0A;
    overflow: hidden;
  }

  .gate-reveal {
    animation: gateReveal 0.9s cubic-bezier(0.52, 0.01, 0, 1) forwards;
  }

  @keyframes gateReveal {
    0% { opacity: 1; transform: scale(1); }
    40% { opacity: 1; transform: scale(1.05); }
    100% { opacity: 0; transform: scale(1.15); filter: blur(12px); }
  }

  /* ─── Radial glow ─── */
  .intro-glow {
    position: absolute;
    top: 50%;
    left: 50%;
    width: 500px;
    height: 500px;
    transform: translate(-50%, -50%) scale(0);
    border-radius: 50%;
    background: radial-gradient(circle, rgba(16, 185, 129, 0.12) 0%, rgba(16, 185, 129, 0.04) 40%, transparent 70%);
    transition: transform 1.2s cubic-bezier(0.4, 0, 0.2, 1), opacity 1.2s;
    opacity: 0;
    pointer-events: none;
  }

  .intro-glow.glow-active {
    transform: translate(-50%, -50%) scale(1);
    opacity: 1;
    animation: glowPulse 3s ease-in-out infinite 1.2s;
  }

  .intro-glow.glow-maintenance {
    background: radial-gradient(circle, rgba(16, 185, 129, 0.08) 0%, rgba(16, 185, 129, 0.02) 40%, transparent 70%);
  }

  .intro-glow-ring {
    position: absolute;
    top: 50%;
    left: 50%;
    width: 240px;
    height: 240px;
    transform: translate(-50%, -55%) scale(0);
    border-radius: 50%;
    border: 1px solid rgba(16, 185, 129, 0.08);
    transition: transform 1s cubic-bezier(0.4, 0, 0.2, 1) 0.2s, opacity 1s 0.2s;
    opacity: 0;
    pointer-events: none;
  }

  .intro-glow-ring.glow-active {
    transform: translate(-50%, -55%) scale(1);
    opacity: 1;
    animation: ringPulse 3s ease-in-out infinite 1.5s;
  }

  @keyframes glowPulse {
    0%, 100% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
    50% { transform: translate(-50%, -50%) scale(1.08); opacity: 0.7; }
  }

  @keyframes ringPulse {
    0%, 100% { transform: translate(-50%, -55%) scale(1); opacity: 1; }
    50% { transform: translate(-50%, -55%) scale(1.12); opacity: 0.4; }
  }

  /* ─── Intro content ─── */
  .intro-content {
    position: relative;
    z-index: 2;
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .intro-logo {
    margin-bottom: 1.5rem;
    opacity: 0;
    transform: translateY(20px) scale(0.8);
    animation: logoIn 0.8s cubic-bezier(0.4, 0, 0.2, 1) 0.1s forwards;
  }

  .intro-logo-img {
    height: 80px;
    width: auto;
    filter: drop-shadow(0 0 30px rgba(16, 185, 129, 0.2));
  }

  @keyframes logoIn {
    to { opacity: 1; transform: translateY(0) scale(1); }
  }

  .intro-brand {
    font-family: var(--font-display, 'Outfit', sans-serif);
    font-size: clamp(2.5rem, 6vw, 4rem);
    font-weight: 800;
    letter-spacing: -0.03em;
    color: var(--color-fg, #F5F5F3);
    margin: 0 0 0.75rem;
    overflow: hidden;
  }

  .intro-letter {
    display: inline-block;
    opacity: 0;
    transform: translateY(100%);
    transition: none;
  }

  .text-visible .intro-letter {
    animation: letterUp 0.5s cubic-bezier(0.4, 0, 0.2, 1) calc(var(--i) * 0.06s) forwards;
  }

  @keyframes letterUp {
    to { opacity: 1; transform: translateY(0); }
  }

  .intro-tagline {
    font-family: var(--font-body, 'Inter', sans-serif);
    font-size: clamp(0.875rem, 2vw, 1.1rem);
    color: var(--color-muted-fg, #71717A);
    letter-spacing: 0.04em;
    margin: 0;
    opacity: 0;
    transform: translateY(10px);
    transition: none;
  }

  .intro-tagline.text-visible {
    animation: fadeUp 0.6s cubic-bezier(0.4, 0, 0.2, 1) forwards;
  }

  @keyframes fadeUp {
    to { opacity: 1; transform: translateY(0); }
  }

  .intro-line {
    width: 0;
    height: 2px;
    margin-top: 2rem;
    border-radius: 1px;
    background: linear-gradient(90deg, transparent, var(--color-accent, #10B981), transparent);
    box-shadow: 0 0 12px rgba(16, 185, 129, 0.3);
    transition: width 0.8s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .intro-line.line-visible {
    width: 120px;
  }

  /* ─── Particles ─── */
  .intro-particles {
    position: absolute;
    inset: 0;
    pointer-events: none;
    overflow: hidden;
  }

  .particle {
    position: absolute;
    width: 2px;
    height: 2px;
    border-radius: 50%;
    background: rgba(16, 185, 129, 0.3);
    animation: particleFloat 6s ease-in-out infinite;
    animation-delay: calc(var(--pi) * -1s);
  }

  .particle:nth-child(1) { top: 20%; left: 15%; }
  .particle:nth-child(2) { top: 60%; left: 80%; }
  .particle:nth-child(3) { top: 35%; left: 70%; }
  .particle:nth-child(4) { top: 75%; left: 25%; }
  .particle:nth-child(5) { top: 45%; left: 90%; }
  .particle:nth-child(6) { top: 85%; left: 55%; }

  @keyframes particleFloat {
    0%, 100% { transform: translateY(0) scale(1); opacity: 0; }
    20% { opacity: 0.6; }
    50% { transform: translateY(-40px) scale(1.5); opacity: 0.3; }
    80% { opacity: 0.5; }
  }

  /* ─── Intro exit (smooth crossfade to maintenance) ─── */
  .intro-content-exit {
    animation: introContentExit 0.6s cubic-bezier(0.4, 0, 0.2, 1) forwards;
  }

  @keyframes introContentExit {
    0% { opacity: 1; transform: translateY(0) scale(1); }
    100% { opacity: 0; transform: translateY(-20px) scale(0.97); filter: blur(4px); }
  }

  /* ─── Maintenance ─── */
  .gate-maintenance {
    animation: maintIn 0.7s cubic-bezier(0.4, 0, 0.2, 1);
  }

  @keyframes maintIn {
    0% { opacity: 0; }
    100% { opacity: 1; }
  }

  .maintenance-content {
    position: relative;
    z-index: 2;
    text-align: center;
    max-width: 420px;
    padding: 2rem;
    animation: contentIn 0.6s cubic-bezier(0.4, 0, 0.2, 1) both;
  }

  @keyframes contentIn {
    0% { opacity: 0; transform: translateY(30px) scale(0.95); filter: blur(4px); }
    100% { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
  }

  .maintenance-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 100px;
    height: 100px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.02);
    border: 1px solid rgba(255, 255, 255, 0.05);
    color: var(--color-accent, #10B981);
    margin-bottom: 1.75rem;
    animation: iconPulse 2.5s ease-in-out infinite;
  }

  @keyframes iconPulse {
    0%, 100% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.12); }
    50% { box-shadow: 0 0 0 20px rgba(16, 185, 129, 0); }
  }

  .maint-title {
    font-family: var(--font-display, 'Outfit', sans-serif);
    font-size: clamp(1.5rem, 4vw, 2rem);
    font-weight: 700;
    letter-spacing: -0.02em;
    color: var(--color-fg, #F5F5F3);
    margin: 0 0 0.75rem;
  }

  .maint-subtitle {
    font-family: var(--font-body, 'Inter', sans-serif);
    font-size: 1rem;
    color: var(--color-muted-fg, #71717A);
    line-height: 1.6;
    margin: 0 0 2rem;
    min-width: 280px;
  }

  .maint-bar {
    width: 200px;
    height: 3px;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 2px;
    margin: 0 auto 1.5rem;
    overflow: hidden;
  }

  .maint-bar-inner {
    width: 40%;
    height: 100%;
    background: linear-gradient(90deg, transparent, var(--color-accent, #10B981), transparent);
    border-radius: 2px;
    animation: barSlide 1.5s ease-in-out infinite;
  }

  @keyframes barSlide {
    0% { transform: translateX(-100%); }
    100% { transform: translateX(350%); }
  }

  .maint-note {
    font-family: var(--font-body, 'Inter', sans-serif);
    font-size: 0.75rem;
    color: rgba(255, 255, 255, 0.2);
    letter-spacing: 0.02em;
    margin: 0;
  }

  /* ─── Countdown Banner ─── */
  .countdown-banner {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    z-index: 9980;
    animation: bannerIn 0.4s cubic-bezier(0.4, 0, 0.2, 1);
  }

  @keyframes bannerIn {
    from { transform: translateY(-100%); }
    to { transform: translateY(0); }
  }

  .countdown-inner {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 0.6rem 1rem;
    background: linear-gradient(90deg, rgba(245, 158, 11, 0.12), rgba(245, 158, 11, 0.08), rgba(245, 158, 11, 0.12));
    border-bottom: 1px solid rgba(245, 158, 11, 0.2);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
  }

  .countdown-icon {
    color: #F59E0B;
    flex-shrink: 0;
  }

  .countdown-text {
    font-family: var(--font-body, 'Inter', sans-serif);
    font-size: 0.8rem;
    color: #FBBF24;
    letter-spacing: 0.01em;
  }

  .countdown-text strong {
    font-variant-numeric: tabular-nums;
    font-weight: 700;
  }

  .countdown-dismiss {
    flex-shrink: 0;
    padding: 0.25rem;
    color: rgba(251, 191, 36, 0.5);
    cursor: pointer;
    border-radius: 4px;
    transition: all 150ms;
    background: none;
    border: none;
  }

  .countdown-dismiss:hover {
    color: #FBBF24;
    background: rgba(245, 158, 11, 0.1);
  }
</style>
