<script lang="ts">
  import { authStore } from '$lib/stores/auth';
  import { t } from '$lib/stores/locale';
  import GlowingEffect from '$lib/components/GlowingEffect.svelte';
  import ScrollReveal from '$lib/components/ScrollReveal.svelte';
  import MagneticButton from '$lib/components/MagneticButton.svelte';
  import { onMount } from 'svelte';

  let mounted = $state(false);
  let heroTextEl: HTMLElement;

  // Animated counters
  let countFree = $state(0);
  let countSafe = $state(0);
  let countBeta = $state(0);
  let countersTriggered = false;

  function animateCounter(target: number, setter: (n: number) => void, duration: number = 1500) {
    const start = performance.now();
    function step(now: number) {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
      setter(Math.round(target * eased));
      if (progress < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  onMount(() => {
    setTimeout(() => mounted = true, 100);
  });
</script>

<svelte:head>
  <title>About Us - BidMo.to</title>
  <meta name="description" content="Learn about BidMo.to - The Filipino way to bid, buy, and sell unique items. Join our experimental auction platform and help us grow!">
  <meta property="og:title" content="About Us - BidMo.to">
  <meta property="og:description" content="The Filipino way to bid, buy, and sell unique items.">
</svelte:head>

<div class="about-fullwidth">
  <!-- Hero Section — Cinematic full-width -->
  <section class="about-hero relative overflow-hidden px-4 sm:px-6 lg:px-8 py-20 sm:py-28 lg:py-36">
    <!-- Radial gradient overlay -->
    <div class="hero-gradient" aria-hidden="true"></div>

    <div class="max-w-5xl mx-auto relative z-10">

      <h1 bind:this={heroTextEl} class="text-5xl md:text-7xl lg:text-8xl font-bold mb-6 text-center font-display tracking-tighter hero-element hero-text" style="animation-delay: 0.15s;">
        {$t('hero.welcomeTo')}
        <span class="relative inline-block">
          BidMo.to
          <span class="hero-underline"></span>
        </span>
      </h1>

      <p class="text-lg sm:text-xl lg:text-2xl mb-4 opacity-90 text-center max-w-3xl mx-auto hero-element hero-text" style="animation-delay: 0.3s;">
        {$t('hero.tagline')}
      </p>

      <p class="text-base sm:text-lg mb-12 opacity-50 max-w-2xl mx-auto text-center hero-element hero-text" style="animation-delay: 0.4s;">
        {$t('hero.subtitle')}
      </p>

      <!-- CTA buttons -->
      <div class="flex flex-col sm:flex-row gap-4 justify-center mb-16 hero-element" style="animation-delay: 0.5s;">
        <MagneticButton href="/products" class="btn-bh-red text-base sm:text-lg !px-8 !py-3.5" strength={0.2}>
          {#snippet children()}{$t('hero.browseAuctions')}{/snippet}
        </MagneticButton>
        {#if $authStore.isAuthenticated}
          <MagneticButton href="/sell" class="btn-bh text-base sm:text-lg !px-8 !py-3.5 hero-outline-btn" strength={0.2}>
            {#snippet children()}{$t('hero.listAnItem')}{/snippet}
          </MagneticButton>
        {:else}
          <MagneticButton href="/register" class="btn-bh text-base sm:text-lg !px-8 !py-3.5 hero-outline-btn" strength={0.2}>
            {#snippet children()}{$t('hero.joinBeta')}{/snippet}
          </MagneticButton>
        {/if}
      </div>

      <!-- Stats row -->
      <div class="flex flex-wrap justify-center gap-0 hero-element" style="animation-delay: 0.6s;">
        <div class="stat-item text-center px-8 sm:px-12">
          <div class="text-xs uppercase tracking-widest opacity-40 mb-1 font-mono">{$t('hero.cost')}</div>
          <div class="text-2xl sm:text-3xl font-bold tracking-tight text-shimmer">{$t('hero.free')}</div>
        </div>
        <div class="stat-divider"></div>
        <div class="stat-item text-center px-8 sm:px-12">
          <div class="text-xs uppercase tracking-widest opacity-40 mb-1 font-mono">{$t('hero.risk')}</div>
          <div class="text-2xl sm:text-3xl font-bold tracking-tight text-shimmer">{$t('hero.safe')}</div>
        </div>
        <div class="stat-divider"></div>
        <div class="stat-item text-center px-8 sm:px-12">
          <div class="text-xs uppercase tracking-widest opacity-40 mb-1 font-mono">{$t('hero.stage')}</div>
          <div class="text-2xl sm:text-3xl font-bold tracking-tight text-shimmer">{$t('hero.beta')}</div>
        </div>
      </div>
    </div>

    <!-- Scroll indicator -->
    <div class="scroll-indicator hero-element" style="animation-delay: 0.8s;" aria-hidden="true">
      <div class="scroll-dot"></div>
    </div>
  </section>

  <!-- How It Works -->
  <section class="px-4 sm:px-6 lg:px-8 py-20 sm:py-24 lg:py-28 section-border">
    <div class="max-w-7xl mx-auto">
      <ScrollReveal>
        <div class="text-center mb-16">
          <span class="label-bh block mb-3">{$t('about.theProcess')}</span>
          <h2 class="font-display tracking-tighter text-3xl sm:text-4xl lg:text-5xl">{$t('about.howItWorks')}</h2>
          <p class="mt-4 text-lg opacity-50">{$t('about.howItWorksSubtitle')}</p>
          <div class="accent-line mx-auto mt-6"></div>
        </div>
      </ScrollReveal>

      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {#each [
          { num: '01', title: $t('about.step1Title'), desc: $t('about.step1Desc'), icon: '&#9733;' },
          { num: '02', title: $t('about.step2Title'), desc: $t('about.step2Desc'), icon: '&#9776;' },
          { num: '03', title: $t('about.step3Title'), desc: $t('about.step3Desc'), icon: '&#9889;' },
          { num: '04', title: $t('about.step4Title'), desc: $t('about.step4Desc'), icon: '&#9829;' }
        ] as step, i}
          <ScrollReveal delay={i * 100} direction="up">
            <div class="glow-card relative rounded-2xl border border-[rgba(255,255,255,0.06)] p-1.5 h-full">
              <GlowingEffect spread={40} glow={true} disabled={false} proximity={64} inactiveZone={0.01} borderWidth={3} />
              <div class="relative card-bh p-6 sm:p-8 text-center group rounded-xl !border-0 shimmer-hover h-full">
                <div class="step-number">{step.num}</div>
                <div class="text-2xl mb-4 group-hover:scale-125 transition-transform duration-500">{@html step.icon}</div>
                <h3 class="font-display tracking-tight text-lg sm:text-xl mb-3">{step.title}</h3>
                <p class="text-sm sm:text-base opacity-50">{step.desc}</p>
              </div>
            </div>
          </ScrollReveal>
        {/each}
      </div>

      <!-- Connection lines between steps (desktop only) -->
      <div class="hidden lg:flex justify-center mt-6 gap-0">
        {#each [0, 1, 2] as _, i}
          <div class="connection-line" style="animation-delay: {0.5 + i * 0.2}s;"></div>
        {/each}
      </div>
    </div>
  </section>

  <!-- Features Section -->
  <section class="px-4 sm:px-6 lg:px-8 py-20 sm:py-24 lg:py-28 section-border">
    <div class="max-w-7xl mx-auto">
      <ScrollReveal>
        <div class="text-center mb-16">
          <span class="label-bh block mb-3">{$t('about.features')}</span>
          <h2 class="font-display tracking-tighter text-3xl sm:text-4xl lg:text-5xl">{$t('about.whatWereBuilding')}</h2>
          <p class="mt-4 text-lg opacity-50">{$t('about.featuresSubtitle')}</p>
          <div class="accent-line mx-auto mt-6"></div>
        </div>
      </ScrollReveal>

      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {#each [
          { icon: '&#9734;', title: $t('about.liveBidding'), desc: $t('about.liveBiddingDesc'), status: 'live' },
          { icon: '&#9993;', title: $t('about.directMessaging'), desc: $t('about.directMessagingDesc'), status: 'live' },
          { icon: '&#9783;', title: $t('about.priceAnalytics'), desc: $t('about.priceAnalyticsDesc'), status: 'live' },
          { icon: '&#128269;', title: $t('about.smartSearch'), desc: $t('about.smartSearchDesc'), status: 'live' },
          { icon: '&#9744;', title: $t('about.paymentIntegration'), desc: $t('about.paymentIntegrationDesc'), status: 'coming' },
          { icon: '&#9745;', title: $t('about.buyerProtection'), desc: $t('about.buyerProtectionDesc'), status: 'coming' }
        ] as feature, i}
          <ScrollReveal delay={i * 80} direction="up">
            <div class="glow-card relative rounded-2xl border border-[rgba(255,255,255,0.06)] p-1.5 h-full">
              <GlowingEffect spread={40} glow={true} disabled={false} proximity={64} inactiveZone={0.01} borderWidth={3} />
              <div class="relative card-bh p-8 text-center group rounded-xl !border-0 shimmer-hover h-full">
                <div class="text-3xl mb-4 group-hover:scale-125 transition-all duration-500 group-hover:drop-shadow-[0_0_8px_rgba(100,140,200,0.3)]">{@html feature.icon}</div>
                <h3 class="font-display tracking-tight text-xl mb-3">{feature.title}</h3>
                <p class="opacity-50 mb-4 text-sm sm:text-base">{feature.desc}</p>
                <span class="feature-badge" class:live={feature.status === 'live'} class:coming={feature.status === 'coming'}>
                  {#if feature.status === 'live'}
                    <span class="live-dot"></span>
                  {/if}
                  {feature.status === 'live' ? $t('about.liveNow') : $t('about.comingSoon')}
                </span>
              </div>
            </div>
          </ScrollReveal>
        {/each}
      </div>
    </div>
  </section>

  <!-- Why Join Section — Cinematic inverted -->
  <section class="about-inverted-section px-4 sm:px-6 lg:px-8 py-20 sm:py-24 lg:py-28">
    <div class="max-w-5xl mx-auto">
      <ScrollReveal>
        <div class="text-center mb-16">
          <span class="label-bh block mb-3 !opacity-50">{$t('about.joinUs')}</span>
          <h2 class="text-3xl sm:text-4xl lg:text-5xl font-bold font-display tracking-tighter">{$t('about.whyJoinBeta')}</h2>
          <div class="accent-line mx-auto mt-6"></div>
        </div>
      </ScrollReveal>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {#each [
          { title: $t('about.shapeFuture'), desc: $t('about.shapeFutureDesc') },
          { title: $t('about.betaBenefits'), desc: $t('about.betaBenefitsDesc') },
          { title: $t('about.buildCommunity'), desc: $t('about.buildCommunityDesc') },
          { title: $t('about.growWithUs'), desc: $t('about.growWithUsDesc') }
        ] as benefit, i}
          <ScrollReveal delay={i * 100} direction={i % 2 === 0 ? 'left' : 'right'}>
            <div class="glow-card relative rounded-2xl border border-[rgba(255,255,255,0.06)] p-1.5 h-full">
              <GlowingEffect spread={40} glow={true} disabled={false} proximity={64} inactiveZone={0.01} borderWidth={3} />
              <div class="benefit-card relative p-8 transition-all duration-300 rounded-xl !border-0 h-full">
                <div class="flex items-start gap-4">
                  <span class="benefit-number">{String(i + 1).padStart(2, '0')}</span>
                  <div>
                    <h3 class="text-xl sm:text-2xl font-bold mb-2 tracking-tight">{benefit.title}</h3>
                    <p class="opacity-60 text-sm sm:text-base leading-relaxed">{benefit.desc}</p>
                  </div>
                </div>
              </div>
            </div>
          </ScrollReveal>
        {/each}
      </div>
    </div>
  </section>

  <!-- Final CTA -->
  <section class="about-cta-section relative overflow-hidden px-4 sm:px-6 lg:px-8 py-20 sm:py-24 lg:py-28 text-center section-border-top">
    <!-- Radial glow -->
    <div class="cta-glow" aria-hidden="true"></div>

    <div class="max-w-4xl mx-auto relative z-10">
      <ScrollReveal>
        <span class="label-bh block mb-4 !opacity-50">{$t('about.getStarted')}</span>
        <h2 class="font-display tracking-tighter text-3xl sm:text-4xl lg:text-5xl mb-6">{$t('about.readyToBid')}</h2>
        <p class="text-lg sm:text-xl mb-12 opacity-50">{$t('about.readyToBidSubtitle')}</p>

        <div class="flex flex-col sm:flex-row gap-4 justify-center">
          {#if $authStore.isAuthenticated}
            <MagneticButton href="/products" class="btn-bh-red text-lg sm:text-xl !px-10 !py-4" strength={0.15}>
              {#snippet children()}{$t('about.startBrowsing')}{/snippet}
            </MagneticButton>
            <MagneticButton href="/sell" class="btn-bh text-lg sm:text-xl !px-10 !py-4" strength={0.15}>
              {#snippet children()}{$t('about.listYourFirstItem')}{/snippet}
            </MagneticButton>
          {:else}
            <MagneticButton href="/register" class="btn-bh-red text-lg sm:text-xl !px-10 !py-4" strength={0.15}>
              {#snippet children()}{$t('about.joinBetaNow')}{/snippet}
            </MagneticButton>
            <MagneticButton href="/products" class="btn-bh text-lg sm:text-xl !px-10 !py-4" strength={0.15}>
              {#snippet children()}{$t('about.browseFirst')}{/snippet}
            </MagneticButton>
          {/if}
        </div>
      </ScrollReveal>
    </div>
  </section>
</div>

<style>
  /* Break out of the constrained max-w-6xl <main> container */
  .about-fullwidth {
    width: 100vw;
    margin-left: calc(50% - 50vw);
  }

  /* Hero — transparent in dark mode, content over Three.js bg */
  .about-hero {
    background: transparent;
    color: var(--color-fg);
  }

  /* Text shadow for readability over laser */
  .hero-text {
    text-shadow: 0 2px 20px rgba(0, 0, 0, 0.8), 0 0 40px rgba(0, 0, 0, 0.6);
  }

  /* Radial gradient overlay for hero depth */
  .hero-gradient {
    position: absolute;
    inset: 0;
    background: radial-gradient(ellipse at center, transparent 30%, rgba(10, 10, 10, 0.4) 100%);
    pointer-events: none;
  }

  .about-hero :global(.btn-bh-red) {
    background: var(--color-fg);
    color: var(--color-bg);
  }

  .hero-outline-btn {
    border-color: var(--color-border) !important;
    color: var(--color-fg) !important;
  }
  .hero-outline-btn:hover {
    background: var(--color-surface-hover) !important;
  }

  /* Hero elements staggered entrance */
  .hero-element {
    opacity: 0;
    transform: translateY(25px);
    animation: heroIn 0.7s cubic-bezier(0.4, 0, 0.2, 1) forwards;
  }

  @keyframes heroIn {
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  /* Hero underline */
  .hero-underline {
    position: absolute;
    bottom: 0.05em;
    left: 0;
    right: 0;
    height: 4px;
    background: var(--color-accent);
    transform-origin: left;
    animation: underlineReveal 0.8s cubic-bezier(0.52, 0.01, 0, 1) 0.8s forwards;
    transform: scaleX(0);
    border-radius: 2px;
    box-shadow: 0 0 12px var(--color-accent), 0 0 24px rgba(16, 185, 129, 0.3);
  }

  /* Stat dividers */
  .stat-divider {
    width: 1px;
    height: 40px;
    background: currentColor;
    opacity: 0.1;
    align-self: center;
  }

  /* Scroll indicator */
  .scroll-indicator {
    position: absolute;
    bottom: 2rem;
    left: 50%;
    transform: translateX(-50%);
    width: 24px;
    height: 40px;
    border: 1.5px solid rgba(255, 255, 255, 0.2);
    border-radius: 12px;
    display: flex;
    justify-content: center;
    padding-top: 6px;
  }
  .scroll-dot {
    width: 3px;
    height: 8px;
    background: var(--color-fg);
    border-radius: 2px;
    animation: scrollPulse 2s ease-in-out infinite;
  }

  @keyframes scrollPulse {
    0%, 100% { opacity: 0.3; transform: translateY(0); }
    50% { opacity: 1; transform: translateY(8px); }
  }

  /* Step number badge */
  .step-number {
    font-family: var(--font-mono);
    font-size: 0.65rem;
    font-weight: 700;
    opacity: 0.3;
    margin-bottom: 1.25rem;
    letter-spacing: 0.1em;
  }

  /* Connection lines between steps */
  .connection-line {
    width: 120px;
    height: 1px;
    background: linear-gradient(90deg, transparent, var(--color-accent), transparent);
    opacity: 0;
    animation: lineReveal 0.6s cubic-bezier(0.4, 0, 0.2, 1) forwards;
  }

  @keyframes lineReveal {
    to { opacity: 0.3; }
  }

  /* Section borders */
  .section-border {
    border-bottom: 1px solid var(--color-border);
  }
  .section-border-top {
    border-top: 1px solid var(--color-border);
  }

  /* Feature badge */
  .feature-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-family: var(--font-mono);
    font-size: 0.7rem;
    font-weight: 600;
    padding: 4px 12px;
    border-radius: var(--radius-sm);
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }
  .feature-badge.live {
    background: color-mix(in srgb, var(--color-green) 10%, transparent);
    color: var(--color-green);
    border: 1px solid color-mix(in srgb, var(--color-green) 30%, transparent);
  }
  .feature-badge.coming {
    background: color-mix(in srgb, var(--color-fg) 5%, transparent);
    color: var(--color-muted-fg);
    border: 1px solid var(--color-border);
  }

  /* Live dot animation */
  .live-dot {
    width: 6px;
    height: 6px;
    background: var(--color-green);
    border-radius: 50%;
    animation: livePulse 2s ease-in-out infinite;
    box-shadow: 0 0 6px var(--color-green);
  }

  @keyframes livePulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.5; transform: scale(0.8); }
  }

  /* Inverted section — slightly lighter dark bg */
  .about-inverted-section {
    background: rgba(24, 24, 29, 0.6);
    color: var(--color-fg);
    border-top: 1px solid var(--color-border);
    border-bottom: 1px solid var(--color-border);
  }

  /* Benefit number */
  .benefit-number {
    font-family: var(--font-mono);
    font-size: 0.75rem;
    font-weight: 700;
    margin-top: 0.25rem;
    flex-shrink: 0;
    opacity: 0.3;
    color: var(--color-accent);
  }

  .benefit-card {
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: var(--radius-lg);
  }
  .benefit-card:hover {
    background: rgba(255, 255, 255, 0.08);
    border-color: rgba(255, 255, 255, 0.1);
    transform: translateX(4px);
  }

  /* CTA section */
  .about-cta-section {
    background: rgba(21, 21, 25, 0.6);
    color: var(--color-fg);
  }

  /* CTA glow */
  .cta-glow {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 500px;
    height: 500px;
    background: radial-gradient(circle, rgba(16, 185, 129, 0.05) 0%, transparent 70%);
    pointer-events: none;
  }

  .about-cta-section :global(.btn-bh-red) {
    background: var(--color-fg);
    color: var(--color-bg);
  }

  .about-cta-section :global(.btn-bh) {
    border-color: var(--color-border) !important;
    color: var(--color-fg) !important;
  }
</style>
