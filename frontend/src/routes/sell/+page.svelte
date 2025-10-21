<script lang="ts">
  import { createProduct } from '$lib/api';
  import { goto } from '$app/navigation';
  import { authStore } from '$lib/stores/auth';
  import { onMount } from 'svelte';

  let title = '';
  let description = '';
  let startingPrice = 0;
  let auctionEndDate = '';

  let submitting = false;
  let error = '';
  let success = false;

  // Set minimum date to today
  const today = new Date().toISOString().split('T')[0];

  // Check authentication on mount
  onMount(() => {
    if (!$authStore.isAuthenticated) {
      goto('/login?redirect=/sell');
    }
  });

  async function handleSubmit(e: Event) {
    e.preventDefault();

    error = '';
    success = false;
    submitting = true;

    // Validation
    if (!title || !description || startingPrice <= 0 || !auctionEndDate) {
      error = 'Please fill in all fields';
      submitting = false;
      return;
    }

    const result = await createProduct({
      title,
      description,
      startingPrice,
      auctionEndDate: new Date(auctionEndDate).toISOString(),
    });

    if (result) {
      success = true;
      // Redirect to product page
      setTimeout(() => {
        goto(`/products/${result.id}`);
      }, 1500);
    } else {
      error = 'Failed to create product listing. Please make sure you are logged in.';
    }

    submitting = false;
  }
</script>

<svelte:head>
  <title>Sell Your Product - Marketplace Platform</title>
</svelte:head>

<div class="sell-page">
  <h1>List Your Product</h1>
  <p class="subtitle">Create a new auction listing for your product</p>

  {#if success}
    <div class="success-message">
      Product listed successfully! Redirecting to product page...
    </div>
  {/if}

  {#if error}
    <div class="error-message">
      {error}
    </div>
  {/if}

  <form on:submit={handleSubmit}>
    <div class="form-group">
      <label for="title">Product Title *</label>
      <input
        id="title"
        type="text"
        bind:value={title}
        placeholder="Enter a descriptive title"
        required
        disabled={submitting}
      />
    </div>

    <div class="form-group">
      <label for="description">Description *</label>
      <textarea
        id="description"
        bind:value={description}
        placeholder="Describe your product in detail"
        rows="6"
        required
        disabled={submitting}
      ></textarea>
    </div>

    <div class="form-group">
      <label for="startingPrice">Starting Price ($) *</label>
      <input
        id="startingPrice"
        type="number"
        bind:value={startingPrice}
        min="1"
        step="0.01"
        placeholder="0.00"
        required
        disabled={submitting}
      />
    </div>

    <div class="form-group">
      <label for="auctionEndDate">Auction End Date *</label>
      <input
        id="auctionEndDate"
        type="datetime-local"
        bind:value={auctionEndDate}
        min={today}
        required
        disabled={submitting}
      />
    </div>

    <div class="form-actions">
      <button type="submit" class="btn-primary" disabled={submitting}>
        {submitting ? 'Creating Listing...' : 'Create Listing'}
      </button>
      <a href="/products" class="btn-secondary">Cancel</a>
    </div>
  </form>

  <div class="info-box">
    <h3>Before You List</h3>
    <ul>
      <li>You must be logged in to create a listing</li>
      <li>Make sure to provide accurate and detailed information</li>
      <li>Set a competitive starting price</li>
      <li>Choose an appropriate auction end date</li>
      <li>You can add images after creating the listing (coming soon)</li>
    </ul>
  </div>
</div>

<style>
  .sell-page {
    max-width: 800px;
    margin: 0 auto;
    padding: 2rem 0;
  }

  h1 {
    font-size: 2.5rem;
    margin-bottom: 0.5rem;
  }

  .subtitle {
    color: #666;
    margin-bottom: 2rem;
    font-size: 1.1rem;
  }

  .success-message {
    background-color: #10b981;
    color: white;
    padding: 1rem;
    border-radius: 4px;
    margin-bottom: 2rem;
  }

  .error-message {
    background-color: #ef4444;
    color: white;
    padding: 1rem;
    border-radius: 4px;
    margin-bottom: 2rem;
  }

  form {
    background-color: white;
    padding: 2rem;
    border-radius: 8px;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    margin-bottom: 2rem;
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

  input,
  textarea {
    width: 100%;
    padding: 0.75rem;
    font-size: 1rem;
    border: 1px solid #ccc;
    border-radius: 4px;
    font-family: inherit;
  }

  input:focus,
  textarea:focus {
    outline: none;
    border-color: #0066cc;
    box-shadow: 0 0 0 3px rgba(0, 102, 204, 0.1);
  }

  input:disabled,
  textarea:disabled {
    background-color: #f5f5f5;
    cursor: not-allowed;
  }

  .form-actions {
    display: flex;
    gap: 1rem;
    margin-top: 2rem;
  }

  .btn-primary,
  .btn-secondary {
    padding: 0.75rem 2rem;
    font-size: 1.1rem;
    border-radius: 4px;
    cursor: pointer;
    text-decoration: none;
    display: inline-block;
    text-align: center;
  }

  .btn-primary {
    background-color: #0066cc;
    color: white;
    border: none;
  }

  .btn-primary:hover:not(:disabled) {
    background-color: #0052a3;
  }

  .btn-primary:disabled {
    background-color: #ccc;
    cursor: not-allowed;
  }

  .btn-secondary {
    background-color: #f0f0f0;
    color: #333;
    border: 1px solid #ccc;
  }

  .btn-secondary:hover {
    background-color: #e0e0e0;
  }

  .info-box {
    background-color: #fff3cd;
    padding: 1.5rem;
    border-radius: 8px;
    border-left: 4px solid #ffc107;
  }

  .info-box h3 {
    margin-top: 0;
    color: #856404;
  }

  .info-box ul {
    margin: 0;
    padding-left: 1.5rem;
    color: #856404;
  }

  .info-box li {
    margin-bottom: 0.5rem;
  }
</style>
