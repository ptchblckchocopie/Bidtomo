<script lang="ts">
  import { goto } from '$app/navigation';
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

  // Get redirect URL from query params
  const redirectUrl = $page.url.searchParams.get('redirect') || '/';

  async function handleRegister(e: Event) {
    e.preventDefault();

    error = '';
    success = false;

    // Validation
    if (!name || !email || !password || !confirmPassword || !phoneNumber) {
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

    // Phone number validation - basic check for digits only
    const cleanPhone = phoneNumber.replace(/\D/g, '');
    if (cleanPhone.length < 7 || cleanPhone.length > 15) {
      error = 'Please enter a valid phone number';
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

<div class="min-h-[calc(100vh-200px)] flex items-center justify-center p-4 sm:p-8 bg-bh-blue">
  <div class="card-bh p-5 sm:p-8 md:p-12 max-w-[500px] w-full">
    <h1 class="headline-bh text-2xl sm:text-4xl mb-2 text-center">Create Account</h1>
    <p class="text-bh-fg/60 text-center mb-8">Join our marketplace to buy and sell products</p>

    {#if success}
      <div class="bg-bh-blue text-white border-4 border-bh-border p-4 mb-6 text-center font-bold">
        Account created successfully! Logging you in...
      </div>
    {/if}

    {#if error}
      <div class="bg-bh-red text-white border-4 border-bh-border p-4 mb-6 text-center font-bold">
        {error}
      </div>
    {/if}

    <form onsubmit={handleRegister}>
      <div class="mb-6">
        <label for="name" class="block mb-2 font-bold text-bh-fg">Full Name</label>
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

      <div class="mb-6">
        <label for="email" class="block mb-2 font-bold text-bh-fg">Email Address</label>
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

      <div class="mb-6">
        <label for="phone" class="block mb-2 font-bold text-bh-fg">Phone Number</label>
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

      <div class="mb-6">
        <label for="password" class="block mb-2 font-bold text-bh-fg">Password</label>
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

      <div class="mb-6">
        <label for="confirmPassword" class="block mb-2 font-bold text-bh-fg">Confirm Password</label>
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
            class="absolute right-0 top-0 h-full px-3 flex items-center text-bh-fg/50 hover:text-bh-fg border-l-[3px] border-bh-border transition-colors select-none"
          >
            {#if showConfirmPassword}
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="square" stroke-linejoin="miter"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            {:else}
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="square" stroke-linejoin="miter"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
            {/if}
          </button>
        </div>
      </div>

      <button type="submit" disabled={submitting || success} class="btn-bh-red w-full text-lg py-3 mt-4">
        {submitting ? 'Creating Account...' : 'Create Account'}
      </button>
    </form>

    <div class="mt-8 text-center">
      <p class="text-bh-fg/60 mb-6">Already have an account? <a href="/login?redirect={encodeURIComponent(redirectUrl)}" class="text-bh-blue font-bold hover:underline">Login here</a></p>

      <div class="card-bh bg-bh-muted p-6 text-left">
        <h3 class="font-bold text-lg text-bh-fg mb-4">Why join?</h3>
        <ul class="list-none p-0 m-0 space-y-2 text-bh-fg/80">
          <li>&#10003; Sell your products to a global audience</li>
          <li>&#10003; Bid on unique items from sellers worldwide</li>
          <li>&#10003; Track your bids and listings in one place</li>
          <li>&#10003; Secure transactions and buyer protection</li>
        </ul>
      </div>
    </div>
  </div>
</div>
