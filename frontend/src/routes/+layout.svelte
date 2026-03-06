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

  function handleClickOutside(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (userMenuOpen && !target.closest('.user-menu-container')) {
      closeUserMenu();
    }
  }

  async function fetchUnreadCount() {
    if ($authStore.isAuthenticated) {
      const count = await getUnreadMessageCount();
      unreadCountStore.set(count);
    }
  }

  onMount(() => {
    fetchUnreadCount();
  });

  $effect(() => {
    if ($authStore.isAuthenticated) {
      fetchUnreadCount();
      watchlistStore.load();
    } else {
      unreadCountStore.reset();
      watchlistStore.reset();
    }
  });

  afterNavigate(() => {
    trackPageView();
  });
</script>

<svelte:window onclick={handleClickOutside} />

<ThreeBackground />

<div class="min-h-screen flex flex-col relative z-[1]">
  <!-- Header -->
  <header class="site-header bg-black text-white sticky top-0 z-50 border-b border-neutral-800">
    <nav class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="flex justify-between items-center h-14">
        <!-- Logo -->
        <a href="/" class="flex-shrink-0" onclick={closeMobileMenu}>
          <img src="/bidmo.to.png" alt="BidMo.to" class="h-8 w-auto" />
        </a>

        <!-- Desktop Navigation -->
        <div class="hidden md:flex md:items-center md:space-x-1">
          <a
            href="/products"
            class="nav-link px-4 py-2 text-[13px] font-medium tracking-wide hover:text-white/70 transition-colors duration-150 {currentPath.startsWith('/products') ? 'text-white' : 'text-white/60'}"
          >
            Browse
          </a>
          <a
            href="/about-us"
            class="nav-link px-4 py-2 text-[13px] font-medium tracking-wide hover:text-white/70 transition-colors duration-150 {currentPath === '/about-us' ? 'text-white' : 'text-white/60'}"
          >
            About
          </a>
        </div>

        <!-- Desktop Actions -->
        <div class="hidden md:flex md:items-center md:space-x-3">
          <ThemeToggle onToggle={triggerThemeAnimation} />
          {#if $authStore.isAuthenticated}
            <a
              href="/inbox"
              class="relative p-2 text-white/60 hover:text-white transition-colors duration-150 {currentPath === '/inbox' ? 'text-white' : ''}"
              title="Inbox"
            >
              <svg class="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              {#if unreadCount > 0}
                <span class="absolute top-0 right-0 bg-[#FF3000] text-white text-[10px] font-semibold rounded-full h-4 w-4 flex items-center justify-center">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              {/if}
            </a>

            {#if $authStore.user?.role === 'admin'}
              <a
                href="/admin/reports"
                class="p-2 text-white/60 hover:text-white transition-colors duration-150 {currentPath === '/admin/reports' ? 'text-white' : ''}"
                title="Reports"
              >
                <svg class="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              </a>
              <a
                href="/admin/analytics"
                class="p-2 text-white/60 hover:text-white transition-colors duration-150 {currentPath === '/admin/analytics' ? 'text-white' : ''}"
                title="Analytics"
              >
                <svg class="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M3 13h2v8H3zm6-4h2v12H9zm6-6h2v18h-2zm6 10h2v8h-2z" />
                </svg>
              </a>
            {/if}

            <a
              href="/sell"
              class="sell-btn text-[13px] font-semibold px-4 py-1.5 bg-[#FF3000] text-white hover:bg-[#e02a00] transition-colors duration-150 {currentPath === '/sell' ? 'ring-1 ring-white/20' : ''}"
            >
              Sell Item
            </a>

            <!-- User Menu -->
            <div class="user-menu-container relative">
              <button
                onclick={(e) => { e.stopPropagation(); toggleUserMenu(); }}
                class="flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-medium text-white/60 hover:text-white transition-colors duration-150 {userMenuOpen ? 'text-white' : ''}"
              >
                <span>{$authStore.user?.name || 'Account'}</span>
                <svg class="w-3.5 h-3.5 transition-transform duration-150 {userMenuOpen ? 'rotate-180' : ''}" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {#if userMenuOpen}
                <div class="user-dropdown absolute right-0 mt-1 w-44 py-1 z-50 bg-white border border-neutral-200 text-neutral-900">
                  <a href="/dashboard" onclick={closeUserMenu}
                    class="block px-4 py-2 text-[13px] font-medium hover:bg-neutral-50 transition-colors duration-100 {currentPath.startsWith('/dashboard') ? 'text-[#FF3000]' : ''}">
                    Dashboard
                  </a>
                  <a href="/profile" onclick={closeUserMenu}
                    class="block px-4 py-2 text-[13px] font-medium hover:bg-neutral-50 transition-colors duration-100 {currentPath === '/profile' ? 'text-[#FF3000]' : ''}">
                    Profile
                  </a>
                  <a href="/watchlist" onclick={closeUserMenu}
                    class="block px-4 py-2 text-[13px] font-medium hover:bg-neutral-50 transition-colors duration-100 {currentPath === '/watchlist' ? 'text-[#FF3000]' : ''}">
                    Watchlist
                  </a>
                  <div class="border-t border-neutral-100 my-1"></div>
                  <button
                    onclick={handleLogout}
                    class="w-full text-left px-4 py-2 text-[13px] font-medium text-red-600 hover:bg-red-50 transition-colors duration-100"
                  >
                    Sign Out
                  </button>
                </div>
              {/if}
            </div>
          {:else}
            <a
              href="/login"
              class="px-4 py-1.5 text-[13px] font-medium text-white/60 hover:text-white transition-colors duration-150"
            >
              Sign In
            </a>
            <a
              href="/register"
              class="px-4 py-1.5 text-[13px] font-semibold bg-[#FF3000] text-white hover:bg-[#e02a00] transition-colors duration-150"
            >
              Get Started
            </a>
          {/if}
        </div>

        <!-- Mobile actions -->
        <div class="flex items-center gap-2 md:hidden">
          <ThemeToggle onToggle={triggerThemeAnimation} />
          <button
            onclick={toggleMobileMenu}
            class="inline-flex items-center justify-center p-2 text-white/60 hover:text-white transition-colors"
            aria-label="Toggle menu"
          >
            <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
              {#if mobileMenuOpen}
                <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
              {:else}
                <path stroke-linecap="round" stroke-linejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              {/if}
            </svg>
          </button>
        </div>
      </div>

      <!-- Mobile Navigation -->
      {#if mobileMenuOpen}
        <div class="mobile-menu md:hidden pb-4 border-t border-white/10 mt-2 pt-2 space-y-0.5">
          <a href="/products" onclick={closeMobileMenu}
            class="block px-3 py-2.5 text-sm font-medium {currentPath.startsWith('/products') ? 'text-white' : 'text-white/60'} hover:text-white transition-colors">
            Browse
          </a>
          <a href="/about-us" onclick={closeMobileMenu}
            class="block px-3 py-2.5 text-sm font-medium {currentPath === '/about-us' ? 'text-white' : 'text-white/60'} hover:text-white transition-colors">
            About
          </a>
          {#if $authStore.isAuthenticated}
            <a href="/inbox" onclick={closeMobileMenu}
              class="flex items-center gap-2 px-3 py-2.5 text-sm font-medium {currentPath === '/inbox' ? 'text-white' : 'text-white/60'} hover:text-white transition-colors">
              <span>Inbox</span>
              {#if unreadCount > 0}
                <span class="bg-[#FF3000] text-white text-[10px] font-semibold rounded-full h-4 px-1.5 flex items-center justify-center">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              {/if}
            </a>

            {#if $authStore.user?.role === 'admin'}
              <a href="/admin/reports" onclick={closeMobileMenu}
                class="block px-3 py-2.5 text-sm font-medium {currentPath === '/admin/reports' ? 'text-white' : 'text-white/60'} hover:text-white transition-colors">
                Reports
              </a>
              <a href="/admin/analytics" onclick={closeMobileMenu}
                class="block px-3 py-2.5 text-sm font-medium {currentPath === '/admin/analytics' ? 'text-white' : 'text-white/60'} hover:text-white transition-colors">
                Analytics
              </a>
            {/if}

            <a href="/sell" onclick={closeMobileMenu}
              class="block mx-3 mt-2 px-3 py-2.5 text-sm font-semibold text-center bg-[#FF3000] text-white">
              Sell Item
            </a>

            <div class="border-t border-white/10 mx-3 my-2"></div>

            <a href="/dashboard" onclick={closeMobileMenu}
              class="block px-3 py-2.5 text-sm font-medium {currentPath.startsWith('/dashboard') ? 'text-white' : 'text-white/60'} hover:text-white transition-colors">
              Dashboard
            </a>
            <a href="/profile" onclick={closeMobileMenu}
              class="block px-3 py-2.5 text-sm font-medium {currentPath === '/profile' ? 'text-white' : 'text-white/60'} hover:text-white transition-colors">
              Profile
            </a>
            <a href="/watchlist" onclick={closeMobileMenu}
              class="block px-3 py-2.5 text-sm font-medium {currentPath === '/watchlist' ? 'text-white' : 'text-white/60'} hover:text-white transition-colors">
              Watchlist
            </a>

            <div class="border-t border-white/10 mx-3 my-2"></div>
            <div class="px-3 py-1 text-xs text-white/40">
              {$authStore.user?.name || 'Account'}
            </div>
            <button
              onclick={handleLogout}
              class="w-full text-left px-3 py-2.5 text-sm font-medium text-red-400 hover:text-red-300 transition-colors"
            >
              Sign Out
            </button>
          {:else}
            <div class="border-t border-white/10 mx-3 my-2"></div>
            <a href="/login" onclick={closeMobileMenu}
              class="block px-3 py-2.5 text-sm font-medium text-white/60 hover:text-white transition-colors">
              Sign In
            </a>
            <a href="/register" onclick={closeMobileMenu}
              class="block mx-3 mt-1 px-3 py-2.5 text-sm font-semibold text-center bg-[#FF3000] text-white">
              Get Started
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
  <footer class="site-footer bg-neutral-950 text-neutral-500 border-t border-neutral-800 py-5 text-xs">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between">
      <p class="font-medium">&copy; 2025 BidMo.to</p>
      <p class="text-neutral-600">Auction Marketplace</p>
    </div>
  </footer>
</div>

<ThemeTransition active={animating} onMidpoint={handleAnimationMidpoint} onComplete={handleAnimationComplete} />

<style>
  .user-dropdown {
    animation: dropdownIn 0.12s ease-out;
    transform-origin: top right;
  }

  @keyframes dropdownIn {
    from { opacity: 0; transform: translateY(-4px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .mobile-menu {
    animation: mobileMenuIn 0.12s ease-out;
    overflow: hidden;
  }

  @keyframes mobileMenuIn {
    from { opacity: 0; transform: translateY(-4px); }
    to { opacity: 1; transform: translateY(0); }
  }

  /* Dark mode header: glass */
  :global(html.dark) .site-header {
    background: rgba(5, 5, 6, 0.85) !important;
    backdrop-filter: blur(20px) saturate(1.2);
    -webkit-backdrop-filter: blur(20px) saturate(1.2);
    border-bottom-color: rgba(255, 255, 255, 0.06) !important;
  }

  :global(html.dark) .sell-btn {
    background: var(--color-accent) !important;
    border-radius: 6px !important;
  }
  :global(html.dark) .sell-btn:hover {
    background: var(--color-accent-bright) !important;
  }

  :global(html.dark) .user-dropdown {
    background: #0a0a0f !important;
    border: 1px solid rgba(255, 255, 255, 0.08) !important;
    border-radius: 8px !important;
    color: #ededef !important;
  }
  :global(html.dark) .user-dropdown a {
    color: rgba(255, 255, 255, 0.7) !important;
  }
  :global(html.dark) .user-dropdown a:hover {
    background: rgba(255, 255, 255, 0.05) !important;
    color: #fff !important;
  }
  :global(html.dark) .user-dropdown button {
    color: #e06060 !important;
  }
  :global(html.dark) .user-dropdown button:hover {
    background: rgba(224, 96, 96, 0.1) !important;
  }

  :global(html.dark) .site-footer {
    background: #020203 !important;
    border-top-color: rgba(255, 255, 255, 0.06) !important;
    color: #555 !important;
  }
</style>
