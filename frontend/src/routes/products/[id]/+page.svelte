<script lang="ts">
  import { placeBid, fetchProductBids } from '$lib/api';
  import { authStore } from '$lib/stores/auth';
  import type { PageData } from './$types';

  export let data: PageData;

  let bidAmount = 0;

  $: bidInterval = data.product?.bidInterval || 1;
  $: minBid = (data.product?.currentBid || data.product?.startingPrice || 0) + bidInterval;

  // Update bidAmount when minBid changes
  $: if (minBid && bidAmount === 0) {
    bidAmount = minBid;
  }
  let bidding = false;
  let bidError = '';
  let bidSuccess = false;
  let showLoginModal = false;
  let showConfirmBidModal = false;

  // Sort bids by amount (highest to lowest)
  $: sortedBids = [...data.bids].sort((a, b) => b.amount - a.amount);

  // Countdown timer
  let timeRemaining = '';
  let countdownInterval: ReturnType<typeof setInterval> | null = null;

  function updateCountdown() {
    if (!data.product?.auctionEndDate) return;

    const now = new Date().getTime();
    const end = new Date(data.product.auctionEndDate).getTime();
    const distance = end - now;

    if (distance < 0) {
      timeRemaining = 'Auction Ended';
      if (countdownInterval) clearInterval(countdownInterval);
      return;
    }

    const days = Math.floor(distance / (1000 * 60 * 60 * 24));
    const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((distance % (1000 * 60)) / 1000);

    if (days > 0) {
      timeRemaining = `${days}d ${hours}h ${minutes}m ${seconds}s`;
    } else if (hours > 0) {
      timeRemaining = `${hours}h ${minutes}m ${seconds}s`;
    } else {
      timeRemaining = `${minutes}m ${seconds}s`;
    }
  }

  $: if (data.product?.auctionEndDate) {
    updateCountdown();
    if (!countdownInterval) {
      countdownInterval = setInterval(updateCountdown, 1000);
    }
  }

  import { onDestroy } from 'svelte';
  onDestroy(() => {
    if (countdownInterval) clearInterval(countdownInterval);
  });

  function formatPrice(price: number, currency: string = 'PHP'): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
    }).format(price);
  }

  // Get the seller's currency for this product
  $: sellerCurrency = data.product?.seller?.currency || 'PHP';

  function formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function incrementBid() {
    bidAmount = bidAmount + bidInterval;
  }

  function decrementBid() {
    const newAmount = bidAmount - bidInterval;
    if (newAmount >= minBid) {
      bidAmount = newAmount;
    }
  }

  function handlePlaceBid() {
    if (!data.product) return;

    // Check if user is logged in
    if (!$authStore.isAuthenticated) {
      showLoginModal = true;
      return;
    }

    // Validate bid amount
    const currentHighest = data.product.currentBid || data.product.startingPrice;
    const minimumBid = currentHighest + bidInterval;

    if (bidAmount < minimumBid) {
      bidError = `Your bid must be at least ${formatPrice(minimumBid, sellerCurrency)} (current highest: ${formatPrice(currentHighest, sellerCurrency)})`;
      return;
    }

    // Show confirmation modal
    bidError = '';
    showConfirmBidModal = true;
  }

  async function confirmPlaceBid() {
    if (!data.product) return;

    showConfirmBidModal = false;
    bidding = true;
    bidError = '';
    bidSuccess = false;

    try {
      console.log('Calling placeBid with:', data.product.id, bidAmount);
      const result = await placeBid(data.product.id, bidAmount);
      console.log('placeBid result:', result);

      if (result) {
        bidSuccess = true;
        bidError = '';
        // Reload bids
        data.bids = await fetchProductBids(data.product.id);
        // Update product current bid
        if (data.product) {
          data.product.currentBid = bidAmount;
        }
        // Reset bid amount to new minimum
        bidAmount = bidAmount + bidInterval;
      } else {
        bidError = 'Failed to place bid. Please try again.';
      }
    } catch (error) {
      console.error('Error in confirmPlaceBid:', error);
      bidError = 'An error occurred while placing your bid.';
    } finally {
      bidding = false;
    }
  }

  function cancelBid() {
    showConfirmBidModal = false;
  }

  function closeModal() {
    showLoginModal = false;
  }
</script>

<svelte:head>
  <title>{data.product?.title || 'Product'} - Marketplace Platform</title>
</svelte:head>

{#if !data.product}
  <div class="error">
    <h1>Product Not Found</h1>
    <p>The product you're looking for doesn't exist.</p>
    <a href="/products">Back to Products</a>
  </div>
{:else}
  <div class="product-detail">
    <div class="product-header">
      <a href="/products" class="back-link">&larr; Back to Products</a>
    </div>

    <div class="product-content">
      <div class="product-gallery">
        <h1>{data.product.title}</h1>

        <div class="status-badge status-{data.product.status}">
          {data.product.status}
        </div>

        {#if data.product.images && data.product.images.length > 0}
          {#each data.product.images as imageItem}
            <img src="{imageItem.image.url}" alt="{imageItem.image.alt || data.product.title}" />
          {/each}
        {:else}
          <div class="placeholder-image">
            <span>No Image Available</span>
          </div>
        {/if}

        <div class="description-section">
          <h3>Description</h3>
          <p>{data.product.description}</p>
        </div>

        <div class="seller-info">
          <h3>Seller Information</h3>
          <p><strong>Name:</strong> {data.product.seller?.name || 'Unknown'}</p>
        </div>
      </div>

      <div class="product-details">
        <div class="price-info">
          {#if data.product.currentBid}
            <div class="highest-bid-container">
              <div class="highest-bid-label">CURRENT HIGHEST BID</div>
              <div class="highest-bid-amount">{formatPrice(data.product.currentBid, sellerCurrency)}</div>
              <div class="starting-price-small">Starting price: {formatPrice(data.product.startingPrice, sellerCurrency)}</div>
            </div>
          {:else}
            <div class="highest-bid-container">
              <div class="highest-bid-label">STARTING BID</div>
              <div class="highest-bid-amount">{formatPrice(data.product.startingPrice, sellerCurrency)}</div>
              <div class="starting-price-small">No bids yet - be the first!</div>
            </div>
          {/if}
        </div>

        {#if data.product.status === 'active'}
          <div class="bid-section">
            <div class="bid-section-header">
              <h3>Place Your Bid</h3>
              <div class="countdown-timer-inline">
                <span class="countdown-label">Ends in:</span>
                <span class="countdown-time">{timeRemaining || 'Loading...'}</span>
              </div>
            </div>

            {#if !$authStore.isAuthenticated}
              <div class="info-message">
                <p>🔒 You must be logged in to place a bid</p>
              </div>
            {/if}

            {#if bidSuccess}
              <div class="success-message">
                Bid placed successfully! You are now the highest bidder.
              </div>
            {/if}

            {#if bidError}
              <div class="error-message">
                {bidError}
              </div>
            {/if}

            <div class="bid-form">
              <div class="bid-input-group">
                <label>Your Bid Amount</label>
                <div class="bid-control">
                  <button
                    class="bid-arrow-btn"
                    on:click={decrementBid}
                    disabled={bidding || bidAmount <= minBid}
                    type="button"
                    aria-label="Decrease bid"
                  >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <polyline points="6 9 12 15 18 9"></polyline>
                    </svg>
                  </button>
                  <div class="bid-amount-display">
                    {formatPrice(bidAmount, sellerCurrency)}
                  </div>
                  <button
                    class="bid-arrow-btn"
                    on:click={incrementBid}
                    disabled={bidding}
                    type="button"
                    aria-label="Increase bid"
                  >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <polyline points="18 15 12 9 6 15"></polyline>
                    </svg>
                  </button>
                </div>
                <p class="bid-hint">
                  Minimum bid: {formatPrice(minBid, sellerCurrency)} • Increment: {formatPrice(bidInterval, sellerCurrency)}
                </p>
              </div>
              <button class="place-bid-btn" on:click={handlePlaceBid} disabled={bidding}>
                {bidding ? 'Placing Bid...' : 'Place Bid'}
              </button>
            </div>
          </div>
        {/if}

        {#if sortedBids.length > 1}
          <div class="bid-history">
            <h3>Bid History</h3>
            <div class="bid-history-list">
              {#each sortedBids.slice(1, 10) as bid, index}
                <div
                  class="bid-history-item"
                  style="--rank: {index + 2}"
                >
                  <div class="bid-rank">#{index + 2}</div>
                  <div class="bid-info">
                    <div class="bid-amount">{formatPrice(bid.amount, sellerCurrency)}</div>
                    <div class="bid-details">
                      <span class="bidder-name">{typeof bid.bidder === 'object' ? bid.bidder.name : 'Anonymous'}</span>
                      <span class="bid-time">{formatDate(bid.bidTime)}</span>
                    </div>
                  </div>
                </div>
              {/each}
            </div>
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}

<!-- Confirm Bid Modal -->
{#if showConfirmBidModal && data.product}
  <div class="modal-overlay" on:click={cancelBid}>
    <div class="modal-content confirm-modal" on:click|stopPropagation>
      <button class="modal-close" on:click={cancelBid}>&times;</button>

      <div class="modal-header">
        <h2>Confirm Your Bid</h2>
      </div>

      <div class="modal-body">
        <div class="confirm-details">
          <p class="product-title">{data.product.title}</p>

          <div class="bid-confirmation">
            <div class="confirm-row">
              <span class="label">Your Bid:</span>
              <span class="value bid-value">{formatPrice(bidAmount, sellerCurrency)}</span>
            </div>

            {#if data.product.currentBid}
              <div class="confirm-row">
                <span class="label">Current Highest:</span>
                <span class="value">{formatPrice(data.product.currentBid, sellerCurrency)}</span>
              </div>
            {:else}
              <div class="confirm-row">
                <span class="label">Starting Price:</span>
                <span class="value">{formatPrice(data.product.startingPrice, sellerCurrency)}</span>
              </div>
            {/if}
          </div>

          <p class="confirm-message">
            Are you sure you want to place this bid? This action cannot be undone.
          </p>
        </div>

        <div class="modal-actions">
          <button class="btn-cancel-bid" on:click={cancelBid}>
            Cancel
          </button>
          <button class="btn-confirm-bid" on:click={confirmPlaceBid}>
            Confirm Bid
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

<!-- Login Modal -->
{#if showLoginModal}
  <div class="modal-overlay" on:click={closeModal}>
    <div class="modal-content" on:click|stopPropagation>
      <button class="modal-close" on:click={closeModal}>&times;</button>

      <div class="modal-header">
        <h2>🔒 Login Required</h2>
      </div>

      <div class="modal-body">
        <p>You need to be logged in to place a bid on this product.</p>

        <div class="modal-actions">
          <a href="/login?redirect=/products/{data.product?.id}" class="btn-login">
            Login
          </a>
          <a href="/register?redirect=/products/{data.product?.id}" class="btn-register">
            Create Account
          </a>
        </div>

        <p class="modal-note">
          Don't have an account? Register now to start bidding!
        </p>
      </div>
    </div>
  </div>
{/if}

<style>
  .error {
    text-align: center;
    padding: 4rem 2rem;
  }

  .error a {
    color: #0066cc;
    text-decoration: none;
  }

  .product-detail {
    max-width: 1200px;
    margin: 0 auto;
  }

  .product-header {
    margin-bottom: 2rem;
  }

  .back-link {
    color: #0066cc;
    text-decoration: none;
    font-size: 1.1rem;
  }

  .back-link:hover {
    text-decoration: underline;
  }

  .product-content {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 3rem;
    margin-bottom: 3rem;
  }

  @media (max-width: 768px) {
    .product-content {
      grid-template-columns: 1fr;
    }
  }

  .product-gallery h1 {
    font-size: 2.5rem;
    margin-top: 0;
    margin-bottom: 1rem;
    color: #333;
  }

  .product-gallery img {
    width: 100%;
    border-radius: 8px;
    margin-bottom: 1rem;
  }

  .placeholder-image {
    width: 100%;
    height: 400px;
    background-color: #e0e0e0;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #999;
    font-size: 1.5rem;
  }

  .status-badge {
    display: inline-block;
    padding: 0.5rem 1rem;
    border-radius: 4px;
    font-weight: bold;
    text-transform: uppercase;
    margin-bottom: 1.5rem;
  }

  .status-active {
    background-color: #10b981;
    color: white;
  }

  .status-ended {
    background-color: #ef4444;
    color: white;
  }

  .bid-section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
  }

  .bid-section-header h3 {
    margin: 0;
  }

  .countdown-timer-inline {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
    padding: 0.75rem 1.25rem;
    border-radius: 8px;
    box-shadow: 0 2px 8px rgba(239, 68, 68, 0.3);
  }

  .countdown-timer-inline .countdown-label {
    color: rgba(255, 255, 255, 0.9);
    font-size: 0.875rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .countdown-timer-inline .countdown-time {
    color: white;
    font-size: 1.5rem;
    font-weight: 900;
    font-family: 'Courier New', monospace;
    letter-spacing: 1.5px;
    text-shadow: 0 1px 4px rgba(0, 0, 0, 0.2);
  }

  .price-info {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    padding: 2rem;
    border-radius: 12px;
    margin-bottom: 1.5rem;
    text-align: center;
    box-shadow: 0 8px 24px rgba(102, 126, 234, 0.3);
  }

  .highest-bid-container {
    color: white;
  }

  .highest-bid-label {
    font-size: 0.9rem;
    font-weight: 700;
    letter-spacing: 2px;
    margin-bottom: 0.75rem;
    opacity: 0.95;
  }

  .highest-bid-amount {
    font-size: 3.5rem;
    font-weight: 900;
    line-height: 1;
    margin-bottom: 0.75rem;
    text-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
  }

  .starting-price-small {
    font-size: 0.95rem;
    opacity: 0.9;
    font-weight: 500;
  }

  .bid-section {
    background-color: #e7f3ff;
    padding: 1.5rem;
    border-radius: 8px;
    margin-bottom: 2rem;
  }

  .bid-form {
    display: flex;
    gap: 1rem;
    margin-top: 1rem;
    align-items: flex-end;
  }

  .bid-input-group {
    flex: 1;
  }

  .bid-input-group label {
    display: block;
    margin-bottom: 0.5rem;
    font-weight: 600;
    color: #333;
  }

  .bid-control {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    background-color: white;
    border: 2px solid #667eea;
    border-radius: 8px;
    padding: 0.5rem;
  }

  .bid-arrow-btn {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    border: none;
    border-radius: 6px;
    width: 48px;
    height: 48px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.2s;
    flex-shrink: 0;
  }

  .bid-arrow-btn:hover:not(:disabled) {
    transform: scale(1.1);
    box-shadow: 0 2px 8px rgba(102, 126, 234, 0.4);
  }

  .bid-arrow-btn:active:not(:disabled) {
    transform: scale(0.95);
  }

  .bid-arrow-btn:disabled {
    background: #e5e7eb;
    cursor: not-allowed;
    opacity: 0.5;
  }

  .bid-arrow-btn svg {
    pointer-events: none;
  }

  .bid-amount-display {
    flex: 1;
    text-align: center;
    font-size: 1.75rem;
    font-weight: 700;
    color: #667eea;
    padding: 0.5rem;
  }

  .bid-hint {
    margin-top: 0.5rem;
    margin-bottom: 0;
    font-size: 0.9rem;
    color: #666;
    font-weight: 500;
  }

  .place-bid-btn {
    padding: 0.875rem 2.5rem;
    font-size: 1.1rem;
    font-weight: 700;
    background: linear-gradient(135deg, #10b981 0%, #059669 100%);
    color: white;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    transition: transform 0.2s, box-shadow 0.2s;
    white-space: nowrap;
  }

  .place-bid-btn:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(16, 185, 129, 0.4);
  }

  .place-bid-btn:disabled {
    background: #ccc;
    cursor: not-allowed;
    transform: none;
  }

  .success-message {
    background-color: #10b981;
    color: white;
    padding: 1rem;
    border-radius: 4px;
    margin-bottom: 1rem;
  }

  .error-message {
    background-color: #ef4444;
    color: white;
    padding: 1rem;
    border-radius: 4px;
    margin-bottom: 1rem;
  }

  .info-message {
    background-color: #3b82f6;
    color: white;
    padding: 1rem;
    border-radius: 6px;
    margin-bottom: 1rem;
    text-align: center;
  }

  .info-message p {
    margin: 0;
    font-weight: 500;
  }

  .description-section,
  .seller-info {
    margin-bottom: 2rem;
  }

  .description-section h3,
  .seller-info h3 {
    margin-bottom: 1rem;
  }

  .bid-history {
    margin-top: 1.5rem;
    margin-bottom: 2rem;
  }

  .bid-history h3 {
    margin-top: 0;
    margin-bottom: 1rem;
    font-size: 1.3rem;
    color: #333;
  }

  .bid-history-list {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .bid-history-item {
    --scale: calc(1 - (var(--rank) - 1) * 0.06);
    display: flex;
    align-items: center;
    gap: calc(1rem * var(--scale));
    padding: calc(1rem * var(--scale));
    background-color: #f9fafb;
    border-radius: 8px;
    border: 2px solid #e5e7eb;
    transition: all 0.2s;
  }

  .bid-history-item:hover {
    border-color: #667eea;
    box-shadow: 0 2px 8px rgba(102, 126, 234, 0.15);
  }

  .bid-rank {
    font-size: calc(1rem * var(--scale));
    font-weight: 700;
    color: #667eea;
    min-width: calc(35px * var(--scale));
  }

  .bid-info {
    flex: 1;
  }

  .bid-amount {
    font-size: calc(1.3rem * var(--scale));
    font-weight: 700;
    color: #333;
    margin-bottom: calc(0.25rem * var(--scale));
  }

  .bid-details {
    display: flex;
    gap: 1rem;
    font-size: calc(0.9rem * var(--scale));
    color: #666;
  }

  .bidder-name {
    font-weight: 600;
  }

  .bid-time {
    opacity: 0.8;
  }

  /* Modal Styles */
  .modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: rgba(0, 0, 0, 0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    animation: fadeIn 0.2s ease-out;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  .modal-content {
    background-color: white;
    border-radius: 12px;
    max-width: 500px;
    width: 90%;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
    position: relative;
    animation: slideUp 0.3s ease-out;
  }

  @keyframes slideUp {
    from {
      transform: translateY(50px);
      opacity: 0;
    }
    to {
      transform: translateY(0);
      opacity: 1;
    }
  }

  .modal-close {
    position: absolute;
    top: 1rem;
    right: 1rem;
    background: none;
    border: none;
    font-size: 2rem;
    color: #999;
    cursor: pointer;
    line-height: 1;
    padding: 0;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    transition: all 0.2s;
  }

  .modal-close:hover {
    background-color: #f0f0f0;
    color: #333;
  }

  .modal-header {
    padding: 2rem 2rem 1rem 2rem;
    text-align: center;
  }

  .modal-header h2 {
    margin: 0;
    font-size: 1.75rem;
    color: #333;
  }

  .modal-body {
    padding: 0 2rem 2rem 2rem;
    text-align: center;
  }

  .modal-body > p {
    font-size: 1.1rem;
    color: #666;
    margin-bottom: 2rem;
  }

  .modal-actions {
    display: flex;
    gap: 1rem;
    margin-bottom: 1.5rem;
  }

  .btn-login,
  .btn-register {
    flex: 1;
    padding: 1rem 2rem;
    border-radius: 8px;
    text-decoration: none;
    font-weight: 600;
    font-size: 1.1rem;
    text-align: center;
    transition: transform 0.2s, box-shadow 0.2s;
  }

  .btn-login {
    background-color: #0066cc;
    color: white;
  }

  .btn-login:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 102, 204, 0.4);
  }

  .btn-register {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
  }

  .btn-register:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
  }

  .modal-note {
    font-size: 0.9rem;
    color: #999;
    margin: 0;
  }

  /* Confirm Bid Modal */
  .confirm-modal {
    max-width: 450px;
  }

  .confirm-details {
    text-align: center;
  }

  .product-title {
    font-size: 1.25rem;
    font-weight: 700;
    color: #333;
    margin: 0 0 1.5rem 0;
    padding-bottom: 1rem;
    border-bottom: 2px solid #e5e7eb;
  }

  .bid-confirmation {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    padding: 1.5rem;
    border-radius: 12px;
    margin-bottom: 1.5rem;
  }

  .confirm-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.75rem;
    color: white;
  }

  .confirm-row:last-child {
    margin-bottom: 0;
  }

  .confirm-row .label {
    font-size: 0.95rem;
    opacity: 0.9;
  }

  .confirm-row .value {
    font-size: 1.25rem;
    font-weight: 700;
  }

  .confirm-row .bid-value {
    font-size: 1.75rem;
    font-weight: 900;
  }

  .confirm-message {
    font-size: 1rem;
    color: #666;
    margin: 0;
    line-height: 1.6;
  }

  .btn-cancel-bid,
  .btn-confirm-bid {
    flex: 1;
    padding: 1rem 2rem;
    border-radius: 8px;
    text-decoration: none;
    font-weight: 600;
    font-size: 1.1rem;
    text-align: center;
    transition: transform 0.2s, box-shadow 0.2s;
    border: none;
    cursor: pointer;
  }

  .btn-cancel-bid {
    background-color: #e5e7eb;
    color: #333;
  }

  .btn-cancel-bid:hover {
    background-color: #d1d5db;
  }

  .btn-confirm-bid {
    background: linear-gradient(135deg, #10b981 0%, #059669 100%);
    color: white;
  }

  .btn-confirm-bid:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(16, 185, 129, 0.4);
  }
</style>
