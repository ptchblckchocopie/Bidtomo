<script lang="ts">
  import '../app.css';
  import { authStore } from '$lib/stores/auth';
  import { goto, afterNavigate } from '$app/navigation';
  import { page } from '$app/stores';
  import { logout as apiLogout, getUnreadMessageCount } from '$lib/api';
  import { onMount } from 'svelte';
  import { unreadCountStore } from '$lib/stores/inbox';
  import { watchlistStore } from '$lib/stores/watchlist';
  import { trackPageView } from '$lib/analytics';
  import ThreeBackground from '$lib/components/ThreeBackground.svelte';
  import CustomCursor from '$lib/components/CustomCursor.svelte';
  import type { Snippet } from 'svelte';

  let { children }: { children: Snippet } = $props();

  let currentPath = $derived($page.url.pathname);

  let mobileMenuOpen = $state(false);
  let userMenuOpen = $state(false);
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
<CustomCursor />

<div class="min-h-screen flex flex-col relative z-[1]">
  <!-- Header -->
  <header class="site-header sticky top-0 z-50">
    <nav class="max-w-6xl mx-auto px-6 md:px-8 lg:px-12">
      <div class="flex justify-between items-center h-14">
        <!-- Logo -->
        <a href="/" class="flex-shrink-0 flex items-center gap-2.5" onclick={closeMobileMenu}>
          <img src="/bidmo.to.png" alt="BidMo.to" class="h-7 w-auto" />
          <span class="hidden sm:inline font-display text-base font-bold tracking-tight text-[var(--color-fg)]">BidMo.to</span>
        </a>

        <!-- Desktop Navigation -->
        <div class="hidden md:flex md:items-center md:gap-1">
          <a
            href="/products"
            class="px-3 py-1.5 text-sm font-medium rounded-md transition-colors duration-150 {currentPath.startsWith('/products') ? 'text-[var(--color-fg)] bg-[var(--color-surface)]' : 'text-[var(--color-muted-fg)] hover:text-[var(--color-fg)] hover:bg-[var(--color-surface)]'}"
          >
            Browse
          </a>
          <a
            href="/about-us"
            class="px-3 py-1.5 text-sm font-medium rounded-md transition-colors duration-150 {currentPath === '/about-us' ? 'text-[var(--color-fg)] bg-[var(--color-surface)]' : 'text-[var(--color-muted-fg)] hover:text-[var(--color-fg)] hover:bg-[var(--color-surface)]'}"
          >
            About
          </a>
        </div>

        <!-- Desktop Actions -->
        <div class="hidden md:flex md:items-center md:gap-3">
          {#if $authStore.isAuthenticated}
            <a
              href="/inbox"
              class="relative p-2 text-[var(--color-muted-fg)] hover:text-[var(--color-fg)] transition-colors duration-100 {currentPath === '/inbox' ? 'text-[var(--color-fg)]' : ''}"
              title="Inbox"
            >
              <svg class="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              {#if unreadCount > 0}
                <span class="absolute -top-0.5 -right-0.5 bg-[var(--color-fg)] text-[var(--color-bg)] text-[9px] font-bold rounded-full h-4 w-4 flex items-center justify-center">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              {/if}
            </a>

            {#if $authStore.user?.role === 'admin'}
              <a
                href="/admin/reports"
                class="p-2 text-[var(--color-muted-fg)] hover:text-[var(--color-fg)] transition-colors duration-100 {currentPath === '/admin/reports' ? 'text-[var(--color-fg)]' : ''}"
                title="Reports"
              >
                <svg class="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              </a>
              <a
                href="/admin/analytics"
                class="p-2 text-[var(--color-muted-fg)] hover:text-[var(--color-fg)] transition-colors duration-100 {currentPath === '/admin/analytics' ? 'text-[var(--color-fg)]' : ''}"
                title="Analytics"
              >
                <svg class="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M3 13h2v8H3zm6-4h2v12H9zm6-6h2v18h-2zm6 10h2v8h-2z" />
                </svg>
              </a>
            {/if}

            <a
              href="/sell"
              class="btn-bh-red text-xs {currentPath === '/sell' ? 'bg-[var(--color-bg)] text-[var(--color-fg)]' : ''}"
            >
              Sell &rarr;
            </a>

            <!-- User Menu -->
            <div class="user-menu-container relative">
              <button
                onclick={(e) => { e.stopPropagation(); toggleUserMenu(); }}
                class="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-[var(--color-muted-fg)] hover:text-[var(--color-fg)] transition-colors duration-150 rounded-md hover:bg-[var(--color-surface)] {userMenuOpen ? 'text-[var(--color-fg)] bg-[var(--color-surface)]' : ''}"
              >
                <span>{$authStore.user?.name || 'Account'}</span>
                <svg class="w-3 h-3 transition-transform duration-100 {userMenuOpen ? 'rotate-180' : ''}" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {#if userMenuOpen}
                <div class="user-dropdown absolute right-0 mt-1 w-52 py-1 z-50">
                  <a href="/dashboard" onclick={closeUserMenu}
                    class="dropdown-link block px-4 py-2.5 text-sm {currentPath.startsWith('/dashboard') ? 'active' : ''}">
                    Dashboard
                  </a>
                  <a href="/profile" onclick={closeUserMenu}
                    class="dropdown-link block px-4 py-2.5 text-sm {currentPath === '/profile' ? 'active' : ''}">
                    Profile
                  </a>
                  <a href="/watchlist" onclick={closeUserMenu}
                    class="dropdown-link block px-4 py-2.5 text-sm {currentPath === '/watchlist' ? 'active' : ''}">
                    Watchlist
                  </a>
                  <div class="dropdown-divider"></div>
                  <button
                    onclick={handleLogout}
                    class="dropdown-link w-full text-left px-4 py-2.5 text-sm text-[var(--color-red)]"
                  >
                    Sign Out
                  </button>
                </div>
              {/if}
            </div>
          {:else}
            <a
              href="/login"
              class="px-3 py-1.5 text-sm font-medium text-[var(--color-muted-fg)] hover:text-[var(--color-fg)] transition-colors duration-150 rounded-md hover:bg-[var(--color-surface)]"
            >
              Sign In
            </a>
            <a
              href="/register"
              class="btn-bh-red text-xs"
            >
              Register &rarr;
            </a>
          {/if}
        </div>

        <!-- Mobile actions -->
        <div class="flex items-center gap-2 md:hidden">
          <button
            onclick={toggleMobileMenu}
            class="inline-flex items-center justify-center p-2 min-h-[44px] min-w-[44px] text-[var(--color-muted-fg)] border border-[var(--color-border)] rounded-md hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-fg)] transition-colors duration-150"
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
        <div class="mobile-menu md:hidden pb-4 border-t border-[var(--color-border)] mt-2 pt-4 space-y-0">
          <a href="/products" onclick={closeMobileMenu}
            class="block px-0 py-3 text-sm font-medium border-b border-[var(--color-border)] {currentPath.startsWith('/products') ? 'text-[var(--color-fg)] font-bold' : 'text-[var(--color-muted-fg)]'} hover:text-[var(--color-fg)] transition-colors">
            Browse
          </a>
          <a href="/about-us" onclick={closeMobileMenu}
            class="block px-0 py-3 text-sm font-medium border-b border-[var(--color-border)] {currentPath === '/about-us' ? 'text-[var(--color-fg)] font-bold' : 'text-[var(--color-muted-fg)]'} hover:text-[var(--color-fg)] transition-colors">
            About
          </a>
          {#if $authStore.isAuthenticated}
            <a href="/inbox" onclick={closeMobileMenu}
              class="flex items-center gap-2 px-0 py-3 text-sm font-medium border-b border-[var(--color-border)] {currentPath === '/inbox' ? 'text-[var(--color-fg)] font-bold' : 'text-[var(--color-muted-fg)]'} hover:text-[var(--color-fg)] transition-colors">
              <span>Inbox</span>
              {#if unreadCount > 0}
                <span class="bg-[var(--color-fg)] text-[var(--color-bg)] text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              {/if}
            </a>

            {#if $authStore.user?.role === 'admin'}
              <a href="/admin/reports" onclick={closeMobileMenu}
                class="block px-0 py-3 text-sm font-medium border-b border-[var(--color-border)] {currentPath === '/admin/reports' ? 'text-[var(--color-fg)] font-bold' : 'text-[var(--color-muted-fg)]'} hover:text-[var(--color-fg)] transition-colors">
                Reports
              </a>
              <a href="/admin/analytics" onclick={closeMobileMenu}
                class="block px-0 py-3 text-sm font-medium border-b border-[var(--color-border)] {currentPath === '/admin/analytics' ? 'text-[var(--color-fg)] font-bold' : 'text-[var(--color-muted-fg)]'} hover:text-[var(--color-fg)] transition-colors">
                Analytics
              </a>
            {/if}

            <a href="/sell" onclick={closeMobileMenu}
              class="block mt-4 btn-bh-red text-center min-h-[44px] flex items-center justify-center">
              Sell Item &rarr;
            </a>

            <div class="border-t border-[var(--color-border)] my-4"></div>

            <a href="/dashboard" onclick={closeMobileMenu}
              class="block px-0 py-3 text-sm font-medium border-b border-[var(--color-border)] {currentPath.startsWith('/dashboard') ? 'text-[var(--color-fg)] font-bold' : 'text-[var(--color-muted-fg)]'} hover:text-[var(--color-fg)] transition-colors">
              Dashboard
            </a>
            <a href="/profile" onclick={closeMobileMenu}
              class="block px-0 py-3 text-sm font-medium border-b border-[var(--color-border)] {currentPath === '/profile' ? 'text-[var(--color-fg)] font-bold' : 'text-[var(--color-muted-fg)]'} hover:text-[var(--color-fg)] transition-colors">
              Profile
            </a>
            <a href="/watchlist" onclick={closeMobileMenu}
              class="block px-0 py-3 text-sm font-medium border-b border-[var(--color-border)] {currentPath === '/watchlist' ? 'text-[var(--color-fg)] font-bold' : 'text-[var(--color-muted-fg)]'} hover:text-[var(--color-fg)] transition-colors">
              Watchlist
            </a>

            <div class="pt-2">
              <div class="text-xs font-medium text-[var(--color-muted-fg)]">
                {$authStore.user?.name || 'Account'}
              </div>
            </div>
            <button
              onclick={handleLogout}
              class="w-full text-left py-3 text-sm font-medium text-[var(--color-red)] hover:underline transition-colors min-h-[44px]"
            >
              Sign Out
            </button>
          {:else}
            <div class="border-t border-[var(--color-border)] my-4"></div>
            <a href="/login" onclick={closeMobileMenu}
              class="block px-0 py-3 text-sm font-medium text-[var(--color-muted-fg)] hover:text-[var(--color-fg)] transition-colors">
              Sign In
            </a>
            <a href="/register" onclick={closeMobileMenu}
              class="block mt-2 btn-bh-red text-center min-h-[44px] flex items-center justify-center">
              Register &rarr;
            </a>
          {/if}
        </div>
      {/if}
    </nav>
  </header>

  <!-- Main Content -->
  <main class="flex-1 w-full max-w-6xl mx-auto px-6 md:px-8 lg:px-12">
    {@render children()}
  </main>

  <!-- Footer — Editorial -->
  <footer class="site-footer">
    <div class="max-w-6xl mx-auto px-6 md:px-8 lg:px-12 py-12">
      <div class="grid grid-cols-12 gap-8">
        <div class="col-span-12 sm:col-span-5">
          <span class="font-display text-2xl font-bold text-[var(--color-fg)]">BidMo.to</span>
          <p class="mt-3 text-sm text-[var(--color-muted-fg)] leading-relaxed max-w-xs">
            The Filipino auction marketplace. Bid, buy, and sell unique items.
          </p>
        </div>
        <div class="col-span-6 sm:col-span-2">
          <h4 class="label-bh mb-4">Navigate</h4>
          <div class="space-y-2">
            <a href="/products" class="block text-sm text-[var(--color-muted-fg)] hover:text-[var(--color-fg)] hover:underline transition-colors">Browse</a>
            <a href="/about-us" class="block text-sm text-[var(--color-muted-fg)] hover:text-[var(--color-fg)] hover:underline transition-colors">About</a>
            <a href="/sell" class="block text-sm text-[var(--color-muted-fg)] hover:text-[var(--color-fg)] hover:underline transition-colors">Sell</a>
          </div>
        </div>
        <div class="col-span-6 sm:col-span-2">
          <h4 class="label-bh mb-4">Account</h4>
          <div class="space-y-2">
            <a href="/login" class="block text-sm text-[var(--color-muted-fg)] hover:text-[var(--color-fg)] hover:underline transition-colors">Sign In</a>
            <a href="/register" class="block text-sm text-[var(--color-muted-fg)] hover:text-[var(--color-fg)] hover:underline transition-colors">Register</a>
          </div>
        </div>
        <div class="col-span-12 sm:col-span-3 border-t sm:border-t-0 sm:border-l border-[var(--color-border-light)] pt-6 sm:pt-0 sm:pl-8 mt-4 sm:mt-0">
          <span class="label-bh">&copy; {new Date().getFullYear()}</span>
          <p class="mt-1 text-sm text-[var(--color-muted-fg)]">All rights reserved.</p>
        </div>
      </div>
    </div>
  </footer>
</div>


<style>
  /* Dropdown — soft, rounded */
  .user-dropdown {
    background: var(--color-bg);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
    animation: dropdownIn 0.1s;
    transform-origin: top right;
  }
  .dropdown-link {
    font-family: var(--font-body);
    color: var(--color-muted-fg);
    transition: all 100ms;
    border-radius: var(--radius-sm);
    margin: 0 4px;
  }
  .dropdown-link:hover {
    background: var(--color-surface-hover);
    color: var(--color-fg);
  }
  .dropdown-link.active {
    color: var(--color-fg);
    font-weight: 600;
  }
  .dropdown-divider {
    height: 1px;
    background: var(--color-border);
    margin: 4px 0;
  }

  @keyframes dropdownIn {
    from { opacity: 0; transform: translateY(-4px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .mobile-menu {
    animation: mobileMenuIn 0.1s;
    overflow: hidden;
  }

  @keyframes mobileMenuIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
</style>
