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

  // Get redirect URL from query params — only allow safe relative paths
  const rawRedirect = $page.url.searchParams.get('redirect') || '/';
  const redirectUrl = rawRedirect.startsWith('/') && !rawRedirect.startsWith('//') ? rawRedirect : '/';

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
  <div class="card-bh p-5 sm:p-8 md:p-12 max-w-[450px] w-full">
    <h1 class="headline-bh text-2xl sm:text-4xl mb-2 text-center">Login</h1>
    <p class="text-bh-fg/60 text-center mb-8">Access your marketplace account</p>

    {#if error}
      <div class="bg-bh-red text-white border-4 border-bh-border p-4 mb-6 font-bold">
        {error}
      </div>
    {/if}

    <form onsubmit={handleLogin}>
      <div class="mb-6">
        <label for="email" class="block mb-2 font-bold text-bh-fg">Email Address</label>
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

      <div class="mb-6">
        <label for="password" class="block mb-2 font-bold text-bh-fg">Password</label>
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
            class="absolute right-0 top-0 h-full px-3 flex items-center text-bh-fg/50 hover:text-bh-fg border-l-[3px] border-bh-border transition-colors select-none"
          >
            {#if showPassword}
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="square" stroke-linejoin="miter"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            {:else}
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="square" stroke-linejoin="miter"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
            {/if}
          </button>
        </div>
      </div>

      <button type="submit" disabled={submitting} class="btn-bh-red w-full text-lg py-3 mt-4">
        {submitting ? 'Logging in...' : 'Login'}
      </button>
    </form>

    <div class="mt-8 text-center text-bh-fg/60">
      <p>Don't have an account? <a href="/register?redirect={encodeURIComponent(redirectUrl)}" class="text-bh-blue font-bold hover:underline">Register here</a></p>
    </div>
  </div>
</div>
