<script lang="ts">
  import '../app.css';
  import { authStore } from '$lib/stores/auth';
  import { goto } from '$app/navigation';
  import { logout as apiLogout } from '$lib/api';
  import type { LayoutData } from './$types';

  // Accept props to avoid warnings
  export let data: LayoutData;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  export let params: any = {};

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
        <a href="/" class="logo">🏪 Marketplace</a>
        <a href="/products">Browse</a>
        {#if $authStore.isAuthenticated}
          <a href="/dashboard">My Products</a>
        {/if}
      </div>

      <div class="nav-right">
        {#if $authStore.isAuthenticated}
          <a href="/sell" class="btn-sell">+ Sell</a>
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
    <p>&copy; 2025 Marketplace Platform</p>
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
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
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
  }

  nav a {
    color: white;
    text-decoration: none;
    font-weight: 500;
    transition: opacity 0.2s;
  }

  nav a:hover {
    opacity: 0.8;
  }

  .btn-register {
    background-color: white;
    color: #667eea;
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
