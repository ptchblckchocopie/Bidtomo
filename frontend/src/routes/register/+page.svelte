<script lang="ts">
  import { goto } from '$app/navigation';
  import { onDestroy } from 'svelte';
  import { page } from '$app/stores';
  import { authStore } from '$lib/stores/auth';

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
  let autoLoginTimeout: ReturnType<typeof setTimeout> | null = null;

  onDestroy(() => {
    if (autoLoginTimeout) clearTimeout(autoLoginTimeout);
  });

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
    // Wait a tick for the DOM to render the error element
    requestAnimationFrame(() => {
      errorFlash = true;
      errorEl?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }

  // Get redirect URL from query params — only allow safe relative paths
  const rawRedirect = $page.url.searchParams.get('redirect') || '/';
  const redirectUrl = rawRedirect.startsWith('/') && !rawRedirect.startsWith('//') ? rawRedirect : '/';

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
      autoLoginTimeout = setTimeout(async () => {
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
  <div class="w-full max-w-[500px]">
    <!-- Card -->
    <div class="glass-elevated p-6 sm:p-8 md:p-10">

      <!-- Header -->
      <div class="text-center mb-8">
        <span class="label-bh block mb-3">New Account</span>
        <h1 class="headline-bh text-3xl sm:text-4xl mb-2">Create Account</h1>
        <p class="text-sm" style="color: var(--color-fg); opacity: 0.6;">Join our marketplace to buy and sell products</p>
      </div>

      <!-- Success -->
      {#if success}
        <div class="p-4 mb-6 text-sm text-center" style="border: 1px solid color-mix(in srgb, var(--color-green) 20%, transparent); background: color-mix(in srgb, var(--color-green) 5%, transparent); color: var(--color-green); ">
          Account created successfully! Logging you in...
        </div>
      {/if}

      <!-- Error -->
      {#if error}
        <div
          bind:this={errorEl}
          class="p-4 mb-6 text-sm text-center"
          class:error-flash={errorFlash}
          onanimationend={() => errorFlash = false}
          style="border: 1px solid color-mix(in srgb, var(--color-red) 20%, transparent); background: color-mix(in srgb, var(--color-red) 5%, transparent); color: var(--color-red);"
        >
          {error}
        </div>
      {/if}

      <form onsubmit={handleRegister}>
        <!-- Full Name -->
        <div class="mb-5">
          <label for="name" class="label-bh block mb-2">Full Name</label>
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

        <!-- Email -->
        <div class="mb-5">
          <label for="email" class="label-bh block mb-2">Email Address</label>
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

        <!-- Phone -->
        <div class="mb-5">
          <label for="phone" class="label-bh block mb-2">Phone Number</label>
          <div class="flex gap-2">
            <select
              id="countryCode"
              bind:value={countryCode}
              disabled={submitting || success}
              class="input-bh !w-[110px] !flex-none"
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

        <!-- Password -->
        <div class="mb-5">
          <label for="password" class="label-bh block mb-2">Password</label>
          <div class="relative">
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              bind:value={password}
              placeholder="Min 6 characters"
              required
              disabled={submitting || success}
              class="input-bh !pr-12"
            />
            <button
              type="button"
              tabindex="-1"
              onmousedown={() => showPassword = true}
              onmouseup={() => showPassword = false}
              onmouseleave={() => showPassword = false}
              ontouchstart={() => showPassword = true}
              ontouchend={() => showPassword = false}
              class="absolute right-0 top-0 h-full px-3 flex items-center transition-colors select-none border-l" style="color: color-mix(in srgb, var(--color-fg) 40%, transparent); border-color: var(--color-border);"
            >
              {#if showPassword}
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              {:else}
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
              {/if}
            </button>
          </div>
        </div>

        <!-- Confirm Password -->
        <div class="mb-5">
          <label for="confirmPassword" class="label-bh block mb-2">Confirm Password</label>
          <div class="relative">
            <input
              id="confirmPassword"
              type={showConfirmPassword ? 'text' : 'password'}
              bind:value={confirmPassword}
              placeholder="Re-enter your password"
              required
              disabled={submitting || success}
              class="input-bh !pr-12"
            />
            <button
              type="button"
              tabindex="-1"
              onmousedown={() => showConfirmPassword = true}
              onmouseup={() => showConfirmPassword = false}
              onmouseleave={() => showConfirmPassword = false}
              ontouchstart={() => showConfirmPassword = true}
              ontouchend={() => showConfirmPassword = false}
              class="absolute right-0 top-0 h-full px-3 flex items-center transition-colors select-none border-l" style="color: color-mix(in srgb, var(--color-fg) 40%, transparent); border-color: var(--color-border);"
            >
              {#if showConfirmPassword}
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              {:else}
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
              {/if}
            </button>
          </div>
        </div>

        <!-- Submit -->
        <button type="submit" disabled={submitting || success} class="btn-bh-red w-full !py-3 !text-base mt-2">
          {submitting ? 'Creating Account...' : 'Create Account'}
        </button>
      </form>

      <!-- Divider -->
      <div class="divider-bh"></div>

      <!-- Footer -->
      <p class="text-center text-sm mb-6" style="color: color-mix(in srgb, var(--color-fg) 60%, transparent);">
        Already have an account?
        <a href="/login?redirect={encodeURIComponent(redirectUrl)}" class="font-semibold hover:underline" style="color: var(--color-fg);">Login here</a>
      </p>

      <!-- Why Join box -->
      <div class="glass-surface p-5">
        <h3 class="label-bh mb-4">Why Join?</h3>
        <ul class="list-none p-0 m-0 space-y-2.5 text-sm" style="color: color-mix(in srgb, var(--color-fg) 70%, transparent);">
          <li class="flex items-start gap-2">
            <span class="font-bold shrink-0" style="color: var(--color-green);">&#10003;</span>
            <span>Sell your products to a global audience</span>
          </li>
          <li class="flex items-start gap-2">
            <span class="font-bold shrink-0" style="color: var(--color-green);">&#10003;</span>
            <span>Bid on unique items from sellers worldwide</span>
          </li>
          <li class="flex items-start gap-2">
            <span class="font-bold shrink-0" style="color: var(--color-green);">&#10003;</span>
            <span>Track your bids and listings in one place</span>
          </li>
          <li class="flex items-start gap-2">
            <span class="font-bold shrink-0" style="color: var(--color-green);">&#10003;</span>
            <span>Secure transactions and buyer protection</span>
          </li>
        </ul>
      </div>
    </div>
  </div>
</div>

<style>
  .error-flash {
    animation: errorPulse 0.6s ease-out;
  }

  @keyframes errorPulse {
    0%   { transform: scale(1); box-shadow: 0 0 0 0 rgba(220, 38, 38, 0.5); }
    30%  { transform: scale(1.02); box-shadow: 0 0 0 6px rgba(220, 38, 38, 0.2); }
    60%  { transform: scale(0.99); box-shadow: 0 0 0 0 rgba(220, 38, 38, 0); }
    100% { transform: scale(1); box-shadow: none; }
  }
</style>
