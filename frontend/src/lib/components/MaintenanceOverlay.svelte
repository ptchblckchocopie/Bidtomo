<script lang="ts">
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';
  import type { Snippet } from 'svelte';

  const POLL_INTERVAL = 10_000;
  const MIN_INTRO_MS = 2800; // Minimum intro duration so animation completes

  let { children }: { children: Snippet } = $props();

  // phase: intro → revealing/maintenance → healthy
  let phase = $state<'intro' | 'revealing' | 'healthy' | 'maintenance' | 'recovering'>('intro');
  let dotCount = $state(1);
  let introStep = $state(0); // 0=logo, 1=text, 2=tagline, 3=line

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

    // Dot animation for maintenance
    const dotTimer = setInterval(() => { dotCount = (dotCount % 3) + 1; }, 500);

    // Staggered intro animation steps
    setTimeout(() => { if (!disposed) introStep = 1; }, 300);  // logo glow
    setTimeout(() => { if (!disposed) introStep = 2; }, 800);  // brand text
    setTimeout(() => { if (!disposed) introStep = 3; }, 1400); // tagline
    setTimeout(() => { if (!disposed) introStep = 4; }, 1900); // accent line

    const introStart = Date.now();

    // Run health check in parallel with intro animation
    checkHealth().then(healthy => {
      if (disposed) return;

      const elapsed = Date.now() - introStart;
      const remaining = Math.max(0, MIN_INTRO_MS - elapsed);

      setTimeout(() => {
        if (disposed) return;
        if (healthy) {
          phase = 'revealing';
          setTimeout(() => { if (!disposed) phase = 'healthy'; }, 900);
        } else {
          phase = 'maintenance';
          startPolling();
        }
      }, remaining);
    });

    function startPolling() {
      pollTimer = setTimeout(async function poll() {
        if (disposed) return;
        const healthy = await checkHealth();
        if (disposed) return;

        if (healthy) {
          phase = 'recovering';
          setTimeout(() => { if (!disposed) phase = 'healthy'; }, 900);
        } else {
          pollTimer = setTimeout(poll, POLL_INTERVAL);
        }
      }, POLL_INTERVAL);
    }

    return () => {
      disposed = true;
      clearTimeout(pollTimer);
      clearInterval(dotTimer);
    };
  });
</script>

{#if phase === 'intro' || phase === 'revealing'}
  <!-- Cinematic intro -->
  <div class="gate" class:gate-reveal={phase === 'revealing'}>
    <!-- Radial glow behind logo -->
    <div class="intro-glow" class:glow-active={introStep >= 1} aria-hidden="true"></div>
    <div class="intro-glow-ring" class:glow-active={introStep >= 1} aria-hidden="true"></div>

    <div class="intro-content">
      <!-- Logo -->
      <div class="intro-logo" class:logo-visible={introStep >= 0}>
        <img src="/bidmo.to.png" alt="BidMo.to" class="intro-logo-img" />
      </div>

      <!-- Brand name -->
      <h1 class="intro-brand" class:text-visible={introStep >= 2}>
        <span class="intro-letter" style="--i:0">B</span><span class="intro-letter" style="--i:1">i</span><span class="intro-letter" style="--i:2">d</span><span class="intro-letter" style="--i:3">M</span><span class="intro-letter" style="--i:4">o</span><span class="intro-letter" style="--i:5">.</span><span class="intro-letter" style="--i:6">t</span><span class="intro-letter" style="--i:7">o</span>
      </h1>

      <!-- Tagline -->
      <p class="intro-tagline" class:text-visible={introStep >= 3}>
        The Filipino Auction Marketplace
      </p>

      <!-- Accent line -->
      <div class="intro-line" class:line-visible={introStep >= 4} aria-hidden="true"></div>
    </div>

    <!-- Subtle particles -->
    <div class="intro-particles" aria-hidden="true">
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
        We're deploying updates. Be right back{'.'.repeat(dotCount)}
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
  {@render children()}
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

  /* Logo image */
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

  /* Brand name — letter by letter */
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

  /* Tagline */
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

  /* Accent line */
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

  /* ─── Maintenance ─── */
  .gate-maintenance {
    animation: maintIn 0.6s cubic-bezier(0.4, 0, 0.2, 1);
  }

  @keyframes maintIn {
    from { opacity: 0; }
    to { opacity: 1; }
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
    from { opacity: 0; transform: translateY(20px) scale(0.97); }
    to { opacity: 1; transform: translateY(0) scale(1); }
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
</style>
