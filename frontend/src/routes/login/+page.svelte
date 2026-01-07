<script lang="ts">
  export let params: any = undefined; // SvelteKit passes this automatically
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
  <title>Login - Marketplace Platform</title>
</svelte:head>

<div class="login-page">
  <div class="login-container">
    <h1>Login</h1>
    <p class="subtitle">Access your marketplace account</p>

    {#if error}
      <div class="error-message">
        {error}
      </div>
    {/if}

    <form on:submit={handleLogin}>
      <div class="form-group">
        <label for="email">Email Address</label>
        <input
          id="email"
          type="email"
          bind:value={email}
          placeholder="your@email.com"
          required
          disabled={submitting}
        />
      </div>

      <div class="form-group">
        <label for="password">Password</label>
        <input
          id="password"
          type="password"
          bind:value={password}
          placeholder="Enter your password"
          required
          disabled={submitting}
        />
      </div>

      <button type="submit" disabled={submitting}>
        {submitting ? 'Logging in...' : 'Login'}
      </button>
    </form>

    <div class="additional-info">
      <p>Don't have an account? <a href="/register?redirect={encodeURIComponent(redirectUrl)}">Register here</a></p>
    </div>
  </div>
</div>

<style>
  .login-page {
    min-height: calc(100vh - 200px);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 2rem;
  }

  .login-container {
    max-width: 450px;
    width: 100%;
    background-color: white;
    padding: 3rem;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  }

  h1 {
    font-size: 2.5rem;
    margin-bottom: 0.5rem;
    text-align: center;
  }

  .subtitle {
    color: #666;
    text-align: center;
    margin-bottom: 2rem;
  }

  .error-message {
    background-color: #ef4444;
    color: white;
    padding: 1rem;
    border-radius: 4px;
    margin-bottom: 1.5rem;
  }

  .form-group {
    margin-bottom: 1.5rem;
  }

  label {
    display: block;
    margin-bottom: 0.5rem;
    font-weight: bold;
    color: #333;
  }

  input {
    width: 100%;
    padding: 0.75rem;
    font-size: 1rem;
    border: 1px solid #ccc;
    border-radius: 4px;
    font-family: inherit;
  }

  input:focus {
    outline: none;
    border-color: #0066cc;
    box-shadow: 0 0 0 3px rgba(0, 102, 204, 0.1);
  }

  input:disabled {
    background-color: #f5f5f5;
    cursor: not-allowed;
  }

  button {
    width: 100%;
    padding: 1rem;
    font-size: 1.1rem;
    background-color: #0066cc;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    margin-top: 1rem;
  }

  button:hover:not(:disabled) {
    background-color: #0052a3;
  }

  button:disabled {
    background-color: #ccc;
    cursor: not-allowed;
  }

  .additional-info {
    margin-top: 2rem;
    text-align: center;
    color: #666;
  }

  .additional-info a {
    color: #0066cc;
    text-decoration: none;
  }

  .additional-info a:hover {
    text-decoration: underline;
  }
</style>
