<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { browser } from '$app/environment';
  import { authStore } from '$lib/stores/auth';

  let email = '';
  let password = '';
  let submitting = false;
  let error = '';

  // Get redirect URL from query params
  const redirectUrl = $page.url.searchParams.get('redirect') || '/';

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

<div class="min-h-[calc(100vh-200px)] flex items-center justify-center p-8">
  <div class="card-bh p-8 md:p-12 max-w-[450px] w-full">
    <h1 class="headline-bh text-4xl mb-2 text-center">Login</h1>
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
        <input
          id="password"
          type="password"
          bind:value={password}
          placeholder="Enter your password"
          required
          disabled={submitting}
          class="input-bh"
        />
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
