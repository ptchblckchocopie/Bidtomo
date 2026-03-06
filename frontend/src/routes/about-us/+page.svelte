<script lang="ts">
  import { authStore } from '$lib/stores/auth';
  import GlowingEffect from '$lib/components/GlowingEffect.svelte';
</script>

<svelte:head>
  <title>About Us - BidMo.to</title>
  <meta name="description" content="Learn about BidMo.to - The Filipino way to bid, buy, and sell unique items. Join our experimental auction platform and help us grow!" />
</svelte:head>

<div class="-mx-4 sm:-mx-6 lg:-mx-8 -my-6 sm:-my-8">
  <!-- Hero Section — Cinematic full-width -->
  <section class="about-hero relative overflow-hidden px-4 sm:px-6 lg:px-8 py-20 sm:py-28 lg:py-36">
    <div class="max-w-5xl mx-auto relative z-10">
      <!-- Logo -->
      <div class="mb-10 flex justify-center">
        <img src="/bidmo.to.png" alt="BidMo.to" class="h-20 sm:h-28 w-auto" />
      </div>

      <h1 class="text-5xl md:text-7xl lg:text-8xl font-bold mb-6 text-center font-display tracking-tighter">
        Welcome to
        <span class="relative inline-block">
          BidMo.to
          <span class="hero-underline"></span>
        </span>
      </h1>

      <p class="text-lg sm:text-xl lg:text-2xl mb-4 opacity-90 text-center max-w-3xl mx-auto">
        Bid mo 'to! The Filipino way to bid, buy, and sell unique items
      </p>

      <p class="text-base sm:text-lg mb-12 opacity-60 max-w-2xl mx-auto text-center">
        Join us in building the Philippines' most exciting auction platform.
        Your participation helps us understand what features matter most!
      </p>

      <!-- CTA buttons -->
      <div class="flex flex-col sm:flex-row gap-4 justify-center mb-16">
        <a href="/products" class="btn-bh-red text-base sm:text-lg !px-8 !py-3.5">
          Browse Auctions
        </a>
        {#if $authStore.isAuthenticated}
          <a href="/sell" class="btn-bh text-base sm:text-lg !px-8 !py-3.5 hero-outline-btn">
            List an Item
          </a>
        {:else}
          <a href="/register" class="btn-bh text-base sm:text-lg !px-8 !py-3.5 hero-outline-btn">
            Join Beta
          </a>
        {/if}
      </div>

      <!-- Stats row -->
      <div class="flex flex-wrap justify-center gap-0">
        <div class="stat-item text-center px-8 sm:px-12">
          <div class="text-xs uppercase tracking-widest opacity-40 mb-1 font-mono">Cost</div>
          <div class="text-2xl sm:text-3xl font-bold tracking-tight">FREE</div>
        </div>
        <div class="stat-divider"></div>
        <div class="stat-item text-center px-8 sm:px-12">
          <div class="text-xs uppercase tracking-widest opacity-40 mb-1 font-mono">Risk</div>
          <div class="text-2xl sm:text-3xl font-bold tracking-tight">SAFE</div>
        </div>
        <div class="stat-divider"></div>
        <div class="stat-item text-center px-8 sm:px-12">
          <div class="text-xs uppercase tracking-widest opacity-40 mb-1 font-mono">Stage</div>
          <div class="text-2xl sm:text-3xl font-bold tracking-tight">BETA</div>
        </div>
      </div>
    </div>
  </section>

  <!-- How It Works -->
  <section class="px-4 sm:px-6 lg:px-8 py-20 sm:py-24 lg:py-28" style="border-bottom: 1px solid var(--color-border);">
    <div class="max-w-7xl mx-auto">
      <div class="text-center mb-16">
        <span class="label-bh block mb-3">The Process</span>
        <h2 class="font-display tracking-tighter text-3xl sm:text-4xl lg:text-5xl">How It Works</h2>
        <p class="mt-4 text-lg opacity-60">Simple, experimental, and evolving</p>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {#each [
          { num: '01', title: 'Create Account', desc: 'Sign up for free and join our beta community' },
          { num: '02', title: 'Browse or List', desc: 'Explore active auctions or list your own items' },
          { num: '03', title: 'Place Bids', desc: 'Bid on items you want - no payment needed yet' },
          { num: '04', title: 'Connect', desc: 'Winners chat with sellers to arrange payment & delivery' }
        ] as step}
          <div class="glow-card relative rounded-2xl border border-[rgba(255,255,255,0.06)] p-1.5">
            <GlowingEffect spread={40} glow={true} disabled={false} proximity={64} inactiveZone={0.01} borderWidth={3} />
            <div class="relative card-bh p-6 sm:p-8 text-center group rounded-xl !border-0">
              <div class="text-xs font-mono font-bold opacity-40 mb-5">{step.num}</div>
              <h3 class="font-display tracking-tight text-lg sm:text-xl mb-3">{step.title}</h3>
              <p class="text-sm sm:text-base opacity-60">{step.desc}</p>
            </div>
          </div>
        {/each}
      </div>
    </div>
  </section>

  <!-- Features Section -->
  <section class="px-4 sm:px-6 lg:px-8 py-20 sm:py-24 lg:py-28" style="border-bottom: 1px solid var(--color-border);">
    <div class="max-w-7xl mx-auto">
      <div class="text-center mb-16">
        <span class="label-bh block mb-3">Features</span>
        <h2 class="font-display tracking-tighter text-3xl sm:text-4xl lg:text-5xl">What We're Building</h2>
        <p class="mt-4 text-lg opacity-60">Available now in our experimental phase</p>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {#each [
          { icon: '&#9734;', title: 'Live Bidding', desc: 'Real-time auction updates and competitive bidding', status: 'live' },
          { icon: '&#9993;', title: 'Direct Messaging', desc: 'Chat with buyers/sellers after winning bids', status: 'live' },
          { icon: '&#9783;', title: 'Price Analytics', desc: 'Track bidding trends and price history', status: 'live' },
          { icon: '&#128269;', title: 'Smart Search', desc: 'Find items by keywords, categories, and status', status: 'live' },
          { icon: '&#9744;', title: 'Payment Integration', desc: 'Secure, integrated payment processing', status: 'coming' },
          { icon: '&#9745;', title: 'Buyer Protection', desc: 'Escrow services and dispute resolution', status: 'coming' }
        ] as feature}
          <div class="glow-card relative rounded-2xl border border-[rgba(255,255,255,0.06)] p-1.5">
            <GlowingEffect spread={40} glow={true} disabled={false} proximity={64} inactiveZone={0.01} borderWidth={3} />
            <div class="relative card-bh p-8 text-center group rounded-xl !border-0">
              <div class="text-3xl mb-4 group-hover:scale-110 transition-transform duration-300">{@html feature.icon}</div>
              <h3 class="font-display tracking-tight text-xl mb-3">{feature.title}</h3>
              <p class="opacity-60 mb-4 text-sm sm:text-base">{feature.desc}</p>
              <span class="badge-bh" style="border: 1px solid {feature.status === 'live' ? 'var(--color-green)' : 'var(--color-fg)'}; color: {feature.status === 'live' ? 'var(--color-green)' : 'var(--color-fg)'}; background: {feature.status === 'live' ? 'color-mix(in srgb, var(--color-green) 10%, transparent)' : 'color-mix(in srgb, var(--color-fg) 10%, transparent)'};">
                {feature.status === 'live' ? 'Live Now' : 'Coming Soon'}
              </span>
            </div>
          </div>
        {/each}
      </div>
    </div>
  </section>

  <!-- Why Join Section — Cinematic inverted -->
  <section class="about-inverted-section px-4 sm:px-6 lg:px-8 py-20 sm:py-24 lg:py-28">
    <div class="max-w-5xl mx-auto">
      <div class="text-center mb-16">
        <span class="label-bh block mb-3 !opacity-50">Join Us</span>
        <h2 class="text-3xl sm:text-4xl lg:text-5xl font-bold font-display tracking-tighter">Why Join Our Beta?</h2>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {#each [
          { title: 'Shape the Future', desc: 'Your feedback directly influences what features we build next' },
          { title: 'Beta Benefits', desc: 'Early adopters get premium features when we launch officially' },
          { title: 'Build Community', desc: 'Connect with fellow Filipinos who love unique finds and good deals' },
          { title: 'Grow With Us', desc: 'Be part of the journey from experimental platform to full marketplace' }
        ] as benefit, i}
          <div class="glow-card relative rounded-2xl border border-[rgba(255,255,255,0.06)] p-1.5">
            <GlowingEffect spread={40} glow={true} disabled={false} proximity={64} inactiveZone={0.01} borderWidth={3} />
            <div class="benefit-card relative p-8 transition-colors duration-300 rounded-xl !border-0">
              <div class="flex items-start gap-4">
                <span class="font-mono text-xs font-bold mt-1 shrink-0 opacity-40">0{i + 1}</span>
                <div>
                  <h3 class="text-xl sm:text-2xl font-bold mb-2 tracking-tight">{benefit.title}</h3>
                  <p class="opacity-70 text-sm sm:text-base leading-relaxed">{benefit.desc}</p>
                </div>
              </div>
            </div>
          </div>
        {/each}
      </div>
    </div>
  </section>

  <!-- Final CTA -->
  <section class="about-cta-section relative overflow-hidden px-4 sm:px-6 lg:px-8 py-20 sm:py-24 lg:py-28 text-center" style="border-top: 1px solid var(--color-border);">
    <div class="max-w-4xl mx-auto relative z-10">
      <span class="label-bh block mb-4 !opacity-50">Get Started</span>
      <h2 class="font-display tracking-tighter text-3xl sm:text-4xl lg:text-5xl mb-6">Ready to Bid?</h2>
      <p class="text-lg sm:text-xl mb-12 opacity-60">Join us and help build something amazing for the Filipino community</p>

      <div class="flex flex-col sm:flex-row gap-4 justify-center">
        {#if $authStore.isAuthenticated}
          <a href="/products" class="btn-bh-red text-lg sm:text-xl !px-10 !py-4">
            Start Browsing
          </a>
          <a href="/sell" class="btn-bh text-lg sm:text-xl !px-10 !py-4">
            List Your First Item
          </a>
        {:else}
          <a href="/register" class="btn-bh-red text-lg sm:text-xl !px-10 !py-4">
            Join Beta Now
          </a>
          <a href="/products" class="btn-bh text-lg sm:text-xl !px-10 !py-4">
            Browse First
          </a>
        {/if}
      </div>
    </div>
  </section>
</div>

<style>
  /* Hero — transparent in dark mode, content over Three.js bg */
  .about-hero {
    background: transparent;
    color: var(--color-fg);
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

  /* Hero underline */
  .hero-underline {
    position: absolute;
    bottom: 0.05em;
    left: 0;
    right: 0;
    height: 4px;
    background: currentColor;
    transform-origin: left;
    animation: underlineReveal 0.8s cubic-bezier(0.52, 0.01, 0, 1) 0.6s forwards;
    transform: scaleX(0);
    border-radius: 2px;
  }

  /* Stat dividers */
  .stat-divider {
    width: 1px;
    height: 40px;
    background: currentColor;
    opacity: 0.15;
    align-self: center;
  }

  /* Inverted section — slightly lighter dark bg */
  .about-inverted-section {
    background: #18181D;
    color: var(--color-fg);
    border-top: 1px solid var(--color-border);
    border-bottom: 1px solid var(--color-border);
  }

  .benefit-card {
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: var(--radius-lg);
  }
  .benefit-card:hover {
    background: rgba(255, 255, 255, 0.1);
    border-color: rgba(255, 255, 255, 0.15);
  }

  /* CTA section */
  .about-cta-section {
    background: #151519;
    color: var(--color-fg);
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
