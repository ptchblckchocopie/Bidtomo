<script lang="ts">
  import { placeBid, fetchProductBids, updateProduct } from '$lib/api';
  import { authStore } from '$lib/stores/auth';
  import { goto } from '$app/navigation';
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
  let showEditModal = false;
  let showAcceptBidModal = false;
  let censorMyName = false;
  let accepting = false;
  let acceptError = '';
  let acceptSuccess = false;
  let editForm = {
    title: '',
    description: '',
    bidInterval: 0,
    auctionEndDate: '',
    status: 'active' as 'active' | 'ended' | 'sold' | 'cancelled'
  };
  let saving = false;
  let editError = '';
  let editSuccess = false;
  let minEditEndDate = '';
  let editCustomDays = 0;
  let editCustomHours = 0;
  let editDurationTab: 'manual' | 'quick' | 'custom' = 'quick';

  // Sort bids by amount (highest to lowest)
  $: sortedBids = [...data.bids].sort((a, b) => b.amount - a.amount);

  // Countdown timer
  let timeRemaining = '';
  let countdownInterval: ReturnType<typeof setInterval> | null = null;

  async function updateCountdown() {
    if (!data.product?.auctionEndDate) return;

    const now = new Date().getTime();
    const end = new Date(data.product.auctionEndDate).getTime();
    const distance = end - now;

    if (distance < 0) {
      timeRemaining = 'Auction Ended';
      if (countdownInterval) clearInterval(countdownInterval);

      // Auto-close auction if it's still active and time has ended
      if (data.product.status === 'active' && isOwner && highestBid) {
        // Automatically mark as sold if there's a winning bid
        try {
          await updateProduct(data.product.id, { status: 'sold' });
          window.location.reload();
        } catch (error) {
          console.error('Error auto-closing auction:', error);
        }
      } else if (data.product.status === 'active' && isOwner && !highestBid) {
        // Mark as ended if no bids
        try {
          await updateProduct(data.product.id, { status: 'ended' });
          window.location.reload();
        } catch (error) {
          console.error('Error auto-closing auction:', error);
        }
      }

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
      console.log('Calling placeBid with:', data.product.id, bidAmount, censorMyName);
      const result = await placeBid(data.product.id, bidAmount, censorMyName);
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
    censorMyName = false;
  }

  // Function to censor a name (show first letter + asterisks)
  function censorName(name: string): string {
    return name
      .split(' ')
      .map(word => {
        if (word.length === 0) return '';
        const firstLetter = word.charAt(0).toUpperCase();
        const asterisks = '*'.repeat(word.length - 1);
        return firstLetter + asterisks;
      })
      .join(' ');
  }

  // Get display name for a bidder
  function getBidderName(bid: any): string {
    const bidderName = typeof bid.bidder === 'object' ? bid.bidder.name : 'Anonymous';
    return bid.censorName ? censorName(bidderName) : bidderName;
  }

  function closeModal() {
    showLoginModal = false;
  }

  // Check if current user is the seller
  $: isOwner = $authStore.user?.id && data.product?.seller?.id &&
               $authStore.user.id === data.product.seller.id;

  // Get highest bid
  $: highestBid = sortedBids.length > 0 ? sortedBids[0] : null;

  function openEditModal() {
    if (!data.product) return;

    // Format the date for datetime-local input
    const auctionDate = new Date(data.product.auctionEndDate);
    const formattedDate = auctionDate.toISOString().slice(0, 16);

    // Set minimum date to 1 hour from now
    const minDate = new Date();
    minDate.setHours(minDate.getHours() + 1);
    minEditEndDate = minDate.toISOString().slice(0, 16);

    editForm = {
      title: data.product.title,
      description: data.product.description,
      bidInterval: data.product.bidInterval || 1,
      auctionEndDate: formattedDate,
      status: data.product.status
    };
    showEditModal = true;
    editError = '';
    editSuccess = false;
  }

  function closeEditModal() {
    showEditModal = false;
  }

  async function handleSaveProduct() {
    if (!data.product) return;

    saving = true;
    editError = '';
    editSuccess = false;

    try {
      const result = await updateProduct(data.product.id, {
        title: editForm.title,
        description: editForm.description,
        bidInterval: editForm.bidInterval,
        auctionEndDate: new Date(editForm.auctionEndDate).toISOString(),
        status: editForm.status
      });

      if (result) {
        editSuccess = true;
        setTimeout(() => {
          // Refresh the page to load changes
          window.location.reload();
        }, 1000);
      } else {
        editError = 'Failed to update product';
      }
    } catch (error) {
      console.error('Error updating product:', error);
      editError = 'An error occurred while updating the product';
    } finally {
      saving = false;
    }
  }

  function openAcceptBidModal() {
    showAcceptBidModal = true;
    acceptError = '';
    acceptSuccess = false;
  }

  function closeAcceptBidModal() {
    showAcceptBidModal = false;
  }

  async function confirmAcceptBid() {
    if (!data.product || !highestBid) return;

    accepting = true;
    acceptError = '';
    acceptSuccess = false;

    try {
      // Update product status to 'sold'
      const result = await updateProduct(data.product.id, {
        status: 'sold'
      });

      if (result) {
        acceptSuccess = true;
        setTimeout(() => {
          // Refresh the page to show updated status
          window.location.reload();
        }, 1500);
      } else {
        acceptError = 'Failed to accept bid';
      }
    } catch (error) {
      console.error('Error accepting bid:', error);
      acceptError = 'An error occurred while accepting the bid';
    } finally {
      accepting = false;
    }
  }

  // Set edit duration in hours from now
  function setEditDuration(hours: number) {
    const date = new Date();
    date.setHours(date.getHours() + hours);
    editForm.auctionEndDate = date.toISOString().slice(0, 16);
  }

  // Apply custom duration for edit (days + hours)
  function applyEditCustomDuration() {
    const totalHours = (editCustomDays * 24) + editCustomHours;

    if (totalHours < 1) {
      editError = 'Duration must be at least 1 hour';
      return;
    }

    const date = new Date();
    date.setHours(date.getHours() + totalHours);
    editForm.auctionEndDate = date.toISOString().slice(0, 16);

    // Clear error if it was about duration
    if (editError.includes('Duration')) {
      editError = '';
    }
  }
</script>

<svelte:head>
  <title>{data.product?.title || 'Product'} - BidMo.to</title>
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
      {#if isOwner}
        <button class="edit-product-btn" on:click={openEditModal}>
          ✏️ Edit Product
        </button>
      {/if}
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
        <div class="price-info" class:sold-info={data.product.status === 'sold'}>
          {#if data.product.status === 'sold'}
            <div class="highest-bid-container">
              <div class="sold-badge">✓ SOLD</div>
              <div class="highest-bid-amount">{formatPrice(data.product.currentBid || data.product.startingPrice, sellerCurrency)}</div>
              {#if highestBid}
                <div class="sold-to-info">Sold to: {getBidderName(highestBid)}</div>
              {/if}
              <div class="starting-price-small">Starting price: {formatPrice(data.product.startingPrice, sellerCurrency)}</div>
            </div>
          {:else if data.product.currentBid}
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
          {#if isOwner}
            <!-- Owner view - Accept Bid section -->
            <div class="bid-section owner-section">
              <div class="bid-section-header">
                <h3>Your Listing</h3>
                <div class="countdown-timer-inline">
                  <span class="countdown-label">Ends in:</span>
                  <span class="countdown-time">{timeRemaining || 'Loading...'}</span>
                </div>
              </div>

              {#if highestBid}
                <div class="highest-bid-info">
                  <p class="info-text">Current Highest Bid:</p>
                  <p class="bid-amount-large">{formatPrice(highestBid.amount, sellerCurrency)}</p>
                  <p class="bidder-info">by {getBidderName(highestBid)}</p>
                </div>

                <button class="accept-bid-btn" on:click={openAcceptBidModal}>
                  ✓ Accept Bid & Close Auction
                </button>
              {:else}
                <div class="info-message">
                  <p>No bids yet. Waiting for bidders...</p>
                </div>
              {/if}
            </div>
          {:else}
            <!-- Bidder view - Place Bid section -->
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
        {/if}

        {#if sortedBids.length > 0}
          <div class="bid-history">
            <h3>Bid History</h3>
            <div class="bid-history-list">
              {#each sortedBids.slice(0, 10) as bid, index}
                <div
                  class="bid-history-item"
                  class:rank-1={index === 0}
                  style="--rank: {index + 1}"
                >
                  <div class="bid-rank">#{index + 1}</div>
                  <div class="bid-info">
                    <div class="bid-amount">{formatPrice(bid.amount, sellerCurrency)}</div>
                    <div class="bid-details">
                      <span class="bidder-name">{getBidderName(bid)}</span>
                      <span class="bid-time">{formatDate(bid.bidTime)}</span>
                    </div>
                  </div>
                  {#if index === 0}
                    <div class="highest-badge">
                      👑 HIGHEST BID
                    </div>
                  {/if}
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

          <div class="privacy-toggle">
            <label class="toggle-label">
              <input type="checkbox" bind:checked={censorMyName} />
              <span class="toggle-text">
                🔒 Hide my full name (show only initials)
              </span>
            </label>
            <p class="toggle-hint">
              {censorMyName ? `Your name will appear as: ${censorName($authStore.user?.name || 'Your Name')}` : 'Your full name will be visible in bid history'}
            </p>
          </div>
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

<!-- Accept Bid Modal -->
{#if showAcceptBidModal && highestBid}
  <div class="modal-overlay">
    <div class="modal-content confirm-modal">
      <button class="modal-close" on:click={closeAcceptBidModal}>&times;</button>

      <div class="modal-header">
        <h2>Accept Bid & Close Auction</h2>
      </div>

      <div class="modal-body">
        {#if acceptSuccess}
          <div class="success-message">
            Bid accepted! Auction closed. Refreshing...
          </div>
        {/if}

        {#if acceptError}
          <div class="error-message">
            {acceptError}
          </div>
        {/if}

        <div class="confirm-details">
          <p class="product-title">{data.product?.title}</p>

          <div class="bid-confirmation accept-confirmation">
            <div class="confirm-row">
              <span class="label">Winning Bid:</span>
              <span class="value bid-value">{formatPrice(highestBid.amount, sellerCurrency)}</span>
            </div>

            <div class="confirm-row">
              <span class="label">Winner:</span>
              <span class="value">{getBidderName(highestBid)}</span>
            </div>

            <div class="confirm-row">
              <span class="label">Bid Time:</span>
              <span class="value">{formatDate(highestBid.bidTime)}</span>
            </div>
          </div>

          <p class="confirm-message warning-message">
            ⚠️ Are you sure you want to accept this bid? This will close the auction and mark the item as SOLD. This action cannot be undone.
          </p>
        </div>

        <div class="modal-actions">
          <button class="btn-cancel-bid" on:click={closeAcceptBidModal} disabled={accepting}>
            Cancel
          </button>
          <button class="btn-accept-bid" on:click={confirmAcceptBid} disabled={accepting}>
            {accepting ? 'Accepting...' : 'Accept Bid & Close'}
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

<!-- Edit Product Modal -->
{#if showEditModal}
  <div class="modal-overlay">
    <div class="modal-content edit-modal">
      <button class="modal-close" on:click={closeEditModal}>&times;</button>

      <div class="modal-header">
        <h2>Edit Product</h2>
      </div>

      <div class="modal-body">
        {#if editSuccess}
          <div class="success-message">
            Product updated successfully! Refreshing...
          </div>
        {/if}

        {#if editError}
          <div class="error-message">
            {editError}
          </div>
        {/if}

        <form on:submit|preventDefault={handleSaveProduct} class="edit-form">
          <div class="form-group">
            <label for="edit-title">Title</label>
            <input
              id="edit-title"
              type="text"
              bind:value={editForm.title}
              required
              disabled={saving}
            />
          </div>

          <div class="form-group">
            <label for="edit-description">Description</label>
            <textarea
              id="edit-description"
              bind:value={editForm.description}
              rows="4"
              required
              disabled={saving}
            ></textarea>
          </div>

          <div class="form-group">
            <label for="edit-bidInterval">Bid Interval ({sellerCurrency})</label>
            <input
              id="edit-bidInterval"
              type="number"
              bind:value={editForm.bidInterval}
              min="1"
              required
              disabled={saving}
            />
          </div>

          <div class="form-group">
            <label for="edit-status">Status</label>
            <select id="edit-status" bind:value={editForm.status} disabled={saving}>
              <option value="active">Active</option>
              <option value="ended">Ended</option>
              <option value="sold">Sold</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>

          <div class="form-group">
            <label for="edit-auctionEndDate">Auction End Date</label>

            <div class="duration-tabs">
              <button
                type="button"
                class="tab-btn"
                class:active={editDurationTab === 'manual'}
                on:click={() => editDurationTab = 'manual'}
                disabled={saving}
              >
                Manual
              </button>
              <button
                type="button"
                class="tab-btn"
                class:active={editDurationTab === 'quick'}
                on:click={() => editDurationTab = 'quick'}
                disabled={saving}
              >
                Quick Duration
              </button>
              <button
                type="button"
                class="tab-btn"
                class:active={editDurationTab === 'custom'}
                on:click={() => editDurationTab = 'custom'}
                disabled={saving}
              >
                Custom Duration
              </button>
            </div>

            <div class="tab-content">
              {#if editDurationTab === 'manual'}
                <div class="tab-pane">
                  <input
                    id="edit-auctionEndDate"
                    type="datetime-local"
                    bind:value={editForm.auctionEndDate}
                    min={minEditEndDate}
                    required
                    disabled={saving}
                  />
                  <p class="field-hint">Minimum 1 hour from now.</p>
                </div>
              {:else if editDurationTab === 'quick'}
                <div class="tab-pane">
                  <div class="duration-buttons">
                    <button type="button" class="duration-btn" on:click={() => setEditDuration(1)} disabled={saving}>1 Hour</button>
                    <button type="button" class="duration-btn" on:click={() => setEditDuration(6)} disabled={saving}>6 Hours</button>
                    <button type="button" class="duration-btn" on:click={() => setEditDuration(12)} disabled={saving}>12 Hours</button>
                    <button type="button" class="duration-btn" on:click={() => setEditDuration(24)} disabled={saving}>24 Hours</button>
                  </div>
                  <p class="field-hint">Selected: {editForm.auctionEndDate ? new Date(editForm.auctionEndDate).toLocaleString() : 'None'}</p>
                </div>
              {:else if editDurationTab === 'custom'}
                <div class="tab-pane">
                  <div class="custom-duration-inputs">
                    <div class="duration-input-group">
                      <input
                        type="number"
                        min="0"
                        placeholder="0"
                        class="duration-input"
                        bind:value={editCustomDays}
                        disabled={saving}
                      />
                      <span class="duration-unit">Days</span>
                    </div>
                    <div class="duration-input-group">
                      <input
                        type="number"
                        min="0"
                        placeholder="0"
                        class="duration-input"
                        bind:value={editCustomHours}
                        disabled={saving}
                      />
                      <span class="duration-unit">Hours</span>
                    </div>
                    <button type="button" class="apply-duration-btn" on:click={applyEditCustomDuration} disabled={saving}>
                      Apply
                    </button>
                  </div>
                  <p class="field-hint">Selected: {editForm.auctionEndDate ? new Date(editForm.auctionEndDate).toLocaleString() : 'None'}</p>
                </div>
              {/if}
            </div>
          </div>

          <div class="modal-actions">
            <button type="button" class="btn-cancel-edit" on:click={closeEditModal} disabled={saving}>
              Cancel
            </button>
            <button type="submit" class="btn-save-edit" disabled={saving}>
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
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
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .edit-product-btn {
    padding: 0.75rem 1.5rem;
    background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%);
    color: white;
    border: none;
    border-radius: 8px;
    font-size: 1rem;
    font-weight: 600;
    cursor: pointer;
    transition: transform 0.2s, box-shadow 0.2s;
  }

  .edit-product-btn:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(220, 38, 38, 0.4);
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
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 220px;
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

  /* Sold Info Styles */
  .sold-info {
    background: linear-gradient(135deg, #10b981 0%, #059669 100%) !important;
    box-shadow: 0 8px 24px rgba(16, 185, 129, 0.4) !important;
  }

  .sold-badge {
    font-size: 1.2rem;
    font-weight: 900;
    letter-spacing: 3px;
    margin-bottom: 0.75rem;
    color: white;
    background-color: rgba(255, 255, 255, 0.2);
    padding: 0.5rem 1.5rem;
    border-radius: 50px;
    display: inline-block;
  }

  .sold-to-info {
    font-size: 1.1rem;
    font-weight: 600;
    margin-top: 0.75rem;
    color: white;
    opacity: 0.95;
  }

  .bid-section {
    background-color: #e7f3ff;
    padding: 1.5rem;
    border-radius: 8px;
    margin-bottom: 2rem;
    display: flex;
    flex-direction: column;
    min-height: 220px;
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

  /* Gold styling for #1 ranked bid */
  .bid-history-item.rank-1 {
    background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
    border: 3px solid #f59e0b;
    box-shadow: 0 4px 12px rgba(245, 158, 11, 0.3);
    position: relative;
  }

  .bid-history-item.rank-1:hover {
    border-color: #d97706;
    box-shadow: 0 6px 16px rgba(245, 158, 11, 0.4);
  }

  .bid-rank {
    font-size: calc(1rem * var(--scale));
    font-weight: 700;
    color: #667eea;
    min-width: calc(35px * var(--scale));
  }

  .bid-history-item.rank-1 .bid-rank {
    color: #f59e0b;
    font-size: calc(1.2rem * var(--scale));
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

  .bid-history-item.rank-1 .bid-amount {
    color: #f59e0b;
    font-weight: 900;
  }

  .bid-history-item.rank-1 .bidder-name {
    color: #92400e;
  }

  .highest-badge {
    position: absolute;
    top: -0.75rem;
    right: 1rem;
    background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
    color: white;
    padding: 0.375rem 0.875rem;
    border-radius: 12px;
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 0.5px;
    box-shadow: 0 2px 8px rgba(245, 158, 11, 0.4);
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
    margin: 0 0 1.5rem 0;
    line-height: 1.6;
  }

  .privacy-toggle {
    background-color: #f9fafb;
    border: 2px solid #e5e7eb;
    border-radius: 8px;
    padding: 1rem;
    margin-bottom: 1.5rem;
  }

  .toggle-label {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    cursor: pointer;
    user-select: none;
  }

  .toggle-label input[type="checkbox"] {
    width: 20px;
    height: 20px;
    cursor: pointer;
    accent-color: #dc2626;
  }

  .toggle-text {
    font-size: 1rem;
    font-weight: 600;
    color: #333;
  }

  .toggle-hint {
    margin: 0.75rem 0 0 0;
    padding-left: 2rem;
    font-size: 0.875rem;
    color: #666;
    font-style: italic;
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

  /* Edit Modal Styles */
  .edit-modal {
    max-width: 600px;
  }

  .edit-form {
    text-align: left;
  }

  .form-group {
    margin-bottom: 1.5rem;
  }

  .form-group label {
    display: block;
    margin-bottom: 0.5rem;
    font-weight: 600;
    color: #333;
    font-size: 0.95rem;
  }

  .form-group input,
  .form-group textarea,
  .form-group select {
    width: 100%;
    padding: 0.75rem;
    border: 2px solid #e5e7eb;
    border-radius: 6px;
    font-size: 1rem;
    font-family: inherit;
    transition: border-color 0.2s;
  }

  .form-group input:focus,
  .form-group textarea:focus,
  .form-group select:focus {
    outline: none;
    border-color: #dc2626;
    box-shadow: 0 0 0 3px rgba(220, 38, 38, 0.1);
  }

  .form-group input:disabled,
  .form-group textarea:disabled,
  .form-group select:disabled {
    background-color: #f5f5f5;
    cursor: not-allowed;
  }

  .form-group textarea {
    resize: vertical;
    min-height: 100px;
  }

  .field-hint {
    margin: 0.5rem 0 0 0;
    font-size: 0.875rem;
    color: #666;
    font-style: italic;
  }

  .btn-cancel-edit,
  .btn-save-edit {
    flex: 1;
    padding: 1rem 2rem;
    border-radius: 8px;
    font-weight: 600;
    font-size: 1.1rem;
    text-align: center;
    transition: transform 0.2s, box-shadow 0.2s;
    border: none;
    cursor: pointer;
  }

  .btn-cancel-edit {
    background-color: #e5e7eb;
    color: #333;
  }

  .btn-cancel-edit:hover:not(:disabled) {
    background-color: #d1d5db;
  }

  .btn-save-edit {
    background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%);
    color: white;
  }

  .btn-save-edit:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(220, 38, 38, 0.4);
  }

  .btn-cancel-edit:disabled,
  .btn-save-edit:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    transform: none;
  }

  /* Owner Section Styles */
  .owner-section {
    background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
    border: 2px solid #f59e0b;
  }

  .highest-bid-info {
    text-align: center;
    padding: 1.5rem;
    margin: 1rem 0;
  }

  .info-text {
    font-size: 0.95rem;
    color: #92400e;
    font-weight: 600;
    margin: 0 0 0.5rem 0;
  }

  .bid-amount-large {
    font-size: 2.5rem;
    font-weight: 900;
    color: #f59e0b;
    margin: 0.5rem 0;
    text-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  }

  .bidder-info {
    font-size: 1rem;
    color: #92400e;
    margin: 0.5rem 0 0 0;
  }

  .accept-bid-btn {
    width: 100%;
    padding: 1.25rem;
    font-size: 1.2rem;
    font-weight: 700;
    background: linear-gradient(135deg, #10b981 0%, #059669 100%);
    color: white;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    transition: transform 0.2s, box-shadow 0.2s;
    margin-top: 1rem;
  }

  .accept-bid-btn:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(16, 185, 129, 0.4);
  }

  /* Accept Bid Modal Styles */
  .accept-confirmation {
    background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  }

  .warning-message {
    background-color: #fef3c7;
    border: 2px solid #f59e0b;
    border-radius: 8px;
    padding: 1rem;
    margin-top: 1.5rem;
    color: #92400e;
    font-weight: 600;
  }

  .btn-accept-bid {
    flex: 1;
    padding: 1rem 2rem;
    border-radius: 8px;
    font-weight: 600;
    font-size: 1.1rem;
    text-align: center;
    transition: transform 0.2s, box-shadow 0.2s;
    border: none;
    cursor: pointer;
    background: linear-gradient(135deg, #10b981 0%, #059669 100%);
    color: white;
  }

  .btn-accept-bid:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(16, 185, 129, 0.4);
  }

  .btn-accept-bid:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    transform: none;
  }

  /* Duration Selector Styles - Tabs */
  .duration-tabs {
    display: flex;
    gap: 0.5rem;
    margin-top: 1rem;
    border-bottom: 2px solid #e5e7eb;
  }

  .tab-btn {
    padding: 0.75rem 1.5rem;
    background-color: transparent;
    border: none;
    border-bottom: 3px solid transparent;
    color: #666;
    font-size: 0.95rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    margin-bottom: -2px;
  }

  .tab-btn:hover:not(:disabled) {
    color: #dc2626;
  }

  .tab-btn.active {
    color: #dc2626;
    border-bottom-color: #dc2626;
  }

  .tab-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .tab-content {
    margin-top: 1.5rem;
  }

  .tab-pane {
    animation: fadeIn 0.2s ease-in;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: translateY(-10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .duration-buttons {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 0.75rem;
    margin-bottom: 1rem;
  }

  .duration-btn {
    padding: 0.75rem 1.25rem;
    background-color: white;
    border: 2px solid #dc2626;
    color: #dc2626;
    border-radius: 6px;
    font-size: 0.95rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
  }

  .duration-btn:hover:not(:disabled) {
    background-color: #dc2626;
    color: white;
    transform: translateY(-2px);
    box-shadow: 0 2px 8px rgba(220, 38, 38, 0.3);
  }

  .duration-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .custom-duration-inputs {
    display: flex;
    gap: 0.75rem;
    align-items: flex-end;
    flex-wrap: wrap;
  }

  .duration-input-group {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .duration-input {
    width: 80px;
    padding: 0.625rem;
    font-size: 1rem;
    border: 2px solid #e5e7eb;
    border-radius: 6px;
    font-family: inherit;
  }

  .duration-input:focus {
    outline: none;
    border-color: #dc2626;
    box-shadow: 0 0 0 3px rgba(220, 38, 38, 0.1);
  }

  .duration-unit {
    font-size: 0.875rem;
    color: #666;
    font-weight: 500;
  }

  .apply-duration-btn {
    padding: 0.625rem 1.5rem;
    background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%);
    color: white;
    border: none;
    border-radius: 6px;
    font-size: 0.95rem;
    font-weight: 600;
    cursor: pointer;
    transition: transform 0.2s, box-shadow 0.2s;
  }

  .apply-duration-btn:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(220, 38, 38, 0.4);
  }

  .apply-duration-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none;
  }
</style>
