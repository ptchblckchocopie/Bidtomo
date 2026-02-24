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
  <section class="bg-gradient-to-br from-primary to-primary-dark text-white px-4 sm:px-6 lg:px-8 py-12 sm:py-16 lg:py-20 text-center">
    <div class="max-w-4xl mx-auto">
      <div class="mb-8 animate-fade-in-down">
        <img src="/bidmo.to.png" alt="BidMo.to" class="h-24 sm:h-32 w-auto mx-auto drop-shadow-2xl" />
      </div>

      <h1 class="text-4xl sm:text-5xl lg:text-6xl font-extrabold mb-4 animate-fade-in-up">
        Welcome to <span class="bg-gradient-to-r from-yellow-400 to-yellow-500 bg-clip-text text-transparent">BidMo.to</span>
      </h1>

      <p class="text-lg sm:text-xl lg:text-2xl mb-4 opacity-95">
        Bid mo 'to! The Filipino way to bid, buy, and sell unique items
      </p>

      <p class="text-base sm:text-lg mb-10 opacity-90 max-w-2xl mx-auto">
        Join us in building the Philippines' most exciting auction platform.
        Your participation helps us understand what features matter most!
      </p>

      <div class="flex flex-col sm:flex-row gap-4 justify-center mb-12">
        <a href="/products" class="inline-flex items-center justify-center gap-2 px-6 sm:px-8 py-3 sm:py-4 bg-white text-primary rounded-full font-bold text-base sm:text-lg shadow-xl hover:shadow-2xl hover:-translate-y-1 transition-all">
          <span class="text-xl">🔍</span>
          Browse Auctions
        </a>
        {#if $authStore.isAuthenticated}
          <a href="/sell" class="inline-flex items-center justify-center gap-2 px-6 sm:px-8 py-3 sm:py-4 bg-white/20 border-2 border-white text-white rounded-full font-bold text-base sm:text-lg shadow-xl hover:bg-white/30 hover:-translate-y-1 transition-all">
            <span class="text-xl">🔨</span>
            List an Item
          </a>
        {:else}
          <a href="/register" class="inline-flex items-center justify-center gap-2 px-6 sm:px-8 py-3 sm:py-4 bg-white/20 border-2 border-white text-white rounded-full font-bold text-base sm:text-lg shadow-xl hover:bg-white/30 hover:-translate-y-1 transition-all">
            <span class="text-xl">✨</span>
            Join Beta
          </a>
        {/if}
      </div>

      <div class="flex flex-wrap gap-6 sm:gap-12 justify-center">
        <div class="text-center">
          <div class="text-2xl sm:text-3xl font-extrabold">FREE</div>
          <div class="text-sm sm:text-base opacity-90">To Join</div>
        </div>
        <div class="text-center">
          <div class="text-2xl sm:text-3xl font-extrabold">SAFE</div>
          <div class="text-sm sm:text-base opacity-90">No Payment Integration</div>
        </div>
        <div class="text-center">
          <div class="text-2xl sm:text-3xl font-extrabold">BETA</div>
          <div class="text-sm sm:text-base opacity-90">Help Us Grow</div>
        </div>
      </div>
    </div>
  </section>

  <!-- How It Works -->
  <section class="bg-gradient-to-b from-white to-gray-50 px-4 sm:px-6 lg:px-8 py-12 sm:py-16 lg:py-20">
    <div class="max-w-7xl mx-auto">
      <h2 class="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-center mb-4 text-gray-900">How It Works (For Now)</h2>
      <p class="text-lg sm:text-xl text-center text-gray-600 mb-12">Simple, experimental, and evolving based on your feedback</p>

      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-8">
        <div class="bg-white p-6 sm:p-8 rounded-xl shadow-lg hover:shadow-2xl hover:-translate-y-2 transition-all text-center">
          <div class="w-14 h-14 sm:w-16 sm:h-16 bg-gradient-to-br from-primary to-primary-dark text-white rounded-full flex items-center justify-center text-2xl sm:text-3xl font-extrabold mx-auto mb-6">1</div>
          <h3 class="text-lg sm:text-xl font-bold mb-3 text-gray-900">Create Account</h3>
          <p class="text-gray-600 text-sm sm:text-base">Sign up for free and join our beta community</p>
        </div>
        <div class="bg-white p-6 sm:p-8 rounded-xl shadow-lg hover:shadow-2xl hover:-translate-y-2 transition-all text-center">
          <div class="w-14 h-14 sm:w-16 sm:h-16 bg-gradient-to-br from-primary to-primary-dark text-white rounded-full flex items-center justify-center text-2xl sm:text-3xl font-extrabold mx-auto mb-6">2</div>
          <h3 class="text-lg sm:text-xl font-bold mb-3 text-gray-900">Browse or List</h3>
          <p class="text-gray-600 text-sm sm:text-base">Explore active auctions or list your own items</p>
        </div>
        <div class="bg-white p-6 sm:p-8 rounded-xl shadow-lg hover:shadow-2xl hover:-translate-y-2 transition-all text-center">
          <div class="w-14 h-14 sm:w-16 sm:h-16 bg-gradient-to-br from-primary to-primary-dark text-white rounded-full flex items-center justify-center text-2xl sm:text-3xl font-extrabold mx-auto mb-6">3</div>
          <h3 class="text-lg sm:text-xl font-bold mb-3 text-gray-900">Place Bids</h3>
          <p class="text-gray-600 text-sm sm:text-base">Bid on items you want - no payment needed yet</p>
        </div>
        <div class="bg-white p-6 sm:p-8 rounded-xl shadow-lg hover:shadow-2xl hover:-translate-y-2 transition-all text-center">
          <div class="w-14 h-14 sm:w-16 sm:h-16 bg-gradient-to-br from-primary to-primary-dark text-white rounded-full flex items-center justify-center text-2xl sm:text-3xl font-extrabold mx-auto mb-6">4</div>
          <h3 class="text-lg sm:text-xl font-bold mb-3 text-gray-900">Connect Directly</h3>
          <p class="text-gray-600 text-sm sm:text-base">Winners chat with sellers to arrange payment & delivery</p>
        </div>
      </div>
    </div>
  </section>

  <!-- Features Section -->
  <section class="bg-white px-4 sm:px-6 lg:px-8 py-12 sm:py-16 lg:py-20">
    <div class="max-w-7xl mx-auto">
      <h2 class="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-center mb-4 text-gray-900">What We're Building</h2>
      <p class="text-lg sm:text-xl text-center text-gray-600 mb-12">Features available now in our experimental phase</p>

      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
        {#each [
          { icon: '🏆', title: 'Live Bidding', desc: 'Real-time auction updates and competitive bidding', status: 'live' },
          { icon: '💬', title: 'Direct Messaging', desc: 'Chat with buyers/sellers after winning bids', status: 'live' },
          { icon: '📊', title: 'Price Analytics', desc: 'Track bidding trends and price history', status: 'live' },
          { icon: '🔍', title: 'Smart Search', desc: 'Find items by keywords, categories, and status', status: 'live' },
          { icon: '💳', title: 'Payment Integration', desc: 'Secure, integrated payment processing', status: 'coming' },
          { icon: '🛡️', title: 'Buyer Protection', desc: 'Escrow services and dispute resolution', status: 'coming' }
        ] as feature}
          <div class="bg-gradient-to-br from-gray-50 to-gray-100 p-8 rounded-2xl border-2 border-gray-200 hover:border-primary hover:shadow-2xl hover:-translate-y-2 transition-all text-center">
            <div class="text-5xl mb-4">{feature.icon}</div>
            <h3 class="text-xl font-bold mb-3 text-gray-900">{feature.title}</h3>
            <p class="text-gray-600 mb-4 text-sm sm:text-base">{feature.desc}</p>
            <span class="inline-block px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wide {feature.status === 'live' ? 'bg-gradient-to-r from-green-500 to-green-600 text-white' : 'bg-gradient-to-r from-yellow-400 to-yellow-500 text-white'}">
              {feature.status === 'live' ? 'Live Now' : 'Coming Soon'}
            </span>
          </div>
        {/each}
      </div>
    </div>
  </section>

  <!-- Why Join Section -->
  <section class="bg-gradient-to-br from-gray-800 to-gray-900 text-white px-4 sm:px-6 lg:px-8 py-12 sm:py-16 lg:py-20">
    <div class="max-w-5xl mx-auto">
      <h2 class="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-center mb-12">Why Join Our Beta?</h2>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-10">
        {#each [
          { icon: '🎯', title: 'Shape the Future', desc: 'Your feedback directly influences what features we build next' },
          { icon: '🎁', title: 'Huge Benefits for Beta Users', desc: 'Early adopters get premium features when we launch officially' },
          { icon: '🤝', title: 'Build Community', desc: 'Connect with fellow Filipinos who love unique finds and good deals' },
          { icon: '📈', title: 'Grow With Us', desc: 'Be part of the journey from experimental platform to full-scale marketplace' }
        ] as benefit}
          <div class="flex gap-4 sm:gap-6">
            <div class="text-4xl sm:text-5xl flex-shrink-0">{benefit.icon}</div>
            <div>
              <h3 class="text-xl sm:text-2xl font-bold mb-2">{benefit.title}</h3>
              <p class="text-gray-300 text-sm sm:text-base leading-relaxed">{benefit.desc}</p>
            </div>
          </div>
        {/each}
      </div>
    </div>
  </section>

  <!-- Final CTA -->
  <section class="bg-gradient-to-br from-primary to-primary-dark text-white px-4 sm:px-6 lg:px-8 py-12 sm:py-16 lg:py-20 text-center">
    <div class="max-w-4xl mx-auto">
      <h2 class="text-3xl sm:text-4xl lg:text-5xl font-extrabold mb-6">Ready to Bid?</h2>
      <p class="text-lg sm:text-xl mb-10 opacity-95">Join us in this experiment and help build something amazing for the Filipino community</p>

      <div class="flex flex-col sm:flex-row gap-4 justify-center">
        {#if $authStore.isAuthenticated}
          <a href="/products" class="inline-flex items-center justify-center px-8 sm:px-10 py-4 sm:py-5 bg-white text-primary rounded-full font-bold text-lg sm:text-xl shadow-2xl hover:shadow-3xl hover:-translate-y-1 transition-all">
            Start Browsing
          </a>
          <a href="/sell" class="inline-flex items-center justify-center px-8 sm:px-10 py-4 sm:py-5 bg-white/20 border-2 border-white text-white rounded-full font-bold text-lg sm:text-xl shadow-2xl hover:bg-white/30 hover:-translate-y-1 transition-all">
            List Your First Item
          </a>
        {:else}
          <a href="/register" class="inline-flex items-center justify-center px-8 sm:px-10 py-4 sm:py-5 bg-white text-primary rounded-full font-bold text-lg sm:text-xl shadow-2xl hover:shadow-3xl hover:-translate-y-1 transition-all">
            Join Beta Now - It's Free!
          </a>
          <a href="/products" class="inline-flex items-center justify-center px-8 sm:px-10 py-4 sm:py-5 bg-white/20 border-2 border-white text-white rounded-full font-bold text-lg sm:text-xl shadow-2xl hover:bg-white/30 hover:-translate-y-1 transition-all">
            Browse Without Signing Up
          </a>
        {/if}
      </div>
    </div>
  </section>
</div>
