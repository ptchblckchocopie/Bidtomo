<script lang="ts">
  export let params: any = undefined; // SvelteKit passes this automatically
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { authStore } from '$lib/stores/auth';

  let name = '';
  let email = '';
  let password = '';
  let confirmPassword = '';
  let submitting = false;
  let error = '';
  let success = false;

  // Get redirect URL from query params
  const redirectUrl = $page.url.searchParams.get('redirect') || '/';

  async function handleRegister(e: Event) {
    e.preventDefault();

    error = '';
    success = false;

    // Validation
    if (!name || !email || !password || !confirmPassword) {
      error = 'Please fill in all fields';
      return;
    }

    if (password !== confirmPassword) {
      error = 'Passwords do not match';
      return;
    }

    if (password.length < 6) {
      error = 'Password must be at least 6 characters';
      return;
    }

    submitting = true;

    try {
      const response = await fetch('/api/bridge/users/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          name,
          email,
          password,
          role: 'seller', // Users can both buy and sell
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.errors?.[0]?.message || 'Registration failed');
      }

      success = true;

      // Automatically log them in after registration
      setTimeout(async () => {
        const loginResponse = await fetch('/api/bridge/users/login', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({ email, password }),
        });

        if (loginResponse.ok) {
          const data = await loginResponse.json();

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
        }
      }, 1500);
    } catch (err: any) {
      error = err.message || 'Registration failed. Please try again.';
    } finally {
      submitting = false;
    }
  }
</script>

<svelte:head>
  <title>Register - BidMo.to</title>
</svelte:head>

<div class="register-page">
  <div class="register-container">
    <h1>Create Account</h1>
    <p class="subtitle">Join our marketplace to buy and sell products</p>

    {#if success}
      <div class="success-message">
        Account created successfully! Logging you in...
      </div>
    {/if}

    {#if error}
      <div class="error-message">
        {error}
      </div>
    {/if}

    <form on:submit={handleRegister}>
      <div class="form-group">
        <label for="name">Full Name</label>
        <input
          id="name"
          type="text"
          bind:value={name}
          placeholder="John Doe"
          required
          disabled={submitting || success}
        />
      </div>

      <div class="form-group">
        <label for="email">Email Address</label>
        <input
          id="email"
          type="email"
          bind:value={email}
          placeholder="your@email.com"
          required
          disabled={submitting || success}
        />
      </div>

      <div class="form-group">
        <label for="password">Password</label>
        <input
          id="password"
          type="password"
          bind:value={password}
          placeholder="Enter a strong password (min 6 characters)"
          required
          disabled={submitting || success}
        />
      </div>

      <div class="form-group">
        <label for="confirmPassword">Confirm Password</label>
        <input
          id="confirmPassword"
          type="password"
          bind:value={confirmPassword}
          placeholder="Re-enter your password"
          required
          disabled={submitting || success}
        />
      </div>

      <button type="submit" disabled={submitting || success}>
        {submitting ? 'Creating Account...' : 'Create Account'}
      </button>
    </form>

    <div class="additional-info">
      <p>Already have an account? <a href="/login?redirect={encodeURIComponent(redirectUrl)}">Login here</a></p>
      <div class="features">
        <h3>Why join?</h3>
        <ul>
          <li>✓ Sell your products to a global audience</li>
          <li>✓ Bid on unique items from sellers worldwide</li>
          <li>✓ Track your bids and listings in one place</li>
          <li>✓ Secure transactions and buyer protection</li>
        </ul>
      </div>
    </div>
  </div>
</div>

<style>
  .register-page {
    min-height: calc(100vh - 200px);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 2rem;
    background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%);
  }

  .register-container {
    max-width: 500px;
    width: 100%;
    background-color: white;
    padding: 3rem;
    border-radius: 12px;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
  }

  h1 {
    font-size: 2.5rem;
    margin-bottom: 0.5rem;
    text-align: center;
    color: #333;
  }

  .subtitle {
    color: #666;
    text-align: center;
    margin-bottom: 2rem;
  }

  .success-message {
    background-color: #10b981;
    color: white;
    padding: 1rem;
    border-radius: 6px;
    margin-bottom: 1.5rem;
    text-align: center;
    font-weight: 500;
  }

  .error-message {
    background-color: #ef4444;
    color: white;
    padding: 1rem;
    border-radius: 6px;
    margin-bottom: 1.5rem;
    text-align: center;
  }

  .form-group {
    margin-bottom: 1.5rem;
  }

  label {
    display: block;
    margin-bottom: 0.5rem;
    font-weight: 600;
    color: #333;
  }

  input {
    width: 100%;
    padding: 0.875rem;
    font-size: 1rem;
    border: 2px solid #e5e7eb;
    border-radius: 6px;
    font-family: inherit;
    transition: border-color 0.2s;
  }

  input:focus {
    outline: none;
    border-color: #dc2626;
    box-shadow: 0 0 0 3px rgba(220, 38, 38, 0.1);
  }

  input:disabled {
    background-color: #f5f5f5;
    cursor: not-allowed;
  }

  button {
    width: 100%;
    padding: 1rem;
    font-size: 1.1rem;
    font-weight: 600;
    background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%);
    color: white;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    margin-top: 1rem;
    transition: transform 0.2s, box-shadow 0.2s;
  }

  button:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(220, 38, 38, 0.4);
  }

  button:disabled {
    background: #ccc;
    cursor: not-allowed;
    transform: none;
  }

  .additional-info {
    margin-top: 2rem;
    text-align: center;
  }

  .additional-info > p {
    color: #666;
    margin-bottom: 1.5rem;
  }

  .additional-info a {
    color: #dc2626;
    text-decoration: none;
    font-weight: 600;
  }

  .additional-info a:hover {
    text-decoration: underline;
  }

  .features {
    text-align: left;
    background-color: #f9fafb;
    padding: 1.5rem;
    border-radius: 8px;
    margin-top: 1.5rem;
  }

  .features h3 {
    margin-top: 0;
    margin-bottom: 1rem;
    color: #333;
    font-size: 1.1rem;
  }

  .features ul {
    list-style: none;
    padding: 0;
    margin: 0;
  }

  .features li {
    padding: 0.5rem 0;
    color: #555;
  }
</style>
