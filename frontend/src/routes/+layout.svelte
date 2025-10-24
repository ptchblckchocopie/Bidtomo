<script lang="ts">
  import '../app.css';
  import { authStore } from '$lib/stores/auth';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { logout as apiLogout, getUnreadMessageCount } from '$lib/api';
  import { onMount, onDestroy } from 'svelte';

  // SvelteKit passes params to all routes, but we don't need it here
  export let params: any = undefined;

  $: currentPath = $page.url.pathname;

  let mobileMenuOpen = false;
  let userMenuOpen = false;
  let unreadCount = 0;
  let pollInterval: ReturnType<typeof setInterval> | null = null;

  function toggleMobileMenu() {
    mobileMenuOpen = !mobileMenuOpen;
  }

  function closeMobileMenu() {
    mobileMenuOpen = false;
  }

  function toggleUserMenu() {
    userMenuOpen = !userMenuOpen;
  }

  function closeUserMenu() {
    userMenuOpen = false;
  }

  async function handleLogout() {
    await apiLogout();
    authStore.logout();
    closeMobileMenu();
    closeUserMenu();
    goto('/');
  }

  // Close user menu when clicking outside
  function handleClickOutside(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (userMenuOpen && !target.closest('.user-menu-container')) {
      closeUserMenu();
    }
  }

  // Fetch unread message count
  async function fetchUnreadCount() {
    if ($authStore.isAuthenticated) {
      unreadCount = await getUnreadMessageCount();
    }
  }

  onMount(() => {
    // Fetch unread count on mount
    fetchUnreadCount();

    // Poll for new messages every 30 seconds
    pollInterval = setInterval(fetchUnreadCount, 30000);
  });

  onDestroy(() => {
    // Clean up interval on destroy
    if (pollInterval) {
      clearInterval(pollInterval);
    }
  });

  // Refetch when auth state changes
  $: if ($authStore.isAuthenticated) {
    fetchUnreadCount();
  } else {
    unreadCount = 0;
  }
</script>

<svelte:window on:click={handleClickOutside} />

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
        <div class="hidden md:flex md:space-x-6">
          <a
            href="/products"
            class="px-3 py-2 rounded-md text-sm font-medium hover:bg-white/10 transition-colors {currentPath.startsWith('/products') ? 'bg-white/20' : ''}"
          >
            Browse
          </a>
          <a
            href="/about-us"
            class="px-3 py-2 rounded-md text-sm font-medium hover:bg-white/10 transition-colors {currentPath === '/about-us' ? 'bg-white/20' : ''}"
          >
            About Us
          </a>
        </div>

        <!-- Desktop Actions -->
        <div class="hidden md:flex md:items-center md:space-x-4">
          {#if $authStore.isAuthenticated}
            <!-- Inbox Button -->
            <a
              href="/inbox"
              class="relative px-3 py-2 rounded-md text-sm font-medium hover:bg-white/10 transition-all {currentPath === '/inbox' ? 'bg-white/20' : ''}"
              title="Inbox"
            >
              <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              {#if unreadCount > 0}
                <span class="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              {/if}
            </a>

            <a
              href="/sell"
              class="px-4 py-2 bg-green-500 hover:bg-green-600 rounded-md text-sm font-semibold transition-all hover:-translate-y-0.5 shadow-md {currentPath === '/sell' ? 'ring-2 ring-white/50' : ''}"
            >
              + Sell
            </a>

            <!-- User Menu Dropdown -->
            <div class="user-menu-container relative">
              <button
                on:click|stopPropagation={toggleUserMenu}
                class="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium hover:bg-white/10 transition-colors {userMenuOpen ? 'bg-white/10' : ''}"
              >
                <span>Hi, {$authStore.user?.name || 'User'}!</span>
                <svg class="w-4 h-4 transition-transform {userMenuOpen ? 'rotate-180' : ''}" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {#if userMenuOpen}
                <div class="user-menu-dropdown absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg py-1 z-50 fade-down">
                  <a
                    href="/dashboard"
                    on:click={closeUserMenu}
                    class="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors {currentPath.startsWith('/dashboard') ? 'bg-gray-50 font-semibold' : ''}"
                  >
                    📦 Dashboard
                  </a>
                  <div class="border-t border-gray-200 my-1"></div>
                  <button
                    on:click={handleLogout}
                    class="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors font-medium"
                  >
                    🚪 Logout
                  </button>
                </div>
              {/if}
            </div>
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
          <a
            href="/about-us"
            on:click={closeMobileMenu}
            class="block px-3 py-2 rounded-md text-base font-medium hover:bg-white/10 {currentPath === '/about-us' ? 'bg-white/20' : ''}"
          >
            About Us
          </a>
          {#if $authStore.isAuthenticated}
            <!-- Inbox Button -->
            <a
              href="/inbox"
              on:click={closeMobileMenu}
              class="flex items-center gap-2 px-3 py-2 rounded-md text-base font-medium hover:bg-white/10 mt-2 {currentPath === '/inbox' ? 'bg-white/20' : ''}"
            >
              <div class="relative">
                <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                {#if unreadCount > 0}
                  <span class="absolute -top-2 -right-2 bg-red-500 text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                {/if}
              </div>
              <span>Inbox</span>
            </a>

            <a
              href="/sell"
              on:click={closeMobileMenu}
              class="block px-3 py-2 bg-green-500 hover:bg-green-600 rounded-md text-base font-semibold mt-2 {currentPath === '/sell' ? 'ring-2 ring-white/50' : ''}"
            >
              + Sell
            </a>

            <a
              href="/dashboard"
              on:click={closeMobileMenu}
              class="block px-3 py-2 rounded-md text-base font-medium hover:bg-white/10 mt-2 {currentPath.startsWith('/dashboard') ? 'bg-white/20' : ''}"
            >
              📦 Dashboard
            </a>

            <!-- Mobile User Info -->
            <div class="pt-2 border-t border-white/20 mt-2">
              <div class="px-3 py-2 text-sm text-white/80">
                Hi, {$authStore.user?.name || 'User'}!
              </div>
              <button
                on:click={handleLogout}
                class="w-full text-left px-3 py-2 rounded-md text-base font-medium text-red-300 hover:bg-red-500/20 transition-colors"
              >
                🚪 Logout
              </button>
            </div>
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
  <main class="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
    <slot />
  </main>

  <!-- Footer -->
  <footer class="bg-gray-100 py-4 text-center text-gray-600 text-sm">
    <p>&copy; 2025 BidMo.to - Bid mo 'to!</p>
  </footer>
</div>
