<script lang="ts">
  import type { PageData } from './$types';
  import { updateProduct, type Product } from '$lib/api';

  export let data: PageData;

  let showEditModal = false;
  let editingProduct: Product | null = null;
  let editForm = {
    title: '',
    description: '',
    bidInterval: 1,
    auctionEndDate: '',
    status: 'active' as 'active' | 'ended' | 'sold' | 'cancelled'
  };
  let saving = false;
  let saveError = '';
  let saveSuccess = false;

  function formatPrice(price: number, currency: string = 'PHP'): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
    }).format(price);
  }

  function formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function formatDateForInput(dateString: string): string {
    // Convert ISO string to datetime-local format (YYYY-MM-DDTHH:mm)
    const date = new Date(dateString);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  }

  function getStatusColor(status: string): string {
    switch (status) {
      case 'active':
        return '#10b981';
      case 'ended':
        return '#ef4444';
      case 'sold':
        return '#3b82f6';
      case 'cancelled':
        return '#6b7280';
      default:
        return '#6b7280';
    }
  }

  function openEditModal(product: Product) {
    editingProduct = product;
    editForm = {
      title: product.title,
      description: product.description,
      bidInterval: product.bidInterval,
      auctionEndDate: formatDateForInput(product.auctionEndDate),
      status: product.status
    };
    showEditModal = true;
    saveError = '';
    saveSuccess = false;
  }

  function closeEditModal() {
    showEditModal = false;
    editingProduct = null;
    saveError = '';
    saveSuccess = false;
  }

  async function handleSaveProduct() {
    if (!editingProduct) return;

    saving = true;
    saveError = '';
    saveSuccess = false;

    try {
      const result = await updateProduct(editingProduct.id, {
        title: editForm.title,
        description: editForm.description,
        bidInterval: editForm.bidInterval,
        auctionEndDate: new Date(editForm.auctionEndDate).toISOString(),
        status: editForm.status
      });

      if (result) {
        saveSuccess = true;
        // Update the product in the local data, preserving the seller object
        const index = data.products.findIndex(p => p.id === editingProduct!.id);
        if (index !== -1) {
          data.products[index] = {
            ...result,
            seller: editingProduct.seller // Preserve the original seller object
          };
        }
        setTimeout(() => {
          closeEditModal();
        }, 1500);
      } else {
        saveError = 'Failed to update product. Please try again.';
      }
    } catch (error) {
      console.error('Error saving product:', error);
      saveError = 'An error occurred while saving the product.';
    } finally {
      saving = false;
    }
  }
</script>

<svelte:head>
  <title>Seller Dashboard - Marketplace Platform</title>
</svelte:head>

<div class="dashboard">
  <div class="dashboard-header">
    <h1>Seller Dashboard</h1>
    <p>Welcome back, {data.user.name}!</p>
    <a href="/sell" class="btn-create">+ Create New Product</a>
  </div>

  {#if data.products.length === 0}
    <div class="empty-state">
      <h2>No Products Yet</h2>
      <p>You haven't created any products yet. Start selling by creating your first product!</p>
      <a href="/sell" class="btn-primary">Create Your First Product</a>
    </div>
  {:else}
    <div class="products-section">
      <h2>Your Products ({data.products.length})</h2>

      <div class="products-grid">
        {#each data.products as product}
          <div class="product-card">
            <div class="product-image">
              {#if product.images && product.images.length > 0}
                <img src="{product.images[0].image.url}" alt="{product.title}" />
              {:else}
                <div class="placeholder-image">
                  <span>No Image</span>
                </div>
              {/if}
            </div>

            <div class="product-info">
              <h3>{product.title}</h3>

              <div class="product-status">
                <span class="status-badge" style="background-color: {getStatusColor(product.status)}">
                  {product.status}
                </span>
              </div>

              <div class="product-pricing">
                <div class="price-row">
                  <span class="label">Starting Price:</span>
                  <span class="value">{formatPrice(product.startingPrice, product.seller.currency)}</span>
                </div>
                <div class="price-row">
                  <span class="label">Current Bid:</span>
                  <span class="value current-bid">
                    {product.currentBid ? formatPrice(product.currentBid, product.seller.currency) : 'No bids yet'}
                  </span>
                </div>
                <div class="price-row">
                  <span class="label">Bid Increment:</span>
                  <span class="value">{formatPrice(product.bidInterval, product.seller.currency)}</span>
                </div>
              </div>

              <div class="product-dates">
                <div class="date-row">
                  <span class="label">Ends:</span>
                  <span class="value">{formatDate(product.auctionEndDate)}</span>
                </div>
                <div class="date-row">
                  <span class="label">Created:</span>
                  <span class="value">{formatDate(product.createdAt)}</span>
                </div>
              </div>

              <div class="product-actions">
                <a href="/products/{product.id}" class="btn-view" target="_blank" rel="noopener noreferrer">View</a>
                <button on:click={() => openEditModal(product)} class="btn-edit">
                  Edit Product
                </button>
              </div>
            </div>
          </div>
        {/each}
      </div>
    </div>
  {/if}
</div>

<!-- Edit Product Modal -->
{#if showEditModal && editingProduct}
  <div class="modal-overlay" on:click={closeEditModal}>
    <div class="modal-content" on:click|stopPropagation>
      <button class="modal-close" on:click={closeEditModal}>&times;</button>

      <div class="modal-header">
        <h2>Edit Product</h2>
      </div>

      <div class="modal-body">
        {#if saveSuccess}
          <div class="success-message">
            Product updated successfully!
          </div>
        {/if}

        {#if saveError}
          <div class="error-message">
            {saveError}
          </div>
        {/if}

        <form on:submit|preventDefault={handleSaveProduct}>
          <div class="form-group">
            <label for="title">Product Title</label>
            <input
              id="title"
              type="text"
              bind:value={editForm.title}
              required
              disabled={saving}
            />
          </div>

          <div class="form-group">
            <label for="description">Description</label>
            <textarea
              id="description"
              bind:value={editForm.description}
              rows="4"
              required
              disabled={saving}
            ></textarea>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label for="bidInterval">Bid Increment ({editingProduct.seller.currency})</label>
              <input
                id="bidInterval"
                type="number"
                bind:value={editForm.bidInterval}
                min="1"
                step="1"
                required
                disabled={saving}
              />
            </div>

            <div class="form-group">
              <label for="status">Status</label>
              <select id="status" bind:value={editForm.status} disabled={saving}>
                <option value="active">Active</option>
                <option value="ended">Ended</option>
                <option value="sold">Sold</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
          </div>

          <div class="form-group">
            <label for="auctionEndDate">Auction End Date</label>
            <input
              id="auctionEndDate"
              type="datetime-local"
              bind:value={editForm.auctionEndDate}
              required
              disabled={saving}
            />
          </div>

          <div class="form-info">
            <p><strong>Starting Price:</strong> {formatPrice(editingProduct.startingPrice, editingProduct.seller.currency)}</p>
            {#if editingProduct.currentBid}
              <p><strong>Current Bid:</strong> {formatPrice(editingProduct.currentBid, editingProduct.seller.currency)}</p>
            {/if}
            <p class="note">Note: Starting price cannot be changed after product creation.</p>
          </div>

          <div class="modal-actions">
            <button type="button" class="btn-cancel" on:click={closeEditModal} disabled={saving}>
              Cancel
            </button>
            <button type="submit" class="btn-save" disabled={saving}>
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
{/if}

<style>
  .dashboard {
    max-width: 1400px;
    margin: 0 auto;
    padding: 2rem;
  }

  .dashboard-header {
    margin-bottom: 3rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 1rem;
  }

  .dashboard-header h1 {
    font-size: 2.5rem;
    margin: 0;
    color: #333;
  }

  .dashboard-header p {
    margin: 0.5rem 0 0 0;
    color: #666;
    font-size: 1.1rem;
  }

  .btn-create {
    padding: 0.875rem 1.5rem;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    text-decoration: none;
    border-radius: 8px;
    font-weight: 600;
    transition: transform 0.2s, box-shadow 0.2s;
  }

  .btn-create:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
  }

  .empty-state {
    text-align: center;
    padding: 4rem 2rem;
    background-color: #f9fafb;
    border-radius: 12px;
    border: 2px dashed #d1d5db;
  }

  .empty-state h2 {
    font-size: 1.75rem;
    color: #333;
    margin-bottom: 1rem;
  }

  .empty-state p {
    font-size: 1.1rem;
    color: #666;
    margin-bottom: 2rem;
  }

  .btn-primary {
    display: inline-block;
    padding: 1rem 2rem;
    background: linear-gradient(135deg, #10b981 0%, #059669 100%);
    color: white;
    text-decoration: none;
    border-radius: 8px;
    font-weight: 600;
    font-size: 1.1rem;
    transition: transform 0.2s, box-shadow 0.2s;
  }

  .btn-primary:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(16, 185, 129, 0.4);
  }

  .products-section h2 {
    font-size: 1.75rem;
    margin-bottom: 1.5rem;
    color: #333;
  }

  .products-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
    gap: 2rem;
  }

  @media (max-width: 768px) {
    .products-grid {
      grid-template-columns: 1fr;
    }
  }

  .product-card {
    background-color: white;
    border-radius: 12px;
    overflow: hidden;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    transition: transform 0.2s, box-shadow 0.2s;
  }

  .product-card:hover {
    transform: translateY(-4px);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
  }

  .product-image {
    width: 100%;
    height: 200px;
    overflow: hidden;
    background-color: #f3f4f6;
  }

  .product-image img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .placeholder-image {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    background-color: #e5e7eb;
    color: #9ca3af;
    font-size: 1rem;
  }

  .product-info {
    padding: 1.5rem;
  }

  .product-info h3 {
    font-size: 1.5rem;
    margin: 0 0 1rem 0;
    color: #333;
  }

  .product-status {
    margin-bottom: 1rem;
  }

  .status-badge {
    display: inline-block;
    padding: 0.375rem 0.75rem;
    border-radius: 6px;
    color: white;
    font-weight: 600;
    font-size: 0.875rem;
    text-transform: uppercase;
  }

  .product-pricing,
  .product-dates {
    margin-bottom: 1.25rem;
  }

  .price-row,
  .date-row {
    display: flex;
    justify-content: space-between;
    padding: 0.5rem 0;
    border-bottom: 1px solid #f3f4f6;
  }

  .price-row:last-child,
  .date-row:last-child {
    border-bottom: none;
  }

  .label {
    font-weight: 500;
    color: #666;
  }

  .value {
    font-weight: 600;
    color: #333;
  }

  .current-bid {
    color: #667eea;
  }

  .product-actions {
    display: flex;
    gap: 0.75rem;
    margin-top: 1.5rem;
  }

  .btn-view,
  .btn-edit {
    flex: 1;
    padding: 0.75rem 1rem;
    text-align: center;
    text-decoration: none;
    border-radius: 6px;
    font-weight: 600;
    transition: transform 0.2s, box-shadow 0.2s;
  }

  .btn-view {
    background-color: #3b82f6;
    color: white;
  }

  .btn-view:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
  }

  .btn-edit {
    background-color: #f59e0b;
    color: white;
    border: none;
    cursor: pointer;
  }

  .btn-edit:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(245, 158, 11, 0.4);
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
    max-width: 600px;
    width: 90%;
    max-height: 90vh;
    overflow-y: auto;
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
    border-bottom: 1px solid #e5e7eb;
  }

  .modal-header h2 {
    margin: 0;
    font-size: 1.75rem;
    color: #333;
  }

  .modal-body {
    padding: 2rem;
  }

  .form-group {
    margin-bottom: 1.5rem;
  }

  .form-group label {
    display: block;
    margin-bottom: 0.5rem;
    font-weight: 600;
    color: #333;
  }

  .form-group input,
  .form-group textarea,
  .form-group select {
    width: 100%;
    padding: 0.75rem;
    border: 2px solid #e5e7eb;
    border-radius: 6px;
    font-size: 1rem;
    transition: border-color 0.2s;
    box-sizing: border-box;
  }

  .form-group input:focus,
  .form-group textarea:focus,
  .form-group select:focus {
    outline: none;
    border-color: #667eea;
  }

  .form-group input:disabled,
  .form-group textarea:disabled,
  .form-group select:disabled {
    background-color: #f3f4f6;
    cursor: not-allowed;
  }

  .form-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
  }

  .form-info {
    background-color: #f9fafb;
    padding: 1rem;
    border-radius: 6px;
    margin-bottom: 1.5rem;
  }

  .form-info p {
    margin: 0.5rem 0;
    color: #333;
  }

  .form-info .note {
    color: #666;
    font-size: 0.875rem;
    margin-top: 0.75rem;
    font-style: italic;
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
    font-weight: 500;
  }

  .modal-actions {
    display: flex;
    gap: 1rem;
    margin-top: 2rem;
  }

  .btn-cancel,
  .btn-save {
    flex: 1;
    padding: 0.875rem 1.5rem;
    border-radius: 6px;
    font-weight: 600;
    font-size: 1rem;
    cursor: pointer;
    transition: all 0.2s;
    border: none;
  }

  .btn-cancel {
    background-color: #e5e7eb;
    color: #333;
  }

  .btn-cancel:hover:not(:disabled) {
    background-color: #d1d5db;
  }

  .btn-save {
    background: linear-gradient(135deg, #10b981 0%, #059669 100%);
    color: white;
  }

  .btn-save:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(16, 185, 129, 0.4);
  }

  .btn-cancel:disabled,
  .btn-save:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    transform: none;
  }
</style>
