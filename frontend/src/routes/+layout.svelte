<script lang="ts">
  import '../app.css';
  import { authStore } from '$lib/stores/auth';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { logout as apiLogout } from '$lib/api';
  import type { LayoutData } from './$types';

  // Accept props to avoid warnings
  export let data: LayoutData;

  // Track active route
  $: currentPath = $page.url.pathname;

  async function handleLogout() {
    await apiLogout();
    authStore.logout();
    goto('/');
  }
</script>

<div class="app">
  <header>
    <nav>
      <div class="nav-left">
        <a href="/" class="logo">
          <img src="/bidmo.to.png" alt="BidMo.to" class="logo-img" />
        </a>
        <a href="/products" class:active={currentPath.startsWith('/products')}>Browse</a>
        {#if $authStore.isAuthenticated}
          <a href="/dashboard" class:active={currentPath === '/dashboard'}>My Products</a>
          <a href="/purchases" class:active={currentPath === '/purchases'}>My Purchases</a>
          <a href="/inbox" class:active={currentPath === '/inbox'}>Inbox</a>
        {/if}
      </div>

      <div class="nav-right">
        {#if $authStore.isAuthenticated}
          <a href="/sell" class="btn-sell" class:active={currentPath === '/sell'}>+ Sell</a>
          <div class="user-menu">
            <span class="user-name">Hi, {$authStore.user?.name || 'User'}!</span>
            <button on:click={handleLogout} class="btn-logout">Logout</button>
          </div>
        {:else}
          <a href="/login">Login</a>
          <a href="/register" class="btn-register">Register</a>
        {/if}
      </div>
    </nav>
  </header>

  <main>
    <slot />
  </main>

  <footer>
    <p>&copy; 2025 BidMo.to - Bid mo 'to!</p>
  </footer>
</div>

<style>
  .app {
    display: flex;
    flex-direction: column;
    min-height: 100vh;
  }

  header {
    padding: 1rem 2rem;
    background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%);
    color: white;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }

  nav {
    display: flex;
    justify-content: space-between;
    align-items: center;
    max-width: 1200px;
    margin: 0 auto;
  }

  .nav-left,
  .nav-right {
    display: flex;
    gap: 1.5rem;
    align-items: center;
  }

  .logo {
    font-size: 1.5rem;
    font-weight: bold;
    color: white !important;
    text-decoration: none !important;
    padding: 0 !important;
    display: flex;
    align-items: center;
  }

  .logo:hover {
    background-color: transparent !important;
  }

  .logo::after {
    display: none !important;
  }

  .logo-img {
    height: 40px;
    width: auto;
    display: block;
  }

  nav a {
    color: white;
    text-decoration: none;
    font-weight: 500;
    transition: all 0.2s;
    position: relative;
    padding: 0.5rem 0.75rem;
    border-radius: 6px;
  }

  nav a:hover {
    background-color: rgba(255, 255, 255, 0.1);
  }

  nav a.active {
    background-color: rgba(255, 255, 255, 0.2);
    font-weight: 600;
  }

  nav a.active::after {
    content: '';
    position: absolute;
    bottom: 0;
    left: 0.75rem;
    right: 0.75rem;
    height: 3px;
    background-color: white;
    border-radius: 2px 2px 0 0;
  }

  .btn-register {
    background-color: white;
    color: #dc2626;
    padding: 0.5rem 1.5rem;
    border-radius: 6px;
    font-weight: 600;
  }

  .btn-register:hover {
    opacity: 1;
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(255, 255, 255, 0.3);
  }

  .btn-sell {
    background-color: #10b981;
    color: white;
    padding: 0.5rem 1.5rem;
    border-radius: 6px;
    font-weight: 600;
    transition: all 0.2s;
  }

  .btn-sell:hover {
    background-color: #059669 !important;
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
  }

  .btn-sell.active {
    background-color: #059669;
    box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.3);
  }

  .btn-sell.active::after {
    display: none;
  }

  .user-menu {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .user-name {
    font-weight: 500;
  }

  .btn-logout {
    background-color: rgba(255, 255, 255, 0.2);
    color: white;
    padding: 0.5rem 1rem;
    border: 1px solid white;
    border-radius: 6px;
    cursor: pointer;
    font-weight: 500;
    transition: background-color 0.2s;
  }

  .btn-logout:hover {
    background-color: rgba(255, 255, 255, 0.3);
  }

  main {
    flex: 1;
    padding: 2rem;
    max-width: 1200px;
    margin: 0 auto;
    width: 100%;
  }

  footer {
    padding: 1rem;
    text-align: center;
    background-color: #f5f5f5;
  }
</style>
