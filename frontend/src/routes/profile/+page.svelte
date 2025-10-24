<script lang="ts">
  export let params: any = undefined; // SvelteKit passes this automatically
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { authStore } from '$lib/stores/auth';
  import { getUserLimits, type UserLimits } from '$lib/api';

  let userLimits: UserLimits | null = null;
  let loading = true;

  onMount(async () => {
    if (!$authStore.isAuthenticated) {
      goto('/login?redirect=/profile');
      return;
    }

    // Fetch user's limits
    userLimits = await getUserLimits();
    loading = false;
  });

  function getProgressPercent(current: number, max: number): number {
    return (current / max) * 100;
  }
</script>

<svelte:head>
  <title>Profile - BidMo.to</title>
</svelte:head>

<div class="profile-page">
  <div class="profile-header">
    <h1>My Profile</h1>
    <p class="subtitle">View your account information and activity limits</p>
  </div>

  <!-- User Info Card -->
  <div class="info-card">
    <div class="card-header">
      <span class="icon">👤</span>
      <h2>Account Information</h2>
    </div>
    <div class="info-grid">
      <div class="info-item">
        <span class="info-label">Name:</span>
        <span class="info-value">{$authStore.user?.name || 'N/A'}</span>
      </div>
      <div class="info-item">
        <span class="info-label">Email:</span>
        <span class="info-value">{$authStore.user?.email || 'N/A'}</span>
      </div>
      <div class="info-item">
        <span class="info-label">Currency:</span>
        <span class="info-value">{$authStore.user?.currency || 'PHP'}</span>
      </div>
      <div class="info-item">
        <span class="info-label">Role:</span>
        <span class="info-value capitalize">{$authStore.user?.role || 'buyer'}</span>
      </div>
    </div>
  </div>

  <!-- Activity Limits -->
  {#if loading}
    <div class="loading-state">
      <div class="spinner"></div>
      <p>Loading your limits...</p>
    </div>
  {:else if userLimits}
    <div class="limits-section">
      <h2 class="section-title">Activity Limits</h2>
      <p class="section-description">Track your usage of bidding and posting features</p>

      <div class="limits-grid">
        <!-- Bidding Limits Card -->
        <div class="limit-card">
          <div class="card-header">
            <span class="icon">🔨</span>
            <h3>Bidding Limit</h3>
          </div>
          <div class="limit-content">
            <div class="limit-stats">
              <div class="stat-large">
                <span class="stat-number">{userLimits.bids.current}</span>
                <span class="stat-label">of {userLimits.bids.max}</span>
              </div>
              <div class="stat-remaining" class:warning={userLimits.bids.remaining === 1} class:danger={userLimits.bids.remaining === 0}>
                <span class="remaining-number">{userLimits.bids.remaining}</span>
                <span class="remaining-label">remaining</span>
              </div>
            </div>

            <div class="progress-bar">
              <div class="progress-fill" style="width: {getProgressPercent(userLimits.bids.current, userLimits.bids.max)}%"></div>
            </div>

            <p class="limit-description">
              You can bid on up to {userLimits.bids.max} different products at a time.
              {#if userLimits.bids.remaining === 0}
                <strong class="text-danger">Limit reached!</strong> Wait for your auctions to end before bidding on new items.
              {:else if userLimits.bids.remaining === 1}
                <strong class="text-warning">Only {userLimits.bids.remaining} slot left!</strong>
              {/if}
            </p>

            <div class="card-footer">
              <a href="/products?status=my-bids" class="btn-secondary">View My Bids</a>
            </div>
          </div>
        </div>

        <!-- Posting Limits Card -->
        <div class="limit-card">
          <div class="card-header">
            <span class="icon">📝</span>
            <h3>Posting Limit</h3>
          </div>
          <div class="limit-content">
            <div class="limit-stats">
              <div class="stat-large">
                <span class="stat-number">{userLimits.posts.current}</span>
                <span class="stat-label">of {userLimits.posts.max}</span>
              </div>
              <div class="stat-remaining" class:warning={userLimits.posts.remaining === 1} class:danger={userLimits.posts.remaining === 0}>
                <span class="remaining-number">{userLimits.posts.remaining}</span>
                <span class="remaining-label">remaining</span>
              </div>
            </div>

            <div class="progress-bar">
              <div class="progress-fill posts" style="width: {getProgressPercent(userLimits.posts.current, userLimits.posts.max)}%"></div>
            </div>

            <p class="limit-description">
              You can list up to {userLimits.posts.max} products for free.
              {#if userLimits.posts.remaining === 0}
                <strong class="text-danger">Limit reached!</strong> To list more, you'll need to add a deposit (coming soon).
              {:else if userLimits.posts.remaining === 1}
                <strong class="text-warning">Only {userLimits.posts.remaining} slot left!</strong>
              {/if}
            </p>

            <div class="card-footer">
              {#if userLimits.posts.remaining > 0}
                <a href="/sell" class="btn-primary">Create New Listing</a>
              {:else}
                <button class="btn-disabled" disabled>Limit Reached</button>
              {/if}
              <a href="/dashboard" class="btn-secondary">View My Products</a>
            </div>
          </div>
        </div>
      </div>

      <!-- Future Features Note -->
      <div class="info-banner">
        <span class="info-icon">ℹ️</span>
        <div class="info-text">
          <strong>Coming Soon:</strong> Deposit system to unlock unlimited bidding and posting capabilities.
          With a refundable deposit, you'll be able to bid on unlimited products and list unlimited items!
        </div>
      </div>
    </div>
  {:else}
    <div class="error-state">
      <p>Unable to load your limits. Please try again later.</p>
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
    margin-bottom: 2rem;
  }

  h1 {
    font-size: 2.5rem;
    margin-bottom: 0.5rem;
    color: #111;
  }

  .subtitle {
    color: #666;
    font-size: 1.1rem;
  }

  .info-card {
    background: white;
    border-radius: 12px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    padding: 2rem;
    margin-bottom: 2rem;
  }

  .card-header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 1.5rem;
  }

  .icon {
    font-size: 1.75rem;
  }

  h2 {
    font-size: 1.5rem;
    margin: 0;
    color: #111;
  }

  h3 {
    font-size: 1.25rem;
    margin: 0;
    color: #111;
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
    color: #666;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .info-value {
    font-size: 1.1rem;
    color: #111;
    font-weight: 500;
  }

  .capitalize {
    text-transform: capitalize;
  }

  .loading-state,
  .error-state {
    text-align: center;
    padding: 3rem;
    color: #666;
  }

  .spinner {
    width: 40px;
    height: 40px;
    border: 4px solid #f3f3f3;
    border-top: 4px solid #dc2626;
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
    color: #111;
  }

  .section-description {
    color: #666;
    margin-bottom: 2rem;
  }

  .limits-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
    gap: 2rem;
    margin-bottom: 2rem;
  }

  .limit-card {
    background: white;
    border-radius: 12px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    overflow: hidden;
    transition: transform 0.2s, box-shadow 0.2s;
  }

  .limit-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
  }

  .limit-card .card-header {
    background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%);
    color: white;
    padding: 1.5rem;
    margin-bottom: 0;
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
    color: #dc2626;
    line-height: 1;
  }

  .stat-label {
    font-size: 1rem;
    color: #666;
    margin-top: 0.25rem;
  }

  .stat-remaining {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 1rem;
    background: #f3f4f6;
    border-radius: 8px;
  }

  .stat-remaining.warning {
    background: #fef3c7;
  }

  .stat-remaining.danger {
    background: #fee2e2;
  }

  .remaining-number {
    font-size: 2rem;
    font-weight: 700;
    color: #059669;
  }

  .stat-remaining.warning .remaining-number {
    color: #d97706;
  }

  .stat-remaining.danger .remaining-number {
    color: #dc2626;
  }

  .remaining-label {
    font-size: 0.875rem;
    color: #666;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .progress-bar {
    width: 100%;
    height: 12px;
    background: #e5e7eb;
    border-radius: 6px;
    overflow: hidden;
    margin-bottom: 1.5rem;
  }

  .progress-fill {
    height: 100%;
    background: linear-gradient(90deg, #dc2626 0%, #991b1b 100%);
    border-radius: 6px;
    transition: width 0.3s ease;
  }

  .progress-fill.posts {
    background: linear-gradient(90deg, #059669 0%, #047857 100%);
  }

  .limit-description {
    color: #666;
    line-height: 1.6;
    margin-bottom: 1.5rem;
  }

  .text-danger {
    color: #dc2626;
  }

  .text-warning {
    color: #d97706;
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
    border-radius: 6px;
    font-weight: 600;
    text-decoration: none;
    transition: all 0.2s;
    text-align: center;
    border: none;
    cursor: pointer;
  }

  .btn-primary {
    background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%);
    color: white;
  }

  .btn-primary:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(220, 38, 38, 0.3);
  }

  .btn-secondary {
    background: white;
    color: #dc2626;
    border: 2px solid #dc2626;
  }

  .btn-secondary:hover {
    background: #dc2626;
    color: white;
  }

  .btn-disabled {
    background: #e5e7eb;
    color: #9ca3af;
    cursor: not-allowed;
  }

  .info-banner {
    background: linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%);
    border: 2px solid #3b82f6;
    border-radius: 8px;
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
    color: #1e3a8a;
    line-height: 1.6;
  }

  @media (max-width: 768px) {
    h1 {
      font-size: 2rem;
    }

    .limits-grid {
      grid-template-columns: 1fr;
    }

    .info-grid {
      grid-template-columns: 1fr;
    }

    .card-footer {
      flex-direction: column;
    }

    .btn-primary,
    .btn-secondary,
    .btn-disabled {
      width: 100%;
    }
  }
</style>
