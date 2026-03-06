<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { authStore } from '$lib/stores/auth';
  import { onMount } from 'svelte';

  let name = '';
  let email = '';
  let password = '';
  let confirmPassword = '';
  let countryCode = '+63';
  let phoneNumber = '';
  let submitting = false;
  let error = '';
  let success = false;
  let showPassword = false;
  let showConfirmPassword = false;
  let errorEl: HTMLDivElement;
  let errorFlash = false;
  let mounted = $state(false);

  // Country codes list with common countries
  const countryCodes = [
    { code: '+63', country: 'Philippines', flag: '🇵🇭' },
    { code: '+1', country: 'USA/Canada', flag: '🇺🇸' },
    { code: '+44', country: 'UK', flag: '🇬🇧' },
    { code: '+61', country: 'Australia', flag: '🇦🇺' },
    { code: '+65', country: 'Singapore', flag: '🇸🇬' },
    { code: '+81', country: 'Japan', flag: '🇯🇵' },
    { code: '+82', country: 'South Korea', flag: '🇰🇷' },
    { code: '+86', country: 'China', flag: '🇨🇳' },
    { code: '+91', country: 'India', flag: '🇮🇳' },
    { code: '+60', country: 'Malaysia', flag: '🇲🇾' },
    { code: '+66', country: 'Thailand', flag: '🇹🇭' },
    { code: '+84', country: 'Vietnam', flag: '🇻🇳' },
    { code: '+62', country: 'Indonesia', flag: '🇮🇩' },
    { code: '+49', country: 'Germany', flag: '🇩🇪' },
    { code: '+33', country: 'France', flag: '🇫🇷' },
    { code: '+39', country: 'Italy', flag: '🇮🇹' },
    { code: '+34', country: 'Spain', flag: '🇪🇸' },
    { code: '+971', country: 'UAE', flag: '🇦🇪' },
    { code: '+966', country: 'Saudi Arabia', flag: '🇸🇦' },
    { code: '+974', country: 'Qatar', flag: '🇶🇦' },
  ];

  function showError(msg: string) {
    error = msg;
    errorFlash = false;
    requestAnimationFrame(() => {
      errorFlash = true;
      errorEl?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }

  // Get redirect URL from query params — only allow safe relative paths
  const rawRedirect = $page.url.searchParams.get('redirect') || '/';
  const redirectUrl = rawRedirect.startsWith('/') && !rawRedirect.startsWith('//') ? rawRedirect : '/';

  onMount(() => {
    setTimeout(() => mounted = true, 50);
  });

  async function handleRegister(e: Event) {
    e.preventDefault();

    error = '';
    success = false;

    // Validation
    if (!name || !email || !password || !confirmPassword || !phoneNumber) {
      showError('Please fill in all fields');
      return;
    }

    if (password !== confirmPassword) {
      showError('Passwords do not match');
      return;
    }

    if (password.length < 6) {
      showError('Password must be at least 6 characters');
      return;
    }

    // Phone number validation - basic check for digits only
    const cleanPhone = phoneNumber.replace(/\D/g, '');
    if (cleanPhone.length < 7 || cleanPhone.length > 15) {
      showError('Please enter a valid phone number');
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
          countryCode,
          phoneNumber: phoneNumber.replace(/\D/g, ''), // Store only digits
          role: 'seller', // Users can both buy and sell
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        // Payload nests specific field errors in data[].message
        const fieldMsg = data.errors?.[0]?.data?.[0]?.message || '';
        const topMsg = data.errors?.[0]?.message || data.message || '';
        const raw = fieldMsg || topMsg;
        // Map Payload's errors to user-friendly messages
        if (/already registered/i.test(raw)) {
          throw new Error('An account with this email already exists. Try logging in instead.');
        }
        throw new Error(raw || 'Registration failed. Please try again.');
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
      showError(err.message || 'Registration failed. Please try again.');
    } finally {
      submitting = false;
    }
  }
</script>

<svelte:head>
  <title>Register - BidMo.to</title>
</svelte:head>

<div class="min-h-[calc(100vh-200px)] flex items-center justify-center p-4 sm:p-8">
  <!-- Decorative orbs -->
  <div class="register-orb orb-1" aria-hidden="true"></div>
  <div class="register-orb orb-2" aria-hidden="true"></div>
  <div class="register-orb orb-3" aria-hidden="true"></div>

  <div class="register-card card-bh p-5 sm:p-8 md:p-12 max-w-[500px] w-full relative" class:register-visible={mounted}>
    <!-- Gradient top accent -->
    <div class="card-accent" aria-hidden="true"></div>

    <h1 class="headline-bh text-2xl sm:text-4xl mb-2 text-center uppercase tracking-tighter">Create Account</h1>
    <p class="text-[var(--color-muted-fg)] text-center mb-8">Join our marketplace to buy and sell products</p>

    {#if success}
      <div class="success-banner mb-6 p-4 text-center font-bold">
        <svg class="inline-block w-5 h-5 mr-2 -mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
        Account created successfully! Logging you in...
      </div>
    {/if}

    {#if error}
      <div
        bind:this={errorEl}
        class="error-banner mb-6 p-4 text-center font-bold"
        class:error-flash={errorFlash}
        onanimationend={() => errorFlash = false}
      >
        <svg class="inline-block w-5 h-5 mr-2 -mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        {error}
      </div>
    {/if}

    <form onsubmit={handleRegister}>
      <div class="mb-6 form-field" style="animation-delay: 0.1s;">
        <label for="name" class="block mb-2 font-bold text-[var(--color-fg)]">Full Name</label>
        <input
          id="name"
          type="text"
          bind:value={name}
          placeholder="John Doe"
          required
          disabled={submitting || success}
          class="input-bh"
        />
      </div>

      <div class="mb-6 form-field" style="animation-delay: 0.15s;">
        <label for="email" class="block mb-2 font-bold text-[var(--color-fg)]">Email Address</label>
        <input
          id="email"
          type="email"
          bind:value={email}
          placeholder="your@email.com"
          required
          disabled={submitting || success}
          class="input-bh"
        />
      </div>

      <div class="mb-6 form-field" style="animation-delay: 0.2s;">
        <label for="phone" class="block mb-2 font-bold text-[var(--color-fg)]">Phone Number</label>
        <div class="flex gap-2">
          <select
            id="countryCode"
            bind:value={countryCode}
            disabled={submitting || success}
            class="input-bh w-[110px]"
          >
            {#each countryCodes as { code, country, flag }}
              <option value={code}>{flag} {code}</option>
            {/each}
          </select>
          <input
            id="phone"
            type="tel"
            bind:value={phoneNumber}
            placeholder="9XX XXX XXXX"
            required
            disabled={submitting || success}
            class="input-bh flex-1"
          />
        </div>
      </div>

      <div class="mb-6 form-field" style="animation-delay: 0.25s;">
        <label for="password" class="block mb-2 font-bold text-[var(--color-fg)]">Password</label>
        <div class="relative">
          <input
            id="password"
            type={showPassword ? 'text' : 'password'}
            bind:value={password}
            placeholder="Enter a strong password (min 6 characters)"
            required
            disabled={submitting || success}
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

      <div class="mb-6 form-field" style="animation-delay: 0.3s;">
        <label for="confirmPassword" class="block mb-2 font-bold text-[var(--color-fg)]">Confirm Password</label>
        <div class="relative">
          <input
            id="confirmPassword"
            type={showConfirmPassword ? 'text' : 'password'}
            bind:value={confirmPassword}
            placeholder="Re-enter your password"
            required
            disabled={submitting || success}
            class="input-bh pr-12"
          />
          <button
            type="button"
            tabindex="-1"
            onmousedown={() => showConfirmPassword = true}
            onmouseup={() => showConfirmPassword = false}
            onmouseleave={() => showConfirmPassword = false}
            ontouchstart={() => showConfirmPassword = true}
            ontouchend={() => showConfirmPassword = false}
            class="absolute right-0 top-0 h-full px-3 flex items-center text-[var(--color-muted-fg)] hover:text-[var(--color-fg)] border-l border-[var(--color-border)] transition-colors select-none"
          >
            {#if showConfirmPassword}
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="square" stroke-linejoin="miter"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            {:else}
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="square" stroke-linejoin="miter"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
            {/if}
          </button>
        </div>
      </div>

      <div class="form-field" style="animation-delay: 0.35s;">
        <button type="submit" disabled={submitting || success} class="btn-bh-red w-full text-lg py-3 mt-4 group">
          {#if submitting}
            <span class="inline-flex items-center gap-2">
              <svg class="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
              </svg>
              Creating Account...
            </span>
          {:else}
            <span class="inline-flex items-center gap-2">
              Create Account
              <svg class="w-4 h-4 transition-transform duration-300 group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
            </span>
          {/if}
        </button>
      </div>
    </form>

    <div class="mt-8 text-center form-field" style="animation-delay: 0.4s;">
      <p class="text-[var(--color-muted-fg)] mb-6">Already have an account? <a href="/login?redirect={encodeURIComponent(redirectUrl)}" class="text-[var(--color-accent)] font-bold hover:underline transition-colors">Login here</a></p>

      <div class="why-join-card p-6 text-left">
        <h3 class="font-bold text-lg text-[var(--color-fg)] mb-4 uppercase tracking-wide">Why Join?</h3>
        <ul class="list-none p-0 m-0 space-y-3">
          {#each [
            'Sell your products to a global audience',
            'Bid on unique items from sellers worldwide',
            'Track your bids and listings in one place',
            'Secure transactions and buyer protection'
          ] as item, i}
            <li class="flex items-center gap-3 text-[var(--color-muted-fg)]">
              <span class="check-icon">
                <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
              </span>
              {item}
            </li>
          {/each}
        </ul>
      </div>
    </div>
  </div>
</div>

<style>
  /* Card entrance */
  .register-card {
    opacity: 0;
    transform: translateY(30px) scale(0.97);
    transition: all 0.6s cubic-bezier(0.4, 0, 0.2, 1);
    overflow: hidden;
  }
  .register-visible {
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
  .register-orb {
    position: fixed;
    border-radius: 50%;
    pointer-events: none;
    filter: blur(80px);
    z-index: -1;
  }
  .orb-1 {
    width: 300px;
    height: 300px;
    background: rgba(16, 185, 129, 0.05);
    top: 15%;
    left: 5%;
    animation: orbFloat 10s ease-in-out infinite;
  }
  .orb-2 {
    width: 250px;
    height: 250px;
    background: rgba(100, 140, 200, 0.05);
    bottom: 15%;
    right: 5%;
    animation: orbFloat 12s ease-in-out infinite reverse;
  }
  .orb-3 {
    width: 200px;
    height: 200px;
    background: rgba(139, 92, 246, 0.04);
    top: 50%;
    right: 20%;
    animation: orbFloat 14s ease-in-out infinite;
    animation-delay: 2s;
  }

  @keyframes orbFloat {
    0%, 100% { transform: translate(0, 0); }
    25% { transform: translate(25px, -25px); }
    50% { transform: translate(-15px, 20px); }
    75% { transform: translate(20px, 10px); }
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

  /* Flash/highlight animation */
  .error-flash {
    animation: errorPulse 0.6s ease-out;
  }

  @keyframes errorPulse {
    0%   { transform: scale(1); box-shadow: 0 0 0 0 rgba(220, 38, 38, 0.5); }
    30%  { transform: scale(1.02); box-shadow: 0 0 0 6px rgba(220, 38, 38, 0.2); }
    60%  { transform: scale(0.99); box-shadow: 0 0 0 0 rgba(220, 38, 38, 0); }
    100% { transform: scale(1); box-shadow: none; }
  }

  /* Success banner */
  .success-banner {
    background: rgba(16, 185, 129, 0.1);
    color: var(--color-green);
    border: 1px solid rgba(16, 185, 129, 0.3);
    border-radius: var(--radius-md);
    animation: errorSlide 0.4s cubic-bezier(0.4, 0, 0.2, 1);
  }

  /* Why join card */
  .why-join-card {
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
  }

  .check-icon {
    flex-shrink: 0;
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: color-mix(in srgb, var(--color-accent) 10%, transparent);
    border-radius: 50%;
    padding: 3px;
  }

  /* Spin animation */
  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
  .animate-spin {
    animation: spin 1s linear infinite;
  }
</style>
