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
  import { t } from '$lib/stores/locale';
  import ClickSpark from '$lib/components/ClickSpark.svelte';
  import PageTransition from '$lib/components/PageTransition.svelte';
  import LanguageSwitcher from '$lib/components/LanguageSwitcher.svelte';
  import type { Snippet } from 'svelte';

  let { children: pageContent }: { children: Snippet } = $props();

  let currentPath = $derived($page.url.pathname);

  let mobileMenuOpen = $state(false);
  let userMenuOpen = $state(false);
  let unreadCount = $derived($unreadCountStore);
  let scrolled = $state(false);

  // Defer heavy decorative components until after first paint
  let showDecorations = $state(false);

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

  function handleScroll() {
    scrolled = window.scrollY > 20;
  }

  async function fetchUnreadCount() {
    if ($authStore.isAuthenticated) {
      const count = await getUnreadMessageCount();
      unreadCountStore.set(count);
    }
  }

  onMount(() => {
    fetchUnreadCount();
    window.addEventListener('scroll', handleScroll, { passive: true });

    // Defer heavy decorative components until after initial paint is done
    // This keeps LCP and TBT low — decorations load after the page is interactive
    const idleCallback = typeof requestIdleCallback === 'function'
      ? requestIdleCallback
      : (cb: () => void) => setTimeout(cb, 200);
    idleCallback(() => { showDecorations = true; });

    return () => window.removeEventListener('scroll', handleScroll);
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

{#if showDecorations}
  {#await import('$lib/components/ThreeBackground.svelte') then { default: ThreeBackground }}
    <ThreeBackground />
  {/await}
  {#await import('$lib/components/FloatingParticles.svelte') then { default: FloatingParticles }}
    <FloatingParticles />
  {/await}
{/if}

<!-- Noise grain overlay — static, no animation on low-end -->
<div class="noise-overlay" aria-hidden="true"></div>

<ClickSpark sparkColor="#fff" sparkSize={10} sparkRadius={15} sparkCount={8} duration={400}>
<div class="min-h-screen flex flex-col relative z-[2]">
  <!-- Header -->
  <header class="site-header sticky top-0 z-50 header-animate" class:header-scrolled={scrolled}>
    <nav class="nav-container">
      <div class="nav-layout">
        <!-- Logo — left -->
        <a href="/" class="nav-logo group" onclick={closeMobileMenu}>
          <img src="/bidmo.to.png" alt="BidMo.to" class="h-7 w-auto transition-transform duration-300 group-hover:scale-110" />
          <span class="hidden sm:inline font-display text-base font-bold tracking-tight text-[var(--color-fg)] transition-all duration-300 group-hover:text-shimmer">BidMo.to</span>
        </a>

        <!-- Center navigation — desktop only -->
        <div class="nav-center">
          <a
            href="/products"
            class="nav-link px-3 py-1.5 text-sm font-medium rounded-md transition-all duration-200 {currentPath.startsWith('/products') ? 'text-[var(--color-fg)] bg-[var(--color-surface)] nav-active' : 'text-[var(--color-muted-fg)] hover:text-[var(--color-fg)] hover:bg-[var(--color-surface)]'}"
          >
            {$t('nav.browse')}
          </a>
          <a
            href="/about-us"
            class="nav-link px-3 py-1.5 text-sm font-medium rounded-md transition-all duration-200 {currentPath === '/about-us' ? 'text-[var(--color-fg)] bg-[var(--color-surface)] nav-active' : 'text-[var(--color-muted-fg)] hover:text-[var(--color-fg)] hover:bg-[var(--color-surface)]'}"
          >
            {$t('nav.about')}
          </a>
        </div>

        <!-- Right actions — desktop only -->
        <div class="nav-actions">
          <LanguageSwitcher />
          {#if $authStore.isAuthenticated}
            <a
              href="/inbox"
              class="relative p-2 text-[var(--color-muted-fg)] hover:text-[var(--color-fg)] transition-all duration-200 hover:scale-110 {currentPath === '/inbox' ? 'text-[var(--color-fg)]' : ''}"
              title={$t('nav.inbox')}
            >
              <svg class="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              {#if unreadCount > 0}
                <span class="absolute -top-0.5 -right-0.5 bg-[var(--color-accent)] text-white text-[9px] font-bold rounded-full h-4 w-4 flex items-center justify-center pulse-glow">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              {/if}
            </a>

            {#if $authStore.user?.role === 'admin'}
              <a
                href="/admin/reports"
                class="p-2 text-[var(--color-muted-fg)] hover:text-[var(--color-fg)] transition-all duration-200 hover:scale-110 {currentPath === '/admin/reports' ? 'text-[var(--color-fg)]' : ''}"
                title={$t('nav.reports')}
              >
                <svg class="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              </a>
              <a
                href="/admin/analytics"
                class="p-2 text-[var(--color-muted-fg)] hover:text-[var(--color-fg)] transition-all duration-200 hover:scale-110 {currentPath === '/admin/analytics' ? 'text-[var(--color-fg)]' : ''}"
                title={$t('nav.analytics')}
              >
                <svg class="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M3 13h2v8H3zm6-4h2v12H9zm6-6h2v18h-2zm6 10h2v8h-2z" />
                </svg>
              </a>
            {/if}

            <a
              href="/sell"
              class="btn-bh-red text-xs sell-btn {currentPath === '/sell' ? 'bg-[var(--color-bg)] text-[var(--color-fg)]' : ''}"
            >
              <span class="relative z-10">{$t('nav.sell')} &rarr;</span>
            </a>

            <!-- User Menu -->
            <div class="user-menu-container relative">
              <button
                onclick={(e) => { e.stopPropagation(); toggleUserMenu(); }}
                class="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-[var(--color-muted-fg)] hover:text-[var(--color-fg)] transition-all duration-200 rounded-md hover:bg-[var(--color-surface)] {userMenuOpen ? 'text-[var(--color-fg)] bg-[var(--color-surface)]' : ''}"
              >
                <span>{$authStore.user?.name || $t('nav.account')}</span>
                <svg class="w-3 h-3 transition-transform duration-200 {userMenuOpen ? 'rotate-180' : ''}" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {#if userMenuOpen}
                <div class="user-dropdown absolute right-0 mt-1 w-52 py-1 z-50">
                  <a href="/dashboard" onclick={closeUserMenu}
                    class="dropdown-link block px-4 py-2.5 text-sm {currentPath.startsWith('/dashboard') ? 'active' : ''}">
                    {$t('nav.dashboard')}
                  </a>
                  <a href="/profile" onclick={closeUserMenu}
                    class="dropdown-link block px-4 py-2.5 text-sm {currentPath === '/profile' ? 'active' : ''}">
                    {$t('nav.profile')}
                  </a>
                  <a href="/watchlist" onclick={closeUserMenu}
                    class="dropdown-link block px-4 py-2.5 text-sm {currentPath === '/watchlist' ? 'active' : ''}">
                    {$t('nav.watchlist')}
                  </a>
                  <div class="dropdown-divider"></div>
                  <button
                    onclick={handleLogout}
                    class="dropdown-link w-full text-left px-4 py-2.5 text-sm text-[var(--color-red)]"
                  >
                    {$t('nav.signOut')}
                  </button>
                </div>
              {/if}
            </div>
          {:else}
            <a
              href="/login"
              class="px-3 py-1.5 text-sm font-medium text-[var(--color-muted-fg)] hover:text-[var(--color-fg)] transition-all duration-200 rounded-md hover:bg-[var(--color-surface)]"
            >
              {$t('nav.signIn')}
            </a>
            <a
              href="/register"
              class="btn-bh-red text-xs"
            >
              {$t('nav.register')} &rarr;
            </a>
          {/if}
        </div>

        <!-- Mobile actions -->
        <div class="nav-mobile-toggle ml-auto">
          <button
            onclick={toggleMobileMenu}
            class="inline-flex items-center justify-center p-2 min-h-[44px] min-w-[44px] text-[var(--color-muted-fg)] border border-[var(--color-border)] rounded-md hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-fg)] transition-all duration-200"
            aria-label="Toggle menu"
          >
            <svg class="h-5 w-5 transition-transform duration-300 {mobileMenuOpen ? 'rotate-90' : ''}" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
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
        <div class="mobile-menu nav-mobile-menu pb-4 border-t border-[var(--color-border)] mt-2 pt-4 space-y-0">
          <div class="px-0 py-2 mb-2 border-b border-[var(--color-border)]">
            <LanguageSwitcher />
          </div>
          <a href="/products" onclick={closeMobileMenu}
            class="block px-0 py-3 text-sm font-medium border-b border-[var(--color-border)] {currentPath.startsWith('/products') ? 'text-[var(--color-fg)] font-bold' : 'text-[var(--color-muted-fg)]'} hover:text-[var(--color-fg)] transition-colors">
            {$t('nav.browse')}
          </a>
          <a href="/about-us" onclick={closeMobileMenu}
            class="block px-0 py-3 text-sm font-medium border-b border-[var(--color-border)] {currentPath === '/about-us' ? 'text-[var(--color-fg)] font-bold' : 'text-[var(--color-muted-fg)]'} hover:text-[var(--color-fg)] transition-colors">
            {$t('nav.about')}
          </a>
          {#if $authStore.isAuthenticated}
            <a href="/inbox" onclick={closeMobileMenu}
              class="flex items-center gap-2 px-0 py-3 text-sm font-medium border-b border-[var(--color-border)] {currentPath === '/inbox' ? 'text-[var(--color-fg)] font-bold' : 'text-[var(--color-muted-fg)]'} hover:text-[var(--color-fg)] transition-colors">
              <span>{$t('nav.inbox')}</span>
              {#if unreadCount > 0}
                <span class="bg-[var(--color-accent)] text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              {/if}
            </a>

            {#if $authStore.user?.role === 'admin'}
              <a href="/admin/reports" onclick={closeMobileMenu}
                class="block px-0 py-3 text-sm font-medium border-b border-[var(--color-border)] {currentPath === '/admin/reports' ? 'text-[var(--color-fg)] font-bold' : 'text-[var(--color-muted-fg)]'} hover:text-[var(--color-fg)] transition-colors">
                {$t('nav.reports')}
              </a>
              <a href="/admin/analytics" onclick={closeMobileMenu}
                class="block px-0 py-3 text-sm font-medium border-b border-[var(--color-border)] {currentPath === '/admin/analytics' ? 'text-[var(--color-fg)] font-bold' : 'text-[var(--color-muted-fg)]'} hover:text-[var(--color-fg)] transition-colors">
                {$t('nav.analytics')}
              </a>
            {/if}

            <a href="/sell" onclick={closeMobileMenu}
              class="block mt-4 btn-bh-red text-center min-h-[44px] flex items-center justify-center">
              {$t('nav.sellItem')} &rarr;
            </a>

            <div class="border-t border-[var(--color-border)] my-4"></div>

            <a href="/dashboard" onclick={closeMobileMenu}
              class="block px-0 py-3 text-sm font-medium border-b border-[var(--color-border)] {currentPath.startsWith('/dashboard') ? 'text-[var(--color-fg)] font-bold' : 'text-[var(--color-muted-fg)]'} hover:text-[var(--color-fg)] transition-colors">
              {$t('nav.dashboard')}
            </a>
            <a href="/profile" onclick={closeMobileMenu}
              class="block px-0 py-3 text-sm font-medium border-b border-[var(--color-border)] {currentPath === '/profile' ? 'text-[var(--color-fg)] font-bold' : 'text-[var(--color-muted-fg)]'} hover:text-[var(--color-fg)] transition-colors">
              {$t('nav.profile')}
            </a>
            <a href="/watchlist" onclick={closeMobileMenu}
              class="block px-0 py-3 text-sm font-medium border-b border-[var(--color-border)] {currentPath === '/watchlist' ? 'text-[var(--color-fg)] font-bold' : 'text-[var(--color-muted-fg)]'} hover:text-[var(--color-fg)] transition-colors">
              {$t('nav.watchlist')}
            </a>

            <div class="pt-2">
              <div class="text-xs font-medium text-[var(--color-muted-fg)]">
                {$authStore.user?.name || $t('nav.account')}
              </div>
            </div>
            <button
              onclick={handleLogout}
              class="w-full text-left py-3 text-sm font-medium text-[var(--color-red)] hover:underline transition-colors min-h-[44px]"
            >
              {$t('nav.signOut')}
            </button>
          {:else}
            <div class="border-t border-[var(--color-border)] my-4"></div>
            <a href="/login" onclick={closeMobileMenu}
              class="block px-0 py-3 text-sm font-medium text-[var(--color-muted-fg)] hover:text-[var(--color-fg)] transition-colors">
              {$t('nav.signIn')}
            </a>
            <a href="/register" onclick={closeMobileMenu}
              class="block mt-2 btn-bh-red text-center min-h-[44px] flex items-center justify-center">
              {$t('nav.register')} &rarr;
            </a>
          {/if}
        </div>
      {/if}
    </nav>
  </header>

  <!-- Main Content with Page Transitions -->
  <main class="flex-1 w-full max-w-6xl mx-auto px-6 md:px-8 lg:px-12">
    <PageTransition>
      {#snippet children()}
        {@render pageContent()}
      {/snippet}
    </PageTransition>
  </main>

  <!-- Footer — Cinematic -->
  <footer class="site-footer relative overflow-hidden">
    <div class="footer-glow" aria-hidden="true"></div>
    <div class="max-w-6xl mx-auto px-6 md:px-8 lg:px-12 py-12 relative z-10">
      <div class="grid grid-cols-12 gap-8">
        <div class="col-span-12 sm:col-span-5">
          <span class="font-display text-2xl font-bold text-[var(--color-fg)]">BidMo.to</span>
          <p class="mt-3 text-sm text-[var(--color-muted-fg)] leading-relaxed max-w-xs">
            {$t('footer.tagline')}
          </p>
          <div class="accent-line mt-4"></div>
        </div>
        <div class="col-span-6 sm:col-span-2">
          <h4 class="label-bh mb-4">{$t('footer.navigate')}</h4>
          <div class="space-y-2">
            <a href="/products" class="footer-link block text-sm text-[var(--color-muted-fg)] hover:text-[var(--color-fg)] transition-all duration-200">{$t('nav.browse')}</a>
            <a href="/about-us" class="footer-link block text-sm text-[var(--color-muted-fg)] hover:text-[var(--color-fg)] transition-all duration-200">{$t('nav.about')}</a>
            <a href="/sell" class="footer-link block text-sm text-[var(--color-muted-fg)] hover:text-[var(--color-fg)] transition-all duration-200">{$t('nav.sell')}</a>
          </div>
        </div>
        <div class="col-span-6 sm:col-span-2">
          <h4 class="label-bh mb-4">{$t('footer.account')}</h4>
          <div class="space-y-2">
            <a href="/login" class="footer-link block text-sm text-[var(--color-muted-fg)] hover:text-[var(--color-fg)] transition-all duration-200">{$t('nav.signIn')}</a>
            <a href="/register" class="footer-link block text-sm text-[var(--color-muted-fg)] hover:text-[var(--color-fg)] transition-all duration-200">{$t('nav.register')}</a>
          </div>
        </div>
        <div class="col-span-12 sm:col-span-3 border-t sm:border-t-0 sm:border-l border-[var(--color-border-light)] pt-6 sm:pt-0 sm:pl-8 mt-4 sm:mt-0">
          <span class="label-bh">&copy; {new Date().getFullYear()}</span>
          <p class="mt-1 text-sm text-[var(--color-muted-fg)]">{$t('footer.allRightsReserved')}</p>
        </div>
      </div>
    </div>
  </footer>
</div>
</ClickSpark>


<style>
  /* Nav layout — 3-column: logo | center links | actions */
  .nav-container {
    width: 100%;
    padding: 0 1.5rem;
  }
  @media (min-width: 768px) {
    .nav-container { padding: 0 2.5rem; }
  }
  @media (min-width: 1024px) {
    .nav-container { padding: 0 3.5rem; }
  }

  .nav-layout {
    display: flex;
    align-items: center;
    height: 3.5rem;
    position: relative;
  }

  .nav-logo {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: 0.625rem;
  }

  .nav-center {
    display: none;
  }
  @media (min-width: 860px) {
    .nav-center {
      display: flex;
      align-items: center;
      gap: 0.25rem;
      position: absolute;
      left: 50%;
      transform: translateX(-50%);
    }
  }

  .nav-actions {
    display: none;
  }
  @media (min-width: 860px) {
    .nav-actions {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      margin-left: auto;
    }
  }

  .nav-mobile-toggle {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  @media (min-width: 860px) {
    .nav-mobile-toggle { display: none; }
  }

  .nav-mobile-menu {
    display: block;
  }
  @media (min-width: 860px) {
    .nav-mobile-menu { display: none; }
  }

  /* Header animation on scroll */
  .header-animate {
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }
  .header-scrolled {
    background: rgba(10, 10, 10, 0.85) !important;
    backdrop-filter: blur(24px) saturate(1.3) !important;
    -webkit-backdrop-filter: blur(24px) saturate(1.3) !important;
    box-shadow: 0 4px 30px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(255, 255, 255, 0.03);
  }

  /* Nav link hover effect */
  .nav-link {
    position: relative;
  }
  .nav-link::after {
    content: '';
    position: absolute;
    bottom: 2px;
    left: 50%;
    width: 0;
    height: 1.5px;
    background: var(--color-accent);
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    transform: translateX(-50%);
    border-radius: 1px;
    box-shadow: 0 0 6px var(--color-accent);
  }
  .nav-link:hover::after,
  .nav-active::after {
    width: 60%;
  }

  /* Sell button glow */
  .sell-btn {
    position: relative;
  }
  .sell-btn::after {
    content: '';
    position: absolute;
    inset: -2px;
    border-radius: inherit;
    background: linear-gradient(135deg, rgba(255,255,255,0.1), transparent, rgba(255,255,255,0.05));
    opacity: 0;
    transition: opacity 0.3s;
    z-index: 0;
  }
  .sell-btn:hover::after {
    opacity: 1;
  }

  /* Dropdown — soft, rounded */
  .user-dropdown {
    background: rgba(19, 19, 22, 0.95);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.03);
    animation: dropdownIn 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    transform-origin: top right;
  }
  .dropdown-link {
    font-family: var(--font-body);
    color: var(--color-muted-fg);
    transition: all 150ms;
    border-radius: var(--radius-sm);
    margin: 0 4px;
  }
  .dropdown-link:hover {
    background: var(--color-surface-hover);
    color: var(--color-fg);
    padding-left: 20px;
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
    from { opacity: 0; transform: translateY(-8px) scale(0.95); }
    to { opacity: 1; transform: translateY(0) scale(1); }
  }

  .mobile-menu {
    animation: mobileMenuIn 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    overflow: hidden;
  }

  @keyframes mobileMenuIn {
    from { opacity: 0; max-height: 0; }
    to { opacity: 1; max-height: 1000px; }
  }

  /* Footer glow */
  .footer-glow {
    position: absolute;
    top: 0;
    left: 50%;
    transform: translateX(-50%);
    width: 60%;
    height: 1px;
    background: linear-gradient(90deg, transparent, rgba(100, 140, 200, 0.2), var(--color-accent), rgba(100, 140, 200, 0.2), transparent);
    filter: blur(1px);
  }

  /* Footer link hover */
  .footer-link {
    position: relative;
    display: inline-block;
  }
  .footer-link:hover {
    transform: translateX(4px);
  }
</style>
