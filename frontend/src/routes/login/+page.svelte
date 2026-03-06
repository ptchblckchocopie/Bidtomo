<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { browser } from '$app/environment';
  import { authStore } from '$lib/stores/auth';

  let email = '';
  let password = '';
  let submitting = false;
  let error = '';
  let showPassword = false;
  let mounted = $state(false);

  // Get redirect URL from query params — only allow safe relative paths
  const rawRedirect = $page.url.searchParams.get('redirect') || '/';
  const redirectUrl = rawRedirect.startsWith('/') && !rawRedirect.startsWith('//') ? rawRedirect : '/';

  import { onMount } from 'svelte';
  onMount(() => {
    setTimeout(() => mounted = true, 50);
  });

  async function handleLogin(e: Event) {
    e.preventDefault();

    error = '';
    submitting = true;

    try {
      const response = await fetch('/api/bridge/users/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        throw new Error('Invalid email or password');
      }

      const data = await response.json();

      // Store JWT token and user data in localStorage
      if (data.token) {
        localStorage.setItem('auth_token', data.token);
      }
      if (data.user) {
        localStorage.setItem('user_data', JSON.stringify(data.user));
      }

      // Update auth store
      authStore.set({
        isAuthenticated: true,
        user: data.user,
        token: data.token,
      });

      // Redirect to the intended page or homepage
      goto(redirectUrl);
    } catch (err: any) {
      error = err.message || 'Invalid email or password. Please try again.';
    } finally {
      submitting = false;
    }
  }
</script>

<svelte:head>
  <title>Login - BidMo.to</title>
</svelte:head>

<div class="min-h-[calc(100vh-200px)] flex items-center justify-center p-4 sm:p-8">
  <!-- Decorative orbs -->
  <div class="login-orb orb-1" aria-hidden="true"></div>
  <div class="login-orb orb-2" aria-hidden="true"></div>

  <div class="login-card card-bh p-5 sm:p-8 md:p-12 max-w-[450px] w-full relative" class:login-visible={mounted}>
    <!-- Gradient top accent -->
    <div class="card-accent" aria-hidden="true"></div>

    <h1 class="headline-bh text-2xl sm:text-4xl mb-2 text-center uppercase tracking-tighter">Login</h1>
    <p class="text-[var(--color-muted-fg)] text-center mb-8">Access your marketplace account</p>

    {#if error}
      <div class="error-banner mb-6 p-4 font-bold text-center">
        <svg class="inline-block w-5 h-5 mr-2 -mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        {error}
      </div>
    {/if}

    <form onsubmit={handleLogin}>
      <div class="mb-6 form-field" style="animation-delay: 0.1s;">
        <label for="email" class="block mb-2 font-bold text-[var(--color-fg)]">Email Address</label>
        <input
          id="email"
          type="email"
          bind:value={email}
          placeholder="your@email.com"
          required
          disabled={submitting}
          class="input-bh"
        />
      </div>

      <div class="mb-6 form-field" style="animation-delay: 0.2s;">
        <label for="password" class="block mb-2 font-bold text-[var(--color-fg)]">Password</label>
        <div class="relative">
          <input
            id="password"
            type={showPassword ? 'text' : 'password'}
            bind:value={password}
            placeholder="Enter your password"
            required
            disabled={submitting}
            class="input-bh pr-12"
          />
          <button
            type="button"
            tabindex="-1"
            onmousedown={() => showPassword = true}
            onmouseup={() => showPassword = false}
            onmouseleave={() => showPassword = false}
            ontouchstart={() => showPassword = true}
            ontouchend={() => showPassword = false}
            class="absolute right-0 top-0 h-full px-3 flex items-center text-[var(--color-muted-fg)] hover:text-[var(--color-fg)] border-l border-[var(--color-border)] transition-colors select-none"
          >
            {#if showPassword}
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="square" stroke-linejoin="miter"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            {:else}
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="square" stroke-linejoin="miter"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
            {/if}
          </button>
        </div>
      </div>

      <div class="form-field" style="animation-delay: 0.3s;">
        <button type="submit" disabled={submitting} class="btn-bh-red w-full text-lg py-3 mt-4 group">
          {#if submitting}
            <span class="inline-flex items-center gap-2">
              <svg class="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
              </svg>
              Logging in...
            </span>
          {:else}
            <span class="inline-flex items-center gap-2">
              Login
              <svg class="w-4 h-4 transition-transform duration-300 group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
            </span>
          {/if}
        </button>
      </div>
    </form>

    <div class="mt-8 text-center text-[var(--color-muted-fg)] form-field" style="animation-delay: 0.4s;">
      <p>Don't have an account? <a href="/register?redirect={encodeURIComponent(redirectUrl)}" class="text-[var(--color-accent)] font-bold hover:underline transition-colors">Register here</a></p>
    </div>
  </div>
</div>

<style>
  /* Card entrance */
  .login-card {
    opacity: 0;
    transform: translateY(30px) scale(0.97);
    transition: all 0.6s cubic-bezier(0.4, 0, 0.2, 1);
    overflow: hidden;
  }
  .login-visible {
    opacity: 1;
    transform: translateY(0) scale(1);
  }

  /* Gradient accent bar at top of card */
  .card-accent {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 2px;
    background: linear-gradient(90deg, var(--color-accent), rgba(100, 140, 200, 0.5), var(--color-accent));
    opacity: 0.8;
  }

  /* Form field staggered entrance */
  .form-field {
    opacity: 0;
    transform: translateY(15px);
    animation: fieldIn 0.5s cubic-bezier(0.4, 0, 0.2, 1) forwards;
  }

  @keyframes fieldIn {
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  /* Floating orbs */
  .login-orb {
    position: fixed;
    border-radius: 50%;
    pointer-events: none;
    filter: blur(80px);
    z-index: -1;
  }
  .orb-1 {
    width: 300px;
    height: 300px;
    background: rgba(16, 185, 129, 0.06);
    top: 20%;
    left: 10%;
    animation: float 8s ease-in-out infinite;
  }
  .orb-2 {
    width: 250px;
    height: 250px;
    background: rgba(100, 140, 200, 0.06);
    bottom: 20%;
    right: 10%;
    animation: float 10s ease-in-out infinite reverse;
  }

  @keyframes float {
    0%, 100% { transform: translate(0, 0); }
    33% { transform: translate(20px, -20px); }
    66% { transform: translate(-15px, 15px); }
  }

  /* Error banner */
  .error-banner {
    background: rgba(239, 68, 68, 0.1);
    color: var(--color-red);
    border: 1px solid rgba(239, 68, 68, 0.3);
    border-radius: var(--radius-md);
    animation: errorSlide 0.4s cubic-bezier(0.4, 0, 0.2, 1);
  }

  @keyframes errorSlide {
    from { opacity: 0; transform: translateY(-10px); }
    to { opacity: 1; transform: translateY(0); }
  }

  /* Spin animation for loading */
  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
  .animate-spin {
    animation: spin 1s linear infinite;
  }
</style>
