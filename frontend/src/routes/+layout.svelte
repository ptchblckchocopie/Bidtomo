<script lang="ts">
  import '../app.css';
  import { authStore } from '$lib/stores/auth';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { logout as apiLogout } from '$lib/api';

  $: currentPath = $page.url.pathname;

  let mobileMenuOpen = false;

  function toggleMobileMenu() {
    mobileMenuOpen = !mobileMenuOpen;
  }

  function closeMobileMenu() {
    mobileMenuOpen = false;
  }

  async function handleLogout() {
    await apiLogout();
    authStore.logout();
    closeMobileMenu();
    goto('/');
  }
</script>

<div class="min-h-screen flex flex-col">
  <!-- Header -->
  <header class="bg-gradient-to-br from-primary to-primary-dark text-white shadow-lg sticky top-0 z-50">
    <nav class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="flex justify-between items-center h-16">
        <!-- Logo -->
        <a href="/" class="flex-shrink-0" on:click={closeMobileMenu}>
          <img src="/bidmo.to.png" alt="BidMo.to" class="h-10 w-auto" />
        </a>

        <!-- Desktop Navigation -->
        <div class="hidden md:flex md:items-center md:space-x-6">
          <a
            href="/products"
            class="px-3 py-2 rounded-md text-sm font-medium hover:bg-white/10 transition-colors {currentPath.startsWith('/products') ? 'bg-white/20' : ''}"
          >
            Browse
          </a>
          {#if $authStore.isAuthenticated}
            <a
              href="/dashboard"
              class="px-3 py-2 rounded-md text-sm font-medium hover:bg-white/10 transition-colors {currentPath === '/dashboard' ? 'bg-white/20' : ''}"
            >
              My Products
            </a>
            <a
              href="/purchases"
              class="px-3 py-2 rounded-md text-sm font-medium hover:bg-white/10 transition-colors {currentPath === '/purchases' ? 'bg-white/20' : ''}"
            >
              My Purchases
            </a>
            <a
              href="/inbox"
              class="px-3 py-2 rounded-md text-sm font-medium hover:bg-white/10 transition-colors {currentPath === '/inbox' ? 'bg-white/20' : ''}"
            >
              Inbox
            </a>
          {/if}
        </div>

        <!-- Desktop Actions -->
        <div class="hidden md:flex md:items-center md:space-x-4">
          {#if $authStore.isAuthenticated}
            <a
              href="/sell"
              class="px-4 py-2 bg-green-500 hover:bg-green-600 rounded-md text-sm font-semibold transition-all hover:-translate-y-0.5 shadow-md {currentPath === '/sell' ? 'ring-2 ring-white/50' : ''}"
            >
              + Sell
            </a>
            <span class="text-sm font-medium">Hi, {$authStore.user?.name || 'User'}!</span>
            <button
              on:click={handleLogout}
              class="px-4 py-2 border border-white/30 bg-white/10 hover:bg-white/20 rounded-md text-sm font-medium transition-colors"
            >
              Logout
            </button>
          {:else}
            <a
              href="/login"
              class="px-3 py-2 rounded-md text-sm font-medium hover:bg-white/10 transition-colors"
            >
              Login
            </a>
            <a
              href="/register"
              class="px-4 py-2 bg-white text-primary rounded-md text-sm font-semibold hover:shadow-lg hover:-translate-y-0.5 transition-all"
            >
              Register
            </a>
          {/if}
        </div>

        <!-- Mobile menu button -->
        <button
          on:click={toggleMobileMenu}
          class="md:hidden inline-flex items-center justify-center p-2 rounded-md hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-white"
          aria-label="Toggle menu"
        >
          <svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            {#if mobileMenuOpen}
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            {:else}
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
            {/if}
          </svg>
        </button>
      </div>

      <!-- Mobile Navigation -->
      {#if mobileMenuOpen}
        <div class="md:hidden pb-4 space-y-1">
          <a
            href="/products"
            on:click={closeMobileMenu}
            class="block px-3 py-2 rounded-md text-base font-medium hover:bg-white/10 {currentPath.startsWith('/products') ? 'bg-white/20' : ''}"
          >
            Browse
          </a>
          {#if $authStore.isAuthenticated}
            <a
              href="/dashboard"
              on:click={closeMobileMenu}
              class="block px-3 py-2 rounded-md text-base font-medium hover:bg-white/10 {currentPath === '/dashboard' ? 'bg-white/20' : ''}"
            >
              My Products
            </a>
            <a
              href="/purchases"
              on:click={closeMobileMenu}
              class="block px-3 py-2 rounded-md text-base font-medium hover:bg-white/10 {currentPath === '/purchases' ? 'bg-white/20' : ''}"
            >
              My Purchases
            </a>
            <a
              href="/inbox"
              on:click={closeMobileMenu}
              class="block px-3 py-2 rounded-md text-base font-medium hover:bg-white/10 {currentPath === '/inbox' ? 'bg-white/20' : ''}"
            >
              Inbox
            </a>
            <a
              href="/sell"
              on:click={closeMobileMenu}
              class="block px-3 py-2 bg-green-500 hover:bg-green-600 rounded-md text-base font-semibold mt-2 {currentPath === '/sell' ? 'ring-2 ring-white/50' : ''}"
            >
              + Sell
            </a>
            <div class="px-3 py-2 text-sm">Hi, {$authStore.user?.name || 'User'}!</div>
            <button
              on:click={handleLogout}
              class="w-full text-left px-3 py-2 border border-white/30 bg-white/10 hover:bg-white/20 rounded-md text-base font-medium"
            >
              Logout
            </button>
          {:else}
            <a
              href="/login"
              on:click={closeMobileMenu}
              class="block px-3 py-2 rounded-md text-base font-medium hover:bg-white/10"
            >
              Login
            </a>
            <a
              href="/register"
              on:click={closeMobileMenu}
              class="block px-3 py-2 bg-white text-primary rounded-md text-base font-semibold mt-2"
            >
              Register
            </a>
          {/if}
        </div>
      {/if}
    </nav>
  </header>

  <!-- Main Content -->
  <main class="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
    <slot />
  </main>

  <!-- Footer -->
  <footer class="bg-gray-100 py-4 text-center text-gray-600 text-sm">
    <p>&copy; 2025 BidMo.to - Bid mo 'to!</p>
  </footer>
</div>
