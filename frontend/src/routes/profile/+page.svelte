<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { authStore, getAuthToken } from '$lib/stores/auth';
  import { t } from '$lib/stores/locale';
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
    if (!phone) return $t('profile.notSet');
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
  <title>{$t('profile.title')} - BidMo.to</title>
</svelte:head>

<div class="profile-page">
  <div class="profile-header">
    <div class="profile-avatar-section">
      <div class="avatar-container">
        {#if getProfilePictureUrl()}
          <img src={getProfilePictureUrl()} alt="Profile picture" class="avatar-image" />
        {:else}
          <div class="avatar-placeholder">
            {($authStore.user?.name || 'U').charAt(0).toUpperCase()}
          </div>
        {/if}

        {#if uploadingPicture}
          <div class="avatar-loading">
            <div class="spinner-small"></div>
          </div>
        {/if}
      </div>

      <div class="avatar-actions">
        <button class="btn-upload" onclick={triggerFileSelect} disabled={uploadingPicture}>
          {getProfilePictureUrl() ? $t('profile.changePhoto') : $t('profile.uploadPhoto')}
        </button>
        {#if getProfilePictureUrl()}
          <button class="btn-remove-photo" onclick={removeProfilePicture} disabled={uploadingPicture}>
            {$t('profile.remove')}
          </button>
        {/if}
      </div>

      <input
        bind:this={fileInput}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp"
        onchange={handleFileSelect}
        class="file-input-hidden"
      />
    </div>

    <div class="header-text">
      <h1>{$authStore.user?.name || $t('profile.myProfile')}</h1>
      <p class="subtitle">{$authStore.user?.email || 'View and edit your account information'}</p>
    </div>
  </div>

  {#if error}
    <div class="error-message">{error}</div>
  {/if}

  {#if success}
    <div class="success-message">{success}</div>
  {/if}

  <!-- User Info Card -->
  <div class="info-card">
    <div class="card-header">
      <div class="header-left">
        <span class="icon">👤</span>
        <h2>{$t('profile.accountInfo')}</h2>
      </div>
      {#if !isEditing}
        <button class="btn-edit" onclick={startEditing}>{$t('profile.editProfile')}</button>
      {/if}
    </div>

    {#if isEditing}
      <!-- Edit Form -->
      <form onsubmit={(e) => { e.preventDefault(); saveProfile(); }} class="edit-form">
        <div class="form-group">
          <label for="editName">{$t('profile.fullName')}</label>
          <input
            id="editName"
            type="text"
            bind:value={editName}
            placeholder="Enter your name"
            disabled={saving}
          />
        </div>

        <div class="form-group">
          <label for="editPhone">{$t('profile.phoneNumber')}</label>
          <div class="phone-input-group">
            <select
              id="editCountryCode"
              bind:value={editCountryCode}
              disabled={saving}
              class="country-code-select"
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
              class="phone-input"
            />
          </div>
        </div>

        <div class="form-group readonly">
          <label>{$t('profile.emailAddress')}</label>
          <div class="readonly-value">{$authStore.user?.email || 'N/A'}</div>
          <span class="readonly-hint">{$t('profile.emailCannotChange')}</span>
        </div>

        <div class="form-actions">
          <button type="button" class="btn-cancel" onclick={cancelEditing} disabled={saving}>
            {$t('common.cancel')}
          </button>
          <button type="submit" class="btn-save" disabled={saving}>
            {saving ? $t('profile.saving') : $t('profile.saveChanges')}
          </button>
        </div>
      </form>
    {:else}
      <!-- Display Mode -->
      <div class="info-grid">
        <div class="info-item">
          <span class="info-label">{$t('profile.nameLabel')}</span>
          <span class="info-value">{$authStore.user?.name || 'N/A'}</span>
        </div>
        <div class="info-item">
          <span class="info-label">{$t('profile.emailLabel')}</span>
          <span class="info-value">{$authStore.user?.email || 'N/A'}</span>
        </div>
        <div class="info-item">
          <span class="info-label">{$t('profile.phoneLabel')}</span>
          <span class="info-value">
            {formatPhoneNumber($authStore.user?.countryCode || '+63', $authStore.user?.phoneNumber || '')}
          </span>
        </div>
        <div class="info-item">
          <span class="info-label">{$t('profile.currencyLabel')}</span>
          <span class="info-value">{$authStore.user?.currency || 'PHP'}</span>
        </div>
        <div class="info-item">
          <span class="info-label">{$t('profile.roleLabel')}</span>
          <span class="info-value capitalize">{$authStore.user?.role || 'buyer'}</span>
        </div>
      </div>
    {/if}
  </div>

  <!-- Activity Limits -->
  {#if loading}
    <div class="loading-state">
      <div class="spinner"></div>
      <p>{$t('profile.loadingLimits')}</p>
    </div>
  {:else if userLimits}
    <div class="limits-section">
      <h2 class="section-title">{$t('profile.activityLimits')}</h2>
      <p class="section-description">{$t('profile.activityLimitsDesc')}</p>

      <div class="limits-grid">
        <!-- Bidding Limits Card -->
        <div class="limit-card">
          <div class="card-header">
            <span class="icon">🔨</span>
            <h3>{$t('profile.biddingLimit')}</h3>
          </div>
          <div class="limit-content">
            <div class="limit-stats">
              <div class="stat-large">
                <span class="stat-number">{userLimits.bids.current}</span>
                <span class="stat-label">{$t('common.of')} {userLimits.bids.max}</span>
              </div>
              <div class="stat-remaining" class:warning={userLimits.bids.remaining === 1} class:danger={userLimits.bids.remaining === 0}>
                <span class="remaining-number">{userLimits.bids.remaining}</span>
                <span class="remaining-label">{$t('profile.remaining')}</span>
              </div>
            </div>

            <div class="progress-bar">
              <div class="progress-fill" style="width: {getProgressPercent(userLimits.bids.current, userLimits.bids.max)}%"></div>
            </div>

            <p class="limit-description">
              {$t('profile.bidLimitDesc', { max: userLimits.bids.max })}
              {#if userLimits.bids.remaining === 0}
                <strong class="text-danger">{$t('profile.limitReached')}</strong> {$t('profile.waitForAuctions')}
              {:else if userLimits.bids.remaining === 1}
                <strong class="text-warning">{$t('profile.onlySlotLeft', { remaining: userLimits.bids.remaining })}</strong>
              {/if}
            </p>

            <div class="card-footer">
              <a href="/products?status=my-bids" class="btn-secondary">{$t('profile.viewMyBids')}</a>
            </div>
          </div>
        </div>

        <!-- Posting Limits Card -->
        <div class="limit-card">
          <div class="card-header">
            <span class="icon">📝</span>
            <h3>{$t('profile.postingLimit')}</h3>
          </div>
          <div class="limit-content">
            <div class="limit-stats">
              <div class="stat-large">
                <span class="stat-number">{userLimits.posts.current}</span>
                <span class="stat-label">{$t('common.of')} {userLimits.posts.max}</span>
              </div>
              <div class="stat-remaining" class:warning={userLimits.posts.remaining === 1} class:danger={userLimits.posts.remaining === 0}>
                <span class="remaining-number">{userLimits.posts.remaining}</span>
                <span class="remaining-label">{$t('profile.remaining')}</span>
              </div>
            </div>

            <div class="progress-bar">
              <div class="progress-fill posts" style="width: {getProgressPercent(userLimits.posts.current, userLimits.posts.max)}%"></div>
            </div>

            <p class="limit-description">
              {$t('profile.postLimitDesc', { max: userLimits.posts.max })}
              {#if userLimits.posts.remaining === 0}
                <strong class="text-danger">{$t('profile.limitReached')}</strong> {$t('profile.depositNeeded')}
              {:else if userLimits.posts.remaining === 1}
                <strong class="text-warning">{$t('profile.onlySlotLeft', { remaining: userLimits.posts.remaining })}</strong>
              {/if}
            </p>

            <div class="card-footer">
              {#if userLimits.posts.remaining > 0}
                <a href="/sell" class="btn-primary">{$t('profile.createNewListing')}</a>
              {:else}
                <button class="btn-disabled" disabled>{$t('profile.limitReached')}</button>
              {/if}
              <a href="/dashboard" class="btn-secondary">{$t('profile.viewMyProducts')}</a>
            </div>
          </div>
        </div>
      </div>

      <!-- Future Features Note -->
      <div class="info-banner">
        <span class="info-icon">ℹ️</span>
        <div class="info-text">
          <strong>{$t('profile.comingSoonTitle')}</strong> {$t('profile.comingSoonDesc')}
        </div>
      </div>
    </div>
  {:else}
    <div class="error-state">
      <p>{$t('profile.unableToLoad')}</p>
    </div>
  {/if}
</div>

<style>
  .profile-page {
    max-width: 1000px;
    margin: 0 auto;
    padding: 2rem 0;
  }

  .profile-header {
    display: flex;
    align-items: center;
    gap: 2rem;
    margin-bottom: 2rem;
  }

  .profile-avatar-section {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.75rem;
    flex-shrink: 0;
  }

  .avatar-container {
    position: relative;
    width: 120px;
    height: 120px;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    overflow: hidden;
    background: var(--color-muted);
  }

  .avatar-image {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  .avatar-placeholder {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 3rem;
    font-weight: 800;
    color: white;
    background: var(--color-red);
  }

  .avatar-loading {
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .spinner-small {
    width: 30px;
    height: 30px;
    border: 3px solid rgba(255, 255, 255, 0.3);
    border-top: 3px solid white;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  .avatar-actions {
    display: flex;
    gap: 0.5rem;
  }

  .btn-upload {
    padding: 0.4rem 0.75rem;
    background: var(--color-blue);
    color: white;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    font-weight: 600;
    font-size: 0.8rem;
    cursor: pointer;
    transition: all 0.15s;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .btn-upload:hover:not(:disabled) {
    background: var(--color-fg);
    color: var(--color-bg);
    border-color: var(--color-fg);
  }

  .btn-upload:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-remove-photo {
    padding: 0.4rem 0.75rem;
    background: var(--color-surface);
    color: var(--color-red);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    font-weight: 600;
    font-size: 0.8rem;
    cursor: pointer;
    transition: all 0.15s;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .btn-remove-photo:hover:not(:disabled) {
    background: var(--color-red);
    color: white;
  }

  .btn-remove-photo:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .file-input-hidden {
    display: none;
  }

  .header-text {
    flex: 1;
    min-width: 0;
  }

  h1 {
    font-size: 2.5rem;
    margin-bottom: 0.5rem;
    color: var(--color-fg);
    text-transform: uppercase;
    letter-spacing: -0.025em;
  }

  .subtitle {
    color: var(--color-muted-fg);
    font-size: 1.1rem;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .error-message {
    background-color: var(--color-muted);
    color: var(--color-red);
    padding: 1rem;
    margin-bottom: 1.5rem;
    border: 1px solid var(--color-red);
    border-radius: var(--radius-md);
  }

  .success-message {
    background-color: var(--color-muted);
    color: var(--color-blue);
    padding: 1rem;
    margin-bottom: 1.5rem;
    border: 1px solid var(--color-blue);
    border-radius: var(--radius-md);
  }

  .info-card {
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    padding: 2rem;
    margin-bottom: 2rem;
  }

  .card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 1.5rem;
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .icon {
    font-size: 1.75rem;
  }

  h2 {
    font-size: 1.5rem;
    margin: 0;
    color: var(--color-fg);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  h3 {
    font-size: 1.25rem;
    margin: 0;
    color: var(--color-fg);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .btn-edit {
    padding: 0.5rem 1rem;
    background: var(--color-red);
    color: white;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-size: 0.85rem;
  }

  .btn-edit:hover {
    background: var(--color-fg);
    color: var(--color-bg);
    border-color: var(--color-fg);
  }

  /* Edit Form Styles */
  .edit-form {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .form-group label {
    font-weight: 600;
    color: var(--color-fg);
    font-size: 0.9rem;
  }

  .form-group input,
  .form-group select {
    padding: 0.75rem;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: var(--color-muted);
    color: var(--color-fg);
    font-size: 1rem;
    transition: border-color 0.2s;
  }

  .form-group input:focus,
  .form-group select:focus {
    outline: none;
    border-color: var(--color-blue);
    box-shadow: 0 0 0 1px var(--color-blue);
  }

  .form-group input:disabled,
  .form-group select:disabled {
    background-color: var(--color-muted);
    cursor: not-allowed;
  }

  .phone-input-group {
    display: flex;
    gap: 0.5rem;
  }

  .country-code-select {
    width: 120px;
    flex-shrink: 0;
  }

  .phone-input {
    flex: 1;
  }

  .form-group.readonly .readonly-value {
    padding: 0.75rem;
    background: var(--color-muted);
    color: var(--color-muted-fg);
    border-radius: var(--radius-sm);
  }

  .readonly-hint {
    font-size: 0.8rem;
    color: var(--color-muted-fg);
  }

  .form-actions {
    display: flex;
    gap: 1rem;
    justify-content: flex-end;
    margin-top: 1rem;
  }

  .btn-cancel {
    padding: 0.75rem 1.5rem;
    background: var(--color-surface);
    color: var(--color-muted-fg);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
  }

  .btn-cancel:hover:not(:disabled) {
    background: var(--color-surface-hover);
    color: var(--color-fg);
  }

  .btn-save {
    padding: 0.75rem 1.5rem;
    background: var(--color-red);
    color: white;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .btn-save:hover:not(:disabled) {
    background: var(--color-fg);
    color: var(--color-bg);
    border-color: var(--color-fg);
  }

  .btn-save:disabled,
  .btn-cancel:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .info-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 1.5rem;
  }

  .info-item {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .info-label {
    font-size: 0.875rem;
    color: var(--color-muted-fg);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .info-value {
    font-size: 1.1rem;
    color: var(--color-fg);
    font-weight: 500;
  }

  .capitalize {
    text-transform: capitalize;
  }

  .loading-state,
  .error-state {
    text-align: center;
    padding: 3rem;
    color: var(--color-muted-fg);
  }

  .spinner {
    width: 40px;
    height: 40px;
    border: 4px solid var(--color-muted);
    border-top: 4px solid var(--color-red);
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin: 0 auto 1rem;
  }

  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }

  .limits-section {
    margin-top: 2rem;
  }

  .section-title {
    font-size: 2rem;
    margin-bottom: 0.5rem;
    color: var(--color-fg);
    text-transform: uppercase;
    letter-spacing: -0.025em;
  }

  .section-description {
    color: var(--color-muted-fg);
    margin-bottom: 2rem;
  }

  .limits-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
    gap: 2rem;
    margin-bottom: 2rem;
  }

  .limit-card {
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    overflow: hidden;
    transition: all 0.15s;
  }

  .limit-card:hover {
    background: var(--color-surface-hover);
  }

  .limit-card .card-header {
    background: var(--color-red);
    color: white;
    padding: 1.5rem;
    margin-bottom: 0;
    justify-content: flex-start;
    gap: 0.75rem;
  }

  .limit-card h3 {
    color: white;
  }

  .limit-content {
    padding: 2rem;
  }

  .limit-stats {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1.5rem;
  }

  .stat-large {
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .stat-number {
    font-size: 3rem;
    font-weight: 900;
    color: var(--color-red);
    line-height: 1;
  }

  .stat-label {
    font-size: 1rem;
    color: var(--color-muted-fg);
    margin-top: 0.25rem;
  }

  .stat-remaining {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 1rem;
    background: var(--color-muted);
    border-radius: var(--radius-md);
  }

  .stat-remaining.warning {
    background: var(--color-red);
    color: white;
  }

  .stat-remaining.danger {
    background: var(--color-muted);
    border: 1px solid var(--color-red);
  }

  .remaining-number {
    font-size: 2rem;
    font-weight: 700;
    color: var(--color-blue);
  }

  .stat-remaining.warning .remaining-number {
    color: var(--color-fg);
  }

  .stat-remaining.danger .remaining-number {
    color: var(--color-red);
  }

  .remaining-label {
    font-size: 0.875rem;
    color: var(--color-muted-fg);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .progress-bar {
    width: 100%;
    height: 12px;
    background: var(--color-border);
    border-radius: var(--radius-sm);
    overflow: hidden;
    margin-bottom: 1.5rem;
  }

  .progress-fill {
    height: 100%;
    background: var(--color-red);
    transition: width 0.3s ease;
  }

  .progress-fill.posts {
    background: var(--color-blue);
  }

  .limit-description {
    color: var(--color-muted-fg);
    line-height: 1.6;
    margin-bottom: 1.5rem;
  }

  .text-danger {
    color: var(--color-red);
  }

  .text-warning {
    color: var(--color-red);
  }

  .card-footer {
    display: flex;
    gap: 1rem;
    flex-wrap: wrap;
  }

  .btn-primary,
  .btn-secondary,
  .btn-disabled {
    padding: 0.75rem 1.5rem;
    font-weight: 600;
    text-decoration: none;
    transition: all 0.15s;
    text-align: center;
    border: none;
    cursor: pointer;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-size: 0.875rem;
  }

  .btn-primary {
    background: var(--color-red);
    color: white;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
  }

  .btn-primary:hover {
    background: var(--color-fg);
    color: var(--color-bg);
    border-color: var(--color-fg);
  }

  .btn-secondary {
    background: var(--color-surface);
    color: var(--color-red);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
  }

  .btn-secondary:hover {
    background: var(--color-surface-hover);
    color: var(--color-red);
  }

  .btn-disabled {
    background: var(--color-muted);
    color: var(--color-muted-fg);
    border-radius: var(--radius-sm);
    cursor: not-allowed;
  }

  .info-banner {
    background: var(--color-muted);
    border: 1px solid var(--color-blue);
    border-radius: var(--radius-lg);
    padding: 1.25rem;
    display: flex;
    align-items: flex-start;
    gap: 1rem;
  }

  .info-icon {
    font-size: 1.5rem;
    flex-shrink: 0;
  }

  .info-text {
    color: var(--color-fg);
    line-height: 1.6;
  }

  @media (max-width: 768px) {
    .profile-page {
      margin-left: -1rem;
      margin-right: -1rem;
      padding-left: 1rem;
      padding-right: 1rem;
      padding-top: 0.5rem;
    }

    .profile-header {
      flex-direction: column;
      text-align: center;
      gap: 1rem;
      margin-bottom: 1rem;
    }

    .avatar-container {
      width: 100px;
      height: 100px;
    }

    .avatar-placeholder {
      font-size: 2.5rem;
    }

    .header-text {
      text-align: center;
    }

    h1 {
      font-size: 1.5rem;
    }

    .subtitle {
      font-size: 0.9rem;
    }

    .info-card {
      padding: 1.25rem;
      margin-bottom: 1.25rem;
    }

    .card-header {
      flex-direction: column;
      align-items: flex-start;
      gap: 0.75rem;
      margin-bottom: 1rem;
    }

    .icon {
      font-size: 1.5rem;
    }

    h2 {
      font-size: 1.2rem;
    }

    .btn-edit {
      width: 100%;
      text-align: center;
    }

    .info-grid {
      grid-template-columns: 1fr;
      gap: 1rem;
    }

    .info-label {
      font-size: 0.8rem;
    }

    .info-value {
      font-size: 1rem;
    }

    .edit-form {
      gap: 1rem;
    }

    .phone-input-group {
      flex-direction: column;
      gap: 0.5rem;
    }

    .country-code-select {
      width: 100%;
    }

    .form-actions {
      flex-direction: column-reverse;
      gap: 0.5rem;
    }

    .btn-cancel,
    .btn-save {
      width: 100%;
      text-align: center;
    }

    .error-message,
    .success-message {
      font-size: 0.9rem;
      padding: 0.75rem;
      margin-bottom: 1rem;
    }

    .limits-section {
      margin-top: 1.25rem;
    }

    .section-title {
      font-size: 1.3rem;
    }

    .section-description {
      font-size: 0.9rem;
      margin-bottom: 1rem;
    }

    .limits-grid {
      grid-template-columns: 1fr;
      gap: 1.25rem;
      margin-bottom: 1.25rem;
    }

    .limit-card:hover {
      transform: none;
    }

    .limit-card .card-header {
      padding: 1rem;
      flex-direction: row;
      align-items: center;
      gap: 0.5rem;
    }

    h3 {
      font-size: 1.1rem;
    }

    .limit-content {
      padding: 1.25rem;
    }

    .limit-stats {
      margin-bottom: 1rem;
    }

    .stat-number {
      font-size: 2.25rem;
    }

    .stat-label {
      font-size: 0.85rem;
    }

    .stat-remaining {
      padding: 0.75rem;
    }

    .remaining-number {
      font-size: 1.5rem;
    }

    .progress-bar {
      height: 10px;
      margin-bottom: 1rem;
    }

    .limit-description {
      font-size: 0.875rem;
      margin-bottom: 1rem;
    }

    .card-footer {
      flex-direction: column;
      gap: 0.5rem;
    }

    .btn-primary,
    .btn-secondary,
    .btn-disabled {
      width: 100%;
      padding: 0.7rem 1rem;
      font-size: 0.9rem;
    }

    .info-banner {
      padding: 1rem;
      gap: 0.75rem;
    }

    .info-icon {
      font-size: 1.25rem;
    }

    .info-text {
      font-size: 0.875rem;
    }
  }
</style>
