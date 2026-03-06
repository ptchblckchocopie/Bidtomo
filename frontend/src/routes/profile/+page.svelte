<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { authStore, getAuthToken } from '$lib/stores/auth';
  import { getUserLimits, getCurrentUser, type UserLimits } from '$lib/api';

  let userLimits: UserLimits | null = null;
  let loading = true;

  // Edit mode state
  let isEditing = false;
  let saving = false;
  let error = '';
  let success = '';

  // Profile picture state
  let uploadingPicture = false;
  let fileInput: HTMLInputElement;

  // Form fields
  let editName = '';
  let editCountryCode = '+63';
  let editPhoneNumber = '';

  // Country codes list
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

  onMount(async () => {
    // Refresh user data from server to get latest fields (including profilePicture)
    const freshUser = await getCurrentUser();
    if (freshUser) {
      authStore.set({
        ...$authStore,
        user: { ...$authStore.user!, ...freshUser },
      });
    }

    // Initialize edit fields with current user data
    initEditFields();

    // Fetch user's limits
    userLimits = await getUserLimits();
    loading = false;
  });

  function initEditFields() {
    const user = $authStore.user;
    if (user) {
      editName = user.name || '';
      editCountryCode = user.countryCode || '+63';
      editPhoneNumber = user.phoneNumber || '';
    }
  }

  function startEditing() {
    initEditFields();
    isEditing = true;
    error = '';
    success = '';
  }

  function cancelEditing() {
    isEditing = false;
    error = '';
  }

  async function saveProfile() {
    error = '';
    success = '';

    if (!editName.trim()) {
      error = 'Name is required';
      return;
    }

    saving = true;

    try {
      const token = getAuthToken();
      const patchHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) patchHeaders['Authorization'] = `JWT ${token}`;

      const response = await fetch('/api/bridge/users/me', {
        method: 'PATCH',
        headers: patchHeaders,
        credentials: 'include',
        body: JSON.stringify({
          name: editName.trim(),
          countryCode: editCountryCode,
          phoneNumber: editPhoneNumber.replace(/\D/g, ''),
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update profile');
      }

      const updatedUser = await response.json();

      // Update the auth store with new user data
      authStore.set({
        ...$authStore,
        user: {
          ...$authStore.user!,
          name: editName.trim(),
          countryCode: editCountryCode,
          phoneNumber: editPhoneNumber.replace(/\D/g, ''),
        },
      });

      success = 'Profile updated successfully!';
      isEditing = false;
    } catch (err: any) {
      error = err.message || 'Failed to update profile';
    } finally {
      saving = false;
    }
  }

  function formatPhoneNumber(countryCode: string, phone: string): string {
    if (!phone) return 'Not set';
    return `${countryCode} ${phone}`;
  }

  function getProgressPercent(current: number, max: number): number {
    return (current / max) * 100;
  }

  function getProfilePictureUrl(): string | null {
    const pp = $authStore.user?.profilePicture;
    if (!pp) return null;
    if (typeof pp === 'object' && pp.url) return pp.url;
    return null;
  }

  function triggerFileSelect() {
    fileInput?.click();
  }

  async function handleFileSelect(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      error = 'Please select an image file (JPG, PNG, GIF, WebP)';
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      error = 'Image must be under 5MB';
      return;
    }

    error = '';
    success = '';
    uploadingPicture = true;

    try {
      const token = getAuthToken();

      // Step 1: Upload image to /api/bridge/media
      const formData = new FormData();
      formData.append('file', file);

      const uploadHeaders: Record<string, string> = {};
      if (token) uploadHeaders['Authorization'] = `JWT ${token}`;

      const uploadResponse = await fetch('/api/bridge/media', {
        method: 'POST',
        headers: uploadHeaders,
        credentials: 'include',
        body: formData,
      });

      if (!uploadResponse.ok) {
        const errData = await uploadResponse.json().catch(() => null);
        throw new Error(errData?.error || errData?.errors?.[0]?.message || 'Failed to upload image');
      }

      const mediaDoc = await uploadResponse.json();
      const mediaId = mediaDoc.doc?.id || mediaDoc.id;

      if (!mediaId) {
        throw new Error('Upload succeeded but no media ID returned');
      }

      // Step 2: Set as profile picture (CMS handles old image deletion)
      const setHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) setHeaders['Authorization'] = `JWT ${token}`;

      const setResponse = await fetch('/api/bridge/users/profile-picture', {
        method: 'POST',
        headers: setHeaders,
        credentials: 'include',
        body: JSON.stringify({ mediaId }),
      });

      if (!setResponse.ok) {
        const errData = await setResponse.json().catch(() => null);
        throw new Error(errData?.error || errData?.errors?.[0]?.message || 'Failed to set profile picture');
      }

      const result = await setResponse.json();

      // Update auth store with new profile picture data
      const updatedPP = result.user?.profilePicture;
      authStore.set({
        ...$authStore,
        user: {
          ...$authStore.user!,
          profilePicture: typeof updatedPP === 'object' ? updatedPP : { id: mediaId, url: mediaDoc.doc?.url || mediaDoc.url, filename: file.name },
        },
      });

      success = 'Profile picture updated!';
    } catch (err: any) {
      error = err.message || 'Failed to upload profile picture';
    } finally {
      uploadingPicture = false;
      // Reset file input
      if (fileInput) fileInput.value = '';
    }
  }

  async function removeProfilePicture() {
    error = '';
    success = '';
    uploadingPicture = true;

    try {
      const token = getAuthToken();

      const deleteHeaders: Record<string, string> = {};
      if (token) deleteHeaders['Authorization'] = `JWT ${token}`;

      const response = await fetch('/api/bridge/users/profile-picture', {
        method: 'DELETE',
        headers: deleteHeaders,
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to remove profile picture');
      }

      // Update auth store
      authStore.set({
        ...$authStore,
        user: {
          ...$authStore.user!,
          profilePicture: null,
        },
      });

      success = 'Profile picture removed!';
    } catch (err: any) {
      error = err.message || 'Failed to remove profile picture';
    } finally {
      uploadingPicture = false;
    }
  }
</script>

<svelte:head>
  <title>Profile - BidMo.to</title>
</svelte:head>

<div class="max-w-[1000px] mx-auto py-8 sm:py-2 sm:px-4 sm:-mx-4">
  <!-- Profile Header -->
  <div class="flex items-center gap-8 mb-8 sm:flex-col sm:text-center sm:gap-4 sm:mb-4">
    <!-- Avatar Section -->
    <div class="flex flex-col items-center gap-3 flex-shrink-0">
      <div class="relative w-[120px] h-[120px] overflow-hidden
                  border border-[var(--color-border)] bg-[var(--color-muted)]
                  sm:w-[100px] sm:h-[100px]">
        {#if getProfilePictureUrl()}
          <img src={getProfilePictureUrl()} alt="Profile picture" class="w-full h-full object-cover block" />
        {:else}
          <div class="w-full h-full flex items-center justify-center text-5xl font-extrabold text-white bg-[var(--color-fg)] sm:text-4xl">
            {($authStore.user?.name || 'U').charAt(0).toUpperCase()}
          </div>
        {/if}

        {#if uploadingPicture}
          <div class="absolute inset-0 bg-black/50 flex items-center justify-center">
            <div class="w-8 h-8 border-[3px] border-white/30 border-t-white rounded-full animate-spin"></div>
          </div>
        {/if}
      </div>

      <div class="flex gap-2">
        <button class="btn-bh-red text-xs !px-3 !py-1.5" onclick={triggerFileSelect} disabled={uploadingPicture}>
          {getProfilePictureUrl() ? 'Change Photo' : 'Upload Photo'}
        </button>
        {#if getProfilePictureUrl()}
          <button class="btn-bh-outline text-xs !px-3 !py-1.5 !text-[var(--color-red)]"
                  onclick={removeProfilePicture} disabled={uploadingPicture}>
            Remove
          </button>
        {/if}
      </div>

      <input
        bind:this={fileInput}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp"
        onchange={handleFileSelect}
        class="hidden"
      />
    </div>

    <!-- Header Text -->
    <div class="flex-1 min-w-0">
      <h1 class="headline-bh text-4xl mb-2 tracking-tight sm:text-2xl">
        {$authStore.user?.name || 'My Profile'}
      </h1>
      <p class="label-bh text-sm truncate">{$authStore.user?.email || 'View and edit your account information'}</p>
    </div>
  </div>

  <!-- Error/Success Messages -->
  {#if error}
    <div class="mb-6 p-4 border border-[var(--color-red)]/20 bg-[var(--color-red)]/5 text-[var(--color-red)]
                sm:mb-4 sm:p-3 sm:text-sm">
      {error}
    </div>
  {/if}

  {#if success}
    <div class="mb-6 p-4 border border-[var(--color-fg)] bg-[var(--color-muted)] text-[var(--color-fg)]
                sm:mb-4 sm:p-3 sm:text-sm">
      {success}
    </div>
  {/if}

  <!-- Account Information Card -->
  <div class="card-bh p-8 mb-8 sm:p-5 sm:mb-5">
    <div class="flex items-center justify-between mb-6 sm:flex-col sm:items-start sm:gap-3 sm:mb-4">
      <div class="flex items-center gap-3">
        <span class="text-2xl sm:text-xl">&#128100;</span>
        <h2 class="headline-bh text-xl sm:text-lg">Account Information</h2>
      </div>
      {#if !isEditing}
        <button class="btn-bh-red text-xs sm:w-full sm:text-center" onclick={startEditing}>Edit Profile</button>
      {/if}
    </div>

    {#if isEditing}
      <!-- Edit Form -->
      <form onsubmit={(e) => { e.preventDefault(); saveProfile(); }} class="flex flex-col gap-6 sm:gap-4">
        <div class="flex flex-col gap-2">
          <label for="editName" class="label-bh">Full Name</label>
          <input
            id="editName"
            type="text"
            bind:value={editName}
            placeholder="Enter your name"
            disabled={saving}
            class="input-bh"
          />
        </div>

        <div class="flex flex-col gap-2">
          <label for="editPhone" class="label-bh">Phone Number</label>
          <div class="flex gap-2 sm:flex-col">
            <select
              id="editCountryCode"
              bind:value={editCountryCode}
              disabled={saving}
              class="input-bh !w-[120px] flex-shrink-0 sm:!w-full"
            >
              {#each countryCodes as { code, country, flag }}
                <option value={code}>{flag} {code}</option>
              {/each}
            </select>
            <input
              id="editPhone"
              type="tel"
              bind:value={editPhoneNumber}
              placeholder="9XX XXX XXXX"
              disabled={saving}
              class="input-bh flex-1"
            />
          </div>
        </div>

        <div class="flex flex-col gap-2">
          <label class="label-bh">Email Address</label>
          <div class="px-3 py-2.5 bg-[var(--color-muted)] text-[var(--color-fg)]/60">{$authStore.user?.email || 'N/A'}</div>
          <span class="text-xs text-bh-fg/50">Email cannot be changed</span>
        </div>

        <div class="flex gap-4 justify-end mt-4 sm:flex-col-reverse sm:gap-2">
          <button type="button" class="btn-bh-outline sm:w-full" onclick={cancelEditing} disabled={saving}>
            Cancel
          </button>
          <button type="submit" class="btn-bh-red sm:w-full" disabled={saving}>
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </form>
    {:else}
      <!-- Display Mode -->
      <div class="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-6 sm:grid-cols-1 sm:gap-4">
        <div class="flex flex-col gap-2">
          <span class="label-bh">Name</span>
          <span class="text-lg font-medium text-bh-fg sm:text-base">{$authStore.user?.name || 'N/A'}</span>
        </div>
        <div class="flex flex-col gap-2">
          <span class="label-bh">Email</span>
          <span class="text-lg font-medium text-bh-fg sm:text-base">{$authStore.user?.email || 'N/A'}</span>
        </div>
        <div class="flex flex-col gap-2">
          <span class="label-bh">Phone</span>
          <span class="text-lg font-medium text-bh-fg sm:text-base">
            {formatPhoneNumber($authStore.user?.countryCode || '+63', $authStore.user?.phoneNumber || '')}
          </span>
        </div>
        <div class="flex flex-col gap-2">
          <span class="label-bh">Currency</span>
          <span class="text-lg font-medium text-bh-fg sm:text-base">{$authStore.user?.currency || 'PHP'}</span>
        </div>
        <div class="flex flex-col gap-2">
          <span class="label-bh">Role</span>
          <span class="text-lg font-medium text-bh-fg capitalize sm:text-base">{$authStore.user?.role || 'buyer'}</span>
        </div>
      </div>
    {/if}
  </div>

  <!-- Activity Limits -->
  {#if loading}
    <div class="text-center py-12 text-bh-fg/60">
      <div class="w-10 h-10 border-4 border-bh-muted border-t-[var(--color-fg)]
                  rounded-full animate-spin mx-auto mb-4"></div>
      <p>Loading your limits...</p>
    </div>
  {:else if userLimits}
    <div class="mt-8 sm:mt-5">
      <h2 class="headline-bh text-3xl mb-2 tracking-tight sm:text-xl">Activity Limits</h2>
      <p class="label-bh text-sm mb-8 sm:mb-4">Track your usage of bidding and posting features</p>

      <div class="grid grid-cols-[repeat(auto-fit,minmax(350px,1fr))] gap-8 mb-8
                  sm:grid-cols-1 sm:gap-5 sm:mb-5">
        <!-- Bidding Limits Card -->
        <div class="card-bh overflow-hidden">
          <div class="flex items-center gap-3 p-6
                      bg-[var(--color-fg)] text-white sm:p-4">
            <span class="text-2xl">&#128296;</span>
            <h3 class="text-lg font-bold uppercase tracking-wide text-white sm:text-base">Bidding Limit</h3>
          </div>
          <div class="p-8 sm:p-5">
            <div class="flex justify-between items-center mb-6 sm:mb-4">
              <div class="flex flex-col items-center">
                <span class="font-mono text-4xl font-black text-[var(--color-fg)] leading-none
                             sm:text-3xl">{userLimits.bids.current}</span>
                <span class="label-bh mt-1">of {userLimits.bids.max}</span>
              </div>
              <div class="flex flex-col items-center p-4
                          bg-[var(--color-muted)] sm:p-3
                          {userLimits.bids.remaining === 1 ? '!bg-[var(--color-fg)] text-white' : ''}
                          {userLimits.bids.remaining === 0 ? 'border-2 border-[var(--color-red)]' : ''}">
                <span class="font-mono text-2xl font-bold leading-none sm:text-xl
                             {userLimits.bids.remaining === 1 ? 'text-white' : userLimits.bids.remaining === 0 ? 'text-[var(--color-red)]' : 'text-[var(--color-fg)]'}">{userLimits.bids.remaining}</span>
                <span class="label-bh mt-1 {userLimits.bids.remaining === 1 ? '!text-white/80' : ''}">remaining</span>
              </div>
            </div>

            <div class="w-full h-3 bg-[var(--color-muted)] mb-6 sm:h-2.5 sm:mb-4 overflow-hidden">
              <div class="h-full bg-[var(--color-fg)] transition-all duration-300"
                   style="width: {getProgressPercent(userLimits.bids.current, userLimits.bids.max)}%"></div>
            </div>

            <p class="text-sm text-bh-fg/60 leading-relaxed mb-6 sm:mb-4">
              You can bid on up to {userLimits.bids.max} different products at a time.
              {#if userLimits.bids.remaining === 0}
                <strong class="text-[var(--color-red)]">Limit reached!</strong> Wait for your auctions to end before bidding on new items.
              {:else if userLimits.bids.remaining === 1}
                <strong class="text-[var(--color-yellow)]">Only {userLimits.bids.remaining} slot left!</strong>
              {/if}
            </p>

            <div class="flex gap-4 flex-wrap sm:flex-col sm:gap-2">
              <a href="/products?status=my-bids" class="btn-bh-outline flex-1 text-center sm:w-full">View My Bids</a>
            </div>
          </div>
        </div>

        <!-- Posting Limits Card -->
        <div class="card-bh overflow-hidden">
          <div class="flex items-center gap-3 p-6
                      bg-[var(--color-fg)] text-white sm:p-4">
            <span class="text-2xl">&#128221;</span>
            <h3 class="text-lg font-bold uppercase tracking-wide text-white sm:text-base">Posting Limit</h3>
          </div>
          <div class="p-8 sm:p-5">
            <div class="flex justify-between items-center mb-6 sm:mb-4">
              <div class="flex flex-col items-center">
                <span class="font-mono text-4xl font-black text-[var(--color-fg)] leading-none
                             sm:text-3xl">{userLimits.posts.current}</span>
                <span class="label-bh mt-1">of {userLimits.posts.max}</span>
              </div>
              <div class="flex flex-col items-center p-4
                          bg-[var(--color-muted)] sm:p-3
                          {userLimits.posts.remaining === 1 ? '!bg-[var(--color-fg)] text-white' : ''}
                          {userLimits.posts.remaining === 0 ? 'border-2 border-[var(--color-red)]' : ''}">
                <span class="font-mono text-2xl font-bold leading-none sm:text-xl
                             {userLimits.posts.remaining === 1 ? 'text-white' : userLimits.posts.remaining === 0 ? 'text-[var(--color-red)]' : 'text-[var(--color-fg)]'}">{userLimits.posts.remaining}</span>
                <span class="label-bh mt-1 {userLimits.posts.remaining === 1 ? '!text-white/80' : ''}">remaining</span>
              </div>
            </div>

            <div class="w-full h-3 bg-[var(--color-muted)] mb-6 sm:h-2.5 sm:mb-4 overflow-hidden">
              <div class="h-full bg-[var(--color-fg)] transition-all duration-300"
                   style="width: {getProgressPercent(userLimits.posts.current, userLimits.posts.max)}%"></div>
            </div>

            <p class="text-sm text-bh-fg/60 leading-relaxed mb-6 sm:mb-4">
              You can list up to {userLimits.posts.max} products for free.
              {#if userLimits.posts.remaining === 0}
                <strong class="text-[var(--color-red)]">Limit reached!</strong> To list more, you'll need to add a deposit (coming soon).
              {:else if userLimits.posts.remaining === 1}
                <strong class="text-[var(--color-yellow)]">Only {userLimits.posts.remaining} slot left!</strong>
              {/if}
            </p>

            <div class="flex gap-4 flex-wrap sm:flex-col sm:gap-2">
              {#if userLimits.posts.remaining > 0}
                <a href="/sell" class="btn-bh-red flex-1 text-center sm:w-full">Create New Listing</a>
              {:else}
                <button class="btn-bh flex-1 opacity-50 cursor-not-allowed sm:w-full" disabled>Limit Reached</button>
              {/if}
              <a href="/dashboard" class="btn-bh-outline flex-1 text-center sm:w-full">View My Products</a>
            </div>
          </div>
        </div>
      </div>

      <!-- Coming Soon Banner -->
      <div class="flex items-start gap-4 p-5 border border-[var(--color-fg)] bg-[var(--color-muted)]
                  sm:p-4 sm:gap-3">
        <span class="text-2xl flex-shrink-0 sm:text-xl">&#8505;&#65039;</span>
        <div class="text-sm leading-relaxed text-[var(--color-fg)] sm:text-xs">
          <strong>Coming Soon:</strong> Deposit system to unlock unlimited bidding and posting capabilities.
          With a refundable deposit, you'll be able to bid on unlimited products and list unlimited items!
        </div>
      </div>
    </div>
  {:else}
    <div class="text-center py-12 text-bh-fg/60">
      <p>Unable to load your limits. Please try again later.</p>
    </div>
  {/if}
</div>
