<script lang="ts">
  import { authStore } from '$lib/stores/auth';
</script>

<svelte:head>
  <title>About Us - BidMo.to</title>
  <meta name="description" content="Learn about BidMo.to - The Filipino way to bid, buy, and sell unique items. Join our experimental auction platform and help us grow!" />
</svelte:head>

<!-- Remove padding from main wrapper since layout already has it -->
<div class="-mx-4 sm:-mx-6 lg:-mx-8 -my-6 sm:-my-8">
  <!-- Hero Section -->
  <section class="bg-bh-red text-white px-4 sm:px-6 lg:px-8 py-12 sm:py-16 lg:py-20 text-center border-b-4 border-bh-border">
    <div class="max-w-4xl mx-auto">
      <div class="mb-8">
        <img src="/bidmo.to.png" alt="BidMo.to" class="h-24 sm:h-32 w-auto mx-auto" />
      </div>

      <h1 class="headline-bh text-5xl md:text-7xl lg:text-8xl mb-4 text-white">
        Welcome to <span class="text-bh-yellow">BidMo.to</span>
      </h1>

      <p class="text-lg sm:text-xl lg:text-2xl mb-4 opacity-95">
        Bid mo 'to! The Filipino way to bid, buy, and sell unique items
      </p>

      <p class="text-base sm:text-lg mb-10 opacity-90 max-w-2xl mx-auto">
        Join us in building the Philippines' most exciting auction platform.
        Your participation helps us understand what features matter most!
      </p>

      <div class="flex flex-col sm:flex-row gap-4 justify-center mb-12">
        <a href="/products" class="btn-bh-yellow text-base sm:text-lg px-6 sm:px-8 py-3 sm:py-4">
          Browse Auctions
        </a>
        {#if $authStore.isAuthenticated}
          <a href="/sell" class="btn-bh-outline border-white text-white text-base sm:text-lg px-6 sm:px-8 py-3 sm:py-4">
            List an Item
          </a>
        {:else}
          <a href="/register" class="btn-bh-outline border-white text-white text-base sm:text-lg px-6 sm:px-8 py-3 sm:py-4">
            Join Beta
          </a>
        {/if}
      </div>

      <div class="flex flex-wrap gap-6 sm:gap-12 justify-center">
        <div class="text-center">
          <div class="text-2xl sm:text-3xl font-black">FREE</div>
          <div class="text-sm sm:text-base opacity-90">To Join</div>
        </div>
        <div class="text-center">
          <div class="text-2xl sm:text-3xl font-black">SAFE</div>
          <div class="text-sm sm:text-base opacity-90">No Payment Integration</div>
        </div>
        <div class="text-center">
          <div class="text-2xl sm:text-3xl font-black">BETA</div>
          <div class="text-sm sm:text-base opacity-90">Help Us Grow</div>
        </div>
      </div>
    </div>
  </section>

  <div class="divider-bh !my-0"></div>

  <!-- How It Works -->
  <section class="bg-bh-bg px-4 sm:px-6 lg:px-8 py-12 sm:py-16 lg:py-20">
    <div class="max-w-7xl mx-auto">
      <h2 class="headline-bh text-3xl sm:text-4xl lg:text-5xl text-center mb-4">How It Works (For Now)</h2>
      <p class="text-lg sm:text-xl text-center text-bh-fg/60 mb-12">Simple, experimental, and evolving based on your feedback</p>

      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-8">
        <div class="card-bh p-6 sm:p-8 text-center hover:-translate-y-1 transition-transform">
          <div class="w-14 h-14 sm:w-16 sm:h-16 bg-bh-red text-white rounded-full flex items-center justify-center text-2xl sm:text-3xl font-black mx-auto mb-6">1</div>
          <h3 class="text-lg sm:text-xl font-bold mb-3 text-bh-fg">Create Account</h3>
          <p class="text-bh-fg/60 text-sm sm:text-base">Sign up for free and join our beta community</p>
        </div>
        <div class="card-bh p-6 sm:p-8 text-center hover:-translate-y-1 transition-transform">
          <div class="w-14 h-14 sm:w-16 sm:h-16 bg-bh-red text-white rounded-full flex items-center justify-center text-2xl sm:text-3xl font-black mx-auto mb-6">2</div>
          <h3 class="text-lg sm:text-xl font-bold mb-3 text-bh-fg">Browse or List</h3>
          <p class="text-bh-fg/60 text-sm sm:text-base">Explore active auctions or list your own items</p>
        </div>
        <div class="card-bh p-6 sm:p-8 text-center hover:-translate-y-1 transition-transform">
          <div class="w-14 h-14 sm:w-16 sm:h-16 bg-bh-red text-white rounded-full flex items-center justify-center text-2xl sm:text-3xl font-black mx-auto mb-6">3</div>
          <h3 class="text-lg sm:text-xl font-bold mb-3 text-bh-fg">Place Bids</h3>
          <p class="text-bh-fg/60 text-sm sm:text-base">Bid on items you want - no payment needed yet</p>
        </div>
        <div class="card-bh p-6 sm:p-8 text-center hover:-translate-y-1 transition-transform">
          <div class="w-14 h-14 sm:w-16 sm:h-16 bg-bh-red text-white rounded-full flex items-center justify-center text-2xl sm:text-3xl font-black mx-auto mb-6">4</div>
          <h3 class="text-lg sm:text-xl font-bold mb-3 text-bh-fg">Connect Directly</h3>
          <p class="text-bh-fg/60 text-sm sm:text-base">Winners chat with sellers to arrange payment & delivery</p>
        </div>
      </div>
    </div>
  </section>

  <div class="divider-bh !my-0"></div>

  <!-- Features Section -->
  <section class="bg-white px-4 sm:px-6 lg:px-8 py-12 sm:py-16 lg:py-20 border-y-4 border-bh-border">
    <div class="max-w-7xl mx-auto">
      <h2 class="headline-bh text-3xl sm:text-4xl lg:text-5xl text-center mb-4">What We're Building</h2>
      <p class="text-lg sm:text-xl text-center text-bh-fg/60 mb-12">Features available now in our experimental phase</p>

      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
        {#each [
          { icon: '&#9734;', title: 'Live Bidding', desc: 'Real-time auction updates and competitive bidding', status: 'live' },
          { icon: '&#9993;', title: 'Direct Messaging', desc: 'Chat with buyers/sellers after winning bids', status: 'live' },
          { icon: '&#9783;', title: 'Price Analytics', desc: 'Track bidding trends and price history', status: 'live' },
          { icon: '&#128269;', title: 'Smart Search', desc: 'Find items by keywords, categories, and status', status: 'live' },
          { icon: '&#9744;', title: 'Payment Integration', desc: 'Secure, integrated payment processing', status: 'coming' },
          { icon: '&#9745;', title: 'Buyer Protection', desc: 'Escrow services and dispute resolution', status: 'coming' }
        ] as feature}
          <div class="card-bh p-8 text-center hover:-translate-y-1 transition-transform">
            <div class="text-5xl mb-4">{@html feature.icon}</div>
            <h3 class="text-xl font-bold mb-3 text-bh-fg">{feature.title}</h3>
            <p class="text-bh-fg/60 mb-4 text-sm sm:text-base">{feature.desc}</p>
            <span class="inline-block px-4 py-2 text-xs font-bold uppercase tracking-wide border-2 border-bh-border {feature.status === 'live' ? 'bg-bh-blue text-white' : 'bg-bh-yellow text-bh-fg'}">
              {feature.status === 'live' ? 'Live Now' : 'Coming Soon'}
            </span>
          </div>
        {/each}
      </div>
    </div>
  </section>

  <!-- Why Join Section -->
  <section class="bg-bh-fg text-white px-4 sm:px-6 lg:px-8 py-12 sm:py-16 lg:py-20">
    <div class="max-w-5xl mx-auto">
      <h2 class="headline-bh text-3xl sm:text-4xl lg:text-5xl text-center mb-12 text-white">Why Join Our Beta?</h2>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-10">
        {#each [
          { title: 'Shape the Future', desc: 'Your feedback directly influences what features we build next' },
          { title: 'Huge Benefits for Beta Users', desc: 'Early adopters get premium features when we launch officially' },
          { title: 'Build Community', desc: 'Connect with fellow Filipinos who love unique finds and good deals' },
          { title: 'Grow With Us', desc: 'Be part of the journey from experimental platform to full-scale marketplace' }
        ] as benefit}
          <div class="flex gap-4 sm:gap-6 border-l-4 border-bh-yellow pl-6">
            <div>
              <h3 class="text-xl sm:text-2xl font-bold mb-2">{benefit.title}</h3>
              <p class="text-gray-300 text-sm sm:text-base leading-relaxed">{benefit.desc}</p>
            </div>
          </div>
        {/each}
      </div>
    </div>
  </section>

  <div class="divider-bh !my-0"></div>

  <!-- Final CTA -->
  <section class="bg-bh-blue text-white px-4 sm:px-6 lg:px-8 py-12 sm:py-16 lg:py-20 text-center border-t-4 border-bh-border">
    <div class="max-w-4xl mx-auto">
      <h2 class="headline-bh text-3xl sm:text-4xl lg:text-5xl mb-6 text-white">Ready to Bid?</h2>
      <p class="text-lg sm:text-xl mb-10 opacity-95">Join us in this experiment and help build something amazing for the Filipino community</p>

      <div class="flex flex-col sm:flex-row gap-4 justify-center">
        {#if $authStore.isAuthenticated}
          <a href="/products" class="btn-bh-yellow text-lg sm:text-xl px-8 sm:px-10 py-4 sm:py-5">
            Start Browsing
          </a>
          <a href="/sell" class="btn-bh-outline border-white text-white text-lg sm:text-xl px-8 sm:px-10 py-4 sm:py-5">
            List Your First Item
          </a>
        {:else}
          <a href="/register" class="btn-bh-yellow text-lg sm:text-xl px-8 sm:px-10 py-4 sm:py-5">
            Join Beta Now - It's Free!
          </a>
          <a href="/products" class="btn-bh-outline border-white text-white text-lg sm:text-xl px-8 sm:px-10 py-4 sm:py-5">
            Browse Without Signing Up
          </a>
        {/if}
      </div>
    </div>
  </section>
</div>
