<script lang="ts">
  import '../app.css';
  import { authStore } from '$lib/stores/auth';
  import { goto, afterNavigate } from '$app/navigation';
  import { page } from '$app/stores';
  import { logout as apiLogout, getUnreadMessageCount } from '$lib/api';
  import { onMount } from 'svelte';
  import { unreadCountStore } from '$lib/stores/inbox';
  import { watchlistStore } from '$lib/stores/watchlist';
  import { themeStore } from '$lib/stores/theme';
  import { trackPageView } from '$lib/analytics';
  import ThemeToggle from '$lib/components/ThemeToggle.svelte';
  import ThemeTransition from '$lib/components/ThemeTransition.svelte';
  import ThreeBackground from '$lib/components/ThreeBackground.svelte';
  import type { Snippet } from 'svelte';

  let { children }: { children: Snippet } = $props();

  let currentPath = $derived($page.url.pathname);

  let mobileMenuOpen = $state(false);
  let userMenuOpen = $state(false);
  let animating = $state(false);

  function triggerThemeAnimation() {
    if (animating) return;
    animating = true;
  }

  function handleAnimationMidpoint() {
    themeStore.toggle();
  }

  function handleAnimationComplete() {
    animating = false;
  }

  // Subscribe to the shared unread count store
  let unreadCount = $derived($unreadCountStore);

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
      const count = await getUnreadMessageCount();
      unreadCountStore.set(count);
    }
  }

  onMount(() => {
    // Fetch unread count once on page load
    fetchUnreadCount();
  });

  // Refetch when auth state changes (also fires on mount)
  $effect(() => {
    if ($authStore.isAuthenticated) {
      fetchUnreadCount();
      watchlistStore.load();
    } else {
      unreadCountStore.reset();
      watchlistStore.reset();
    }
  });

  // Track page views on navigation
  afterNavigate(() => {
    trackPageView();
  });
</script>

<svelte:window onclick={handleClickOutside} />

<ThreeBackground />

<div class="min-h-screen flex flex-col relative z-[1]">
  <!-- Header -->
  <header class="site-header bg-black text-white border-b-2 border-black sticky top-0 z-50">
    <nav class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="flex justify-between items-center h-16">
        <!-- Logo -->
        <a href="/" class="flex-shrink-0" onclick={closeMobileMenu}>
          <img src="/bidmo.to.png" alt="BidMo.to" class="h-10 w-auto" />
        </a>

        <!-- Desktop Navigation -->
        <div class="hidden md:flex md:space-x-6">
          <a
            href="/products"
            class="nav-link px-3 py-2 text-sm font-bold uppercase tracking-widest hover:text-[#FF3000] transition-colors duration-150 {currentPath.startsWith('/products') ? 'text-[#FF3000]' : ''}"
          >
            Browse
          </a>
          <a
            href="/about-us"
            class="nav-link px-3 py-2 text-sm font-bold uppercase tracking-widest hover:text-[#FF3000] transition-colors duration-150 {currentPath === '/about-us' ? 'text-[#FF3000]' : ''}"
          >
            About Us
          </a>
        </div>

        <!-- Desktop Actions -->
        <div class="hidden md:flex md:items-center md:space-x-4">
          <ThemeToggle onToggle={triggerThemeAnimation} />
          {#if $authStore.isAuthenticated}
            <!-- Inbox Button -->
            <a
              href="/inbox"
              class="relative px-3 py-2 text-sm font-bold hover:text-[#FF3000] transition-colors duration-150 {currentPath === '/inbox' ? 'text-[#FF3000]' : ''}"
              title="Inbox"
            >
              <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              {#if unreadCount > 0}
                <span class="absolute -top-1 -right-1 bg-[#FF3000] text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center unread-badge-pulse">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              {/if}
            </a>

            {#if $authStore.user?.role === 'admin'}
              <a
                href="/admin/reports"
                class="px-3 py-2 text-sm font-bold hover:text-[#FF3000] transition-colors duration-150 {currentPath === '/admin/reports' ? 'text-[#FF3000]' : ''}"
                title="Reports"
              >
                <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              </a>
              <a
                href="/admin/analytics"
                class="px-3 py-2 text-sm font-bold hover:text-[#FF3000] transition-colors duration-150 {currentPath === '/admin/analytics' ? 'text-[#FF3000]' : ''}"
                title="Analytics"
              >
                <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M3 13h2v8H3zm6-4h2v12H9zm6-6h2v18h-2zm6 10h2v8h-2z" />
                </svg>
              </a>
            {/if}

            <a
              href="/sell"
              class="sell-btn inline-flex items-center px-4 py-2 text-sm font-bold uppercase tracking-widest bg-[#FF3000] text-white border-2 border-[#FF3000] hover:bg-white hover:text-[#FF3000] transition-colors duration-150 {currentPath === '/sell' ? 'ring-2 ring-white/30' : ''}"
            >
              + Sell
            </a>

            <!-- User Menu Dropdown -->
            <div class="user-menu-container relative">
              <button
                onclick={(e) => { e.stopPropagation(); toggleUserMenu(); }}
                class="flex items-center gap-2 px-4 py-2 text-sm font-bold uppercase tracking-wider hover:text-[#FF3000] transition-colors duration-150 {userMenuOpen ? 'text-[#FF3000]' : ''}"
              >
                <span>Hi, {$authStore.user?.name || 'User'}!</span>
                <svg class="w-4 h-4 transition-transform {userMenuOpen ? 'rotate-180' : ''}" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {#if userMenuOpen}
                <div class="user-dropdown card-bh absolute right-0 mt-2 w-48 py-1 z-50 !bg-bh-bg">
                  <a
                    href="/dashboard"
                    onclick={closeUserMenu}
                    class="block px-4 py-2 text-sm text-bh-fg hover:text-[#FF3000] transition-colors duration-150 font-bold uppercase tracking-wider {currentPath.startsWith('/dashboard') ? 'text-[#FF3000]' : ''}"
                  >
                    Dashboard
                  </a>
                  <a
                    href="/profile"
                    onclick={closeUserMenu}
                    class="block px-4 py-2 text-sm text-bh-fg hover:text-[#FF3000] transition-colors duration-150 font-bold uppercase tracking-wider {currentPath === '/profile' ? 'text-[#FF3000]' : ''}"
                  >
                    Profile
                  </a>
                  <a
                    href="/watchlist"
                    onclick={closeUserMenu}
                    class="block px-4 py-2 text-sm text-bh-fg hover:text-[#FF3000] transition-colors duration-150 font-bold uppercase tracking-wider {currentPath === '/watchlist' ? 'text-[#FF3000]' : ''}"
                  >
                    Watchlist
                  </a>
                  <div class="border-t border-bh-border my-1"></div>
                  <button
                    onclick={handleLogout}
                    class="w-full text-left px-4 py-2 text-sm text-bh-red hover:bg-bh-red hover:text-white transition-colors duration-150 font-bold uppercase tracking-wider"
                  >
                    Logout
                  </button>
                </div>
              {/if}
            </div>
          {:else}
            <a
              href="/login"
              class="px-3 py-2 text-sm font-bold uppercase tracking-widest hover:text-[#FF3000] transition-colors duration-150"
            >
              Login
            </a>
            <a
              href="/register"
              class="inline-flex items-center px-4 py-2 text-sm font-bold uppercase tracking-widest bg-[#FF3000] text-white border-2 border-[#FF3000] hover:bg-white hover:text-[#FF3000] transition-colors duration-150"
            >
              Register
            </a>
          {/if}
        </div>

        <!-- Mobile actions -->
        <div class="flex items-center gap-2 md:hidden">
          <ThemeToggle onToggle={triggerThemeAnimation} />
        </div>

        <!-- Mobile menu button -->
        <button
          onclick={toggleMobileMenu}
          class="md:hidden inline-flex items-center justify-center p-2 hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-white"
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
        <div class="mobile-menu md:hidden pb-4 space-y-1">
          <a
            href="/products"
            onclick={closeMobileMenu}
            class="block px-3 py-2 text-base font-bold uppercase tracking-widest hover:text-[#FF3000] transition-colors duration-150 {currentPath.startsWith('/products') ? 'text-[#FF3000]' : ''}"
          >
            Browse
          </a>
          <a
            href="/about-us"
            onclick={closeMobileMenu}
            class="block px-3 py-2 text-base font-bold uppercase tracking-widest hover:text-[#FF3000] transition-colors duration-150 {currentPath === '/about-us' ? 'text-[#FF3000]' : ''}"
          >
            About Us
          </a>
          {#if $authStore.isAuthenticated}
            <!-- Inbox Button -->
            <a
              href="/inbox"
              onclick={closeMobileMenu}
              class="flex items-center gap-2 px-3 py-2 text-base font-bold uppercase tracking-widest hover:text-[#FF3000] transition-colors duration-150 mt-2 {currentPath === '/inbox' ? 'text-[#FF3000]' : ''}"
            >
              <div class="relative">
                <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                {#if unreadCount > 0}
                  <span class="absolute -top-2 -right-2 bg-[#FF3000] text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                {/if}
              </div>
              <span>Inbox</span>
            </a>

            {#if $authStore.user?.role === 'admin'}
              <a
                href="/admin/reports"
                onclick={closeMobileMenu}
                class="block px-3 py-2 text-base font-bold uppercase tracking-widest hover:text-[#FF3000] transition-colors duration-150 mt-2 {currentPath === '/admin/reports' ? 'text-[#FF3000]' : ''}"
              >
                Reports
              </a>
              <a
                href="/admin/analytics"
                onclick={closeMobileMenu}
                class="block px-3 py-2 text-base font-bold uppercase tracking-widest hover:text-[#FF3000] transition-colors duration-150 {currentPath === '/admin/analytics' ? 'text-[#FF3000]' : ''}"
              >
                Analytics
              </a>
            {/if}

            <a
              href="/sell"
              onclick={closeMobileMenu}
              class="block px-3 py-2 bg-[#FF3000] text-white text-base font-bold uppercase tracking-widest mt-2 border-2 border-[#FF3000] {currentPath === '/sell' ? 'ring-2 ring-white/30' : ''}"
            >
              + Sell
            </a>

            <a
              href="/dashboard"
              onclick={closeMobileMenu}
              class="block px-3 py-2 text-base font-bold uppercase tracking-widest hover:text-[#FF3000] transition-colors duration-150 mt-2 {currentPath.startsWith('/dashboard') ? 'text-[#FF3000]' : ''}"
            >
              Dashboard
            </a>

            <a
              href="/profile"
              onclick={closeMobileMenu}
              class="block px-3 py-2 text-base font-bold uppercase tracking-widest hover:text-[#FF3000] transition-colors duration-150 mt-2 {currentPath === '/profile' ? 'text-[#FF3000]' : ''}"
            >
              Profile
            </a>

            <a
              href="/watchlist"
              onclick={closeMobileMenu}
              class="block px-3 py-2 text-base font-bold uppercase tracking-widest hover:text-[#FF3000] transition-colors duration-150 mt-2 {currentPath === '/watchlist' ? 'text-[#FF3000]' : ''}"
            >
              Watchlist
            </a>

            <!-- Mobile User Info -->
            <div class="pt-2 border-t border-white/20 mt-2">
              <div class="px-3 py-2 text-sm text-white/80 uppercase tracking-widest">
                Hi, {$authStore.user?.name || 'User'}!
              </div>
              <button
                onclick={handleLogout}
                class="w-full text-left px-3 py-2 text-base font-bold text-[#FF3000] hover:bg-[#FF3000] hover:text-white transition-colors duration-150 uppercase tracking-widest"
              >
                Logout
              </button>
            </div>
          {:else}
            <a
              href="/login"
              onclick={closeMobileMenu}
              class="block px-3 py-2 text-base font-bold uppercase tracking-widest hover:text-[#FF3000] transition-colors duration-150"
            >
              Login
            </a>
            <a
              href="/register"
              onclick={closeMobileMenu}
              class="block px-3 py-2 bg-[#FF3000] text-white text-base font-bold uppercase tracking-widest mt-2 border-2 border-[#FF3000]"
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
    {@render children()}
  </main>

  <!-- Footer -->
  <footer class="site-footer bg-black text-white border-t-2 border-black py-6 text-sm">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between">
      <p class="uppercase tracking-widest font-bold text-xs">&copy; 2025 BidMo.to</p>
      <p class="text-white/50 text-xs uppercase tracking-widest">Bid mo 'to!</p>
    </div>
  </footer>
</div>

<ThemeTransition active={animating} onMidpoint={handleAnimationMidpoint} onComplete={handleAnimationComplete} />

<style>
  /* User dropdown slide-in — Swiss: instant, precise */
  .user-dropdown {
    animation: dropdownIn 0.15s ease-out;
    transform-origin: top right;
  }

  @keyframes dropdownIn {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  /* Mobile menu slide-down */
  .mobile-menu {
    animation: mobileMenuIn 0.15s ease-out;
    overflow: hidden;
  }

  @keyframes mobileMenuIn {
    from {
      opacity: 0;
      transform: translateY(-6px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  /* Unread badge pulse */
  .unread-badge-pulse {
    animation: badgePulse 2s ease-in-out infinite;
  }

  @keyframes badgePulse {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.1); }
  }

  /* Dark mode: override header/footer for glass aesthetic */
  :global(html.dark) .sell-btn {
    background: var(--color-accent) !important;
    border-color: rgba(94, 106, 210, 0.5) !important;
    color: #fff !important;
    border-radius: 8px !important;
    text-transform: none !important;
    letter-spacing: normal !important;
  }

  :global(html.dark) .sell-btn:hover {
    background: var(--color-accent-bright) !important;
  }

  /* Dark mode nav links: revert uppercase */
  :global(html.dark) .nav-link {
    text-transform: none !important;
    letter-spacing: normal !important;
  }

  :global(html.dark) .nav-link:hover {
    color: var(--color-accent) !important;
  }
</style>
