<script lang="ts">
  import type { PageData } from './$types';
  import { updateProduct, type Product } from '$lib/api';
  import ImageSlider from '$lib/components/ImageSlider.svelte';
  import KeywordInput from '$lib/components/KeywordInput.svelte';

  export let data: PageData;

  // Separate products by status and visibility
  $: activeProducts = data.products.filter(p => p.status === 'available' && p.active);
  $: hiddenProducts = data.products.filter(p => !p.active);
  $: soldEndedProducts = data.products.filter(p => p.status === 'sold' || p.status === 'ended');

  // Tab state
  let activeTab: 'active' | 'hidden' | 'sold' = 'active';

  let showEditModal = false;
  let showViewModal = false;
  let editingProduct: Product | null = null;
  let viewingProduct: Product | null = null;
  let editForm = {
    title: '',
    description: '',
    keywords: [] as string[],
    startingPrice: 0,
    bidInterval: 1,
    auctionEndDate: '',
    active: true
  };
  let saving = false;
  let saveError = '';
  let saveSuccess = false;
  let hasBids = false;

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
    if (!dateString) return '';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  }

  function getStatusColor(status: string): string {
    switch (status) {
      case 'available':
        return '#10b981';
      case 'ended':
        return '#ef4444';
      case 'sold':
        return '#3b82f6';
      default:
        return '#6b7280';
    }
  }

  function openEditModal(product: Product | null) {
    if (!product) return;

    editingProduct = product;
    hasBids = !!(product.currentBid && product.currentBid > 0);
    editForm = {
      title: product.title,
      description: product.description,
      keywords: product.keywords?.map(k => k.keyword) || [],
      startingPrice: product.startingPrice,
      bidInterval: product.bidInterval,
      auctionEndDate: formatDateForInput(product.auctionEndDate),
      active: product.active
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

  function openViewModal(product: Product) {
    viewingProduct = product;
    showViewModal = true;
  }

  function closeViewModal() {
    showViewModal = false;
    viewingProduct = null;
  }

  async function handleSaveProduct() {
    if (!editingProduct) return;

    saving = true;
    saveError = '';
    saveSuccess = false;

    try {
      const updateData: any = {
        title: editForm.title,
        description: editForm.description,
        keywords: editForm.keywords.map(k => ({ keyword: k })),
        bidInterval: editForm.bidInterval,
        auctionEndDate: new Date(editForm.auctionEndDate).toISOString(),
        active: editForm.active
      };

      // Only include startingPrice if there are no bids
      if (!hasBids) {
        updateData.startingPrice = editForm.startingPrice;
      }

      const result = await updateProduct(editingProduct.id, updateData);

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
  <title>Seller Dashboard - BidMo.to</title>
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
    <!-- Tabs -->
    <div class="tabs">
      <button
        class="tab"
        class:active={activeTab === 'active'}
        on:click={() => activeTab = 'active'}
      >
        Active Listings ({activeProducts.length})
      </button>
      <button
        class="tab"
        class:active={activeTab === 'hidden'}
        on:click={() => activeTab = 'hidden'}
      >
        Hidden ({hiddenProducts.length})
      </button>
      <button
        class="tab"
        class:active={activeTab === 'sold'}
        on:click={() => activeTab = 'sold'}
      >
        Sold & Ended ({soldEndedProducts.length})
      </button>
    </div>

    <!-- Active Products Tab -->
    {#if activeTab === 'active'}
      {#if activeProducts.length > 0}
        <div class="products-list">
          {#each activeProducts as product}
            <div class="product-item">
              <div class="product-item-image">
                {#if product.images && product.images.length > 0}
                  <img src="{product.images[0].image.url}" alt="{product.title}" />
                {:else}
                  <div class="placeholder-image-small">📦</div>
                {/if}
              </div>

              <div class="product-item-info">
                <h3>{product.title}</h3>
                <div class="product-meta">
                  <span class="status-badge-small" style="background-color: {getStatusColor(product.status)}">
                    {product.status}
                  </span>
                  {#if product.currentBid && product.currentBid > product.startingPrice}
                    <span class="growth-badge">
                      ↑ {Math.round(((product.currentBid - product.startingPrice) / product.startingPrice) * 100)}%
                    </span>
                  {/if}
                  <span class="product-date">Ends: {formatDate(product.auctionEndDate)}</span>
                </div>
              </div>

              <div class="product-item-price">
                <div class="price-label">Current Bid</div>
                <div class="price-value">
                  {product.currentBid ? formatPrice(product.currentBid, product.seller.currency) : formatPrice(product.startingPrice, product.seller.currency)}
                </div>
                {#if product.currentBid}
                  <div class="price-sublabel">
                    from {formatPrice(product.startingPrice, product.seller.currency)}
                    <span class="price-growth">
                      (+{Math.round(((product.currentBid - product.startingPrice) / product.startingPrice) * 100)}%)
                    </span>
                  </div>
                {:else}
                  <div class="price-sublabel">Starting price</div>
                {/if}
              </div>

              <div class="product-item-actions">
                <button on:click={() => openViewModal(product)} class="btn-view-small">
                  View
                </button>
                <button on:click={() => openEditModal(product)} class="btn-edit-small">
                  Edit
                </button>
              </div>
            </div>
          {/each}
        </div>
      {:else}
        <div class="empty-state">
          <p>No active listings yet. Create your first product to get started!</p>
        </div>
      {/if}
    {/if}

    <!-- Hidden Products Tab -->
    {#if activeTab === 'hidden'}
      {#if hiddenProducts.length > 0}
        <div class="products-list">
          {#each hiddenProducts as product}
            <div class="product-item">
              <div class="product-item-image">
                {#if product.images && product.images.length > 0}
                  <img src="{product.images[0].image.url}" alt="{product.title}" />
                {:else}
                  <div class="placeholder-image-small">📦</div>
                {/if}
              </div>

              <div class="product-item-info">
                <h3>{product.title}</h3>
                <div class="product-meta">
                  <span class="status-badge-small" style="background-color: {getStatusColor(product.status)}">
                    {product.status}
                  </span>
                  <span class="inactive-badge">Hidden</span>
                  {#if product.currentBid && product.currentBid > product.startingPrice}
                    <span class="growth-badge">
                      ↑ {Math.round(((product.currentBid - product.startingPrice) / product.startingPrice) * 100)}%
                    </span>
                  {/if}
                  <span class="product-date">
                    {product.status === 'available' ? 'Ends' : 'Ended'}: {formatDate(product.auctionEndDate)}
                  </span>
                </div>
              </div>

              <div class="product-item-price">
                <div class="price-label">{product.status === 'available' ? 'Current Bid' : 'Final Price'}</div>
                <div class="price-value">
                  {product.currentBid ? formatPrice(product.currentBid, product.seller.currency) : formatPrice(product.startingPrice, product.seller.currency)}
                </div>
                {#if product.currentBid}
                  <div class="price-sublabel">
                    from {formatPrice(product.startingPrice, product.seller.currency)}
                    <span class="price-growth">
                      (+{Math.round(((product.currentBid - product.startingPrice) / product.startingPrice) * 100)}%)
                    </span>
                  </div>
                {:else if product.status === 'available'}
                  <div class="price-sublabel">Starting price</div>
                {/if}
              </div>

              <div class="product-item-actions">
                <button on:click={() => openViewModal(product)} class="btn-view-small">
                  View
                </button>
                <button on:click={() => openEditModal(product)} class="btn-edit-small">
                  Edit
                </button>
              </div>
            </div>
          {/each}
        </div>
      {:else}
        <div class="empty-state">
          <p>No hidden products. Products marked as inactive will appear here.</p>
        </div>
      {/if}
    {/if}

    <!-- Sold & Ended Products Tab -->
    {#if activeTab === 'sold'}
      {#if soldEndedProducts.length > 0}
        <div class="products-list">
          {#each soldEndedProducts as product}
            <div class="product-item">
              <div class="product-item-image">
                {#if product.images && product.images.length > 0}
                  <img src="{product.images[0].image.url}" alt="{product.title}" />
                {:else}
                  <div class="placeholder-image-small">📦</div>
                {/if}
              </div>

              <div class="product-item-info">
                <h3>{product.title}</h3>
                <div class="product-meta">
                  <span class="status-badge-small" style="background-color: {getStatusColor(product.status)}">
                    {product.status}
                  </span>
                  {#if product.currentBid && product.currentBid > product.startingPrice}
                    <span class="growth-badge">
                      ↑ {Math.round(((product.currentBid - product.startingPrice) / product.startingPrice) * 100)}%
                    </span>
                  {/if}
                  <span class="product-date">Ended: {formatDate(product.auctionEndDate)}</span>
                </div>
              </div>

              <div class="product-item-price">
                <div class="price-label">Final Price</div>
                <div class="price-value">
                  {product.currentBid ? formatPrice(product.currentBid, product.seller.currency) : formatPrice(product.startingPrice, product.seller.currency)}
                </div>
                {#if product.currentBid}
                  <div class="price-sublabel">
                    from {formatPrice(product.startingPrice, product.seller.currency)}
                    <span class="price-growth">
                      (+{Math.round(((product.currentBid - product.startingPrice) / product.startingPrice) * 100)}%)
                    </span>
                  </div>
                {/if}
              </div>

              <div class="product-item-actions">
                <button on:click={() => openViewModal(product)} class="btn-view-small">
                  View
                </button>
                {#if product.currentBid}
                  <a href="/inbox?product={product.id}" class="btn-message">
                    💬 Message
                  </a>
                {/if}
                {#if product.status !== 'sold'}
                  <button on:click={() => openEditModal(product)} class="btn-edit-small">
                    Edit
                  </button>
                {/if}
              </div>
            </div>
          {/each}
        </div>
      {:else}
        <div class="empty-state">
          <p>No sold or ended listings yet.</p>
        </div>
      {/if}
    {/if}
  {/if}
</div>

<!-- Loading Overlay -->
{#if saving}
  <div class="loading-overlay">
    <div class="loading-spinner">
      <div class="spinner"></div>
      <p>Saving changes...</p>
    </div>
  </div>
{/if}

<!-- Edit Product Modal -->
{#if showEditModal && editingProduct}
  <div class="modal-overlay" on:keydown={(e) => e.key === 'Escape' && closeEditModal()} role="button" tabindex="-1">
    <div class="modal-content" on:keydown|stopPropagation role="dialog" tabindex="-1">
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

          <div class="form-group">
            <label for="keywords">Keywords (for search & SEO)</label>
            <KeywordInput bind:keywords={editForm.keywords} disabled={saving} />
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
              <label class="checkbox-label">
                <input
                  type="checkbox"
                  bind:checked={editForm.active}
                  disabled={saving}
                />
                <span>Active (visible on Browse Products page)</span>
              </label>
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

          {#if hasBids}
            <div class="form-info">
              <p><strong>Starting Price:</strong> {formatPrice(editingProduct.startingPrice, editingProduct.seller.currency)}</p>
              <p><strong>Current Bid:</strong> {formatPrice(editingProduct.currentBid, editingProduct.seller.currency)}</p>
              <p class="note">Note: Starting price cannot be changed after bids have been placed.</p>
            </div>
          {:else}
            <div class="form-group">
              <label for="startingPrice">Starting Price ({editingProduct.seller.currency})</label>
              <input
                id="startingPrice"
                type="number"
                bind:value={editForm.startingPrice}
                min="500"
                step="1"
                required
                disabled={saving}
              />
              <p class="field-hint">Minimum starting price: 500. Can only be edited before any bids are placed.</p>
            </div>
          {/if}

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

<!-- Product View Modal -->
{#if showViewModal && viewingProduct}
  <div class="modal-overlay" on:click={closeViewModal} on:keydown={(e) => e.key === 'Escape' && closeViewModal()} role="button" tabindex="-1">
    <div class="modal-content" on:click|stopPropagation on:keydown|stopPropagation role="dialog" tabindex="-1">
      <button class="modal-close" on:click={closeViewModal}>&times;</button>

      <div class="modal-body">
        <!-- Image Slider -->
        {#if viewingProduct.images && viewingProduct.images.length > 0}
          {@const validImages = viewingProduct.images.filter(img => img && img.image && img.image.url)}
          {#if validImages.length > 0}
            <div class="modal-image-section">
              <ImageSlider images={validImages} productTitle={viewingProduct.title} />
            </div>
          {:else}
            <div class="modal-placeholder-image">
              <span class="placeholder-icon">📦</span>
            </div>
          {/if}
        {:else}
          <div class="modal-placeholder-image">
            <span class="placeholder-icon">📦</span>
          </div>
        {/if}

        <!-- Product Info -->
        <div class="modal-info-section">
          <div class="modal-header-view">
            <h2>{viewingProduct.title}</h2>
            <span class="status-badge-view" style="background-color: {getStatusColor(viewingProduct.status)}">
              {viewingProduct.status}
            </span>
          </div>

          <div class="product-detail-grid">
            <div class="detail-item">
              <span class="detail-label">Status</span>
              <span class="detail-value">
                {viewingProduct.active ? 'Visible' : 'Hidden'}
              </span>
            </div>

            <div class="detail-item">
              <span class="detail-label">Starting Bid</span>
              <span class="detail-value">{formatPrice(viewingProduct.startingPrice, viewingProduct.seller.currency)}</span>
            </div>

            <div class="detail-item">
              <span class="detail-label">{viewingProduct.status === 'available' ? 'Current Bid' : 'Final Price'}</span>
              <span class="detail-value price-highlight">
                {formatPrice(viewingProduct.currentBid || viewingProduct.startingPrice, viewingProduct.seller.currency)}
              </span>
            </div>

            <div class="detail-item">
              <span class="detail-label">Auction {viewingProduct.status === 'available' ? 'Ends' : 'Ended'}</span>
              <span class="detail-value">{formatDate(viewingProduct.auctionEndDate)}</span>
            </div>

            <div class="detail-item">
              <span class="detail-label">Bid Increment</span>
              <span class="detail-value">{formatPrice(viewingProduct.bidInterval, viewingProduct.seller.currency)}</span>
            </div>
          </div>

          {#if viewingProduct.description}
            <div class="description-section">
              <h3>Description</h3>
              <p>{viewingProduct.description}</p>
            </div>
          {/if}

          {#if viewingProduct.keywords && viewingProduct.keywords.length > 0}
            <div class="keywords-section">
              <h3>Tags</h3>
              <div class="keywords-list">
                {#each viewingProduct.keywords as keyword}
                  <span class="keyword-tag">
                    {typeof keyword === 'string'
                      ? keyword
                      : (keyword?.keyword || keyword?.value || keyword?.label || keyword?.name || JSON.stringify(keyword))}
                  </span>
                {/each}
              </div>
            </div>
          {/if}

          <div class="modal-actions">
            <a href="/products/{viewingProduct.id}" class="btn-open-page" target="_blank" rel="noopener noreferrer">
              🔗 Open Product Page
            </a>
            <button on:click={() => {
              const product = viewingProduct;
              closeViewModal();
              openEditModal(product);
            }} class="btn-edit-modal">
              ✏️ Edit Product
            </button>
            <button on:click={closeViewModal} class="btn-close-modal">
              Close
            </button>
          </div>
        </div>
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
    background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%);
    color: white;
    text-decoration: none;
    border-radius: 8px;
    font-weight: 600;
    transition: transform 0.2s, box-shadow 0.2s;
  }

  .btn-create:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(220, 38, 38, 0.4);
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

  /* Tabs */
  .tabs {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 2rem;
    border-bottom: 2px solid #e5e7eb;
  }

  .tab {
    padding: 0.875rem 1.5rem;
    background: none;
    border: none;
    border-bottom: 3px solid transparent;
    color: #6b7280;
    font-weight: 600;
    font-size: 1rem;
    cursor: pointer;
    transition: all 0.2s;
    margin-bottom: -2px;
  }

  .tab:hover {
    color: #333;
    background-color: #f9fafb;
  }

  .tab.active {
    color: #dc2626;
    border-bottom-color: #dc2626;
  }

  /* Products List */
  .products-list {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .product-item {
    background-color: white;
    border-radius: 8px;
    padding: 1.25rem;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    display: flex;
    gap: 1.25rem;
    align-items: center;
    transition: box-shadow 0.2s;
  }

  .product-item:hover {
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  }

  .product-item-image {
    width: 80px;
    height: 80px;
    flex-shrink: 0;
    border-radius: 6px;
    overflow: hidden;
    background-color: #f3f4f6;
  }

  .product-item-image img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .placeholder-image-small {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 2rem;
    background-color: #e5e7eb;
    color: #9ca3af;
  }

  .product-item-info {
    flex: 1;
    min-width: 0;
  }

  .product-item-info h3 {
    font-size: 1.125rem;
    margin: 0 0 0.5rem 0;
    color: #333;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .product-meta {
    display: flex;
    gap: 1rem;
    align-items: center;
    flex-wrap: wrap;
  }

  .status-badge-small {
    display: inline-block;
    padding: 0.25rem 0.625rem;
    border-radius: 4px;
    color: white;
    font-weight: 600;
    font-size: 0.75rem;
    text-transform: uppercase;
  }

  .inactive-badge {
    display: inline-block;
    padding: 0.25rem 0.625rem;
    border-radius: 4px;
    background-color: #6b7280;
    color: white;
    font-weight: 600;
    font-size: 0.75rem;
    text-transform: uppercase;
  }

  .growth-badge {
    display: inline-block;
    padding: 0.25rem 0.625rem;
    border-radius: 4px;
    background: linear-gradient(135deg, #10b981 0%, #059669 100%);
    color: white;
    font-weight: 700;
    font-size: 0.75rem;
    box-shadow: 0 2px 4px rgba(16, 185, 129, 0.3);
    animation: pulse 2s ease-in-out infinite;
  }

  @keyframes pulse {
    0%, 100% {
      transform: scale(1);
    }
    50% {
      transform: scale(1.05);
    }
  }

  .product-date {
    font-size: 0.875rem;
    color: #666;
  }

  .product-item-price {
    text-align: right;
    padding: 0 1rem;
  }

  .price-label {
    font-size: 0.75rem;
    color: #666;
    margin-bottom: 0.25rem;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .price-value {
    font-size: 1.25rem;
    font-weight: 700;
    color: #10b981;
  }

  .price-sublabel {
    font-size: 0.75rem;
    color: #999;
    margin-top: 0.25rem;
  }

  .price-growth {
    color: #10b981;
    font-weight: 700;
    margin-left: 0.25rem;
  }

  .product-item-actions {
    display: flex;
    gap: 0.5rem;
    flex-shrink: 0;
  }

  /* Loading Overlay */
  .loading-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: rgba(0, 0, 0, 0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 2000;
    animation: fadeIn 0.2s ease-out;
  }

  .loading-spinner {
    text-align: center;
  }

  .spinner {
    width: 60px;
    height: 60px;
    margin: 0 auto 1rem auto;
    border: 4px solid rgba(255, 255, 255, 0.3);
    border-top-color: white;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .loading-spinner p {
    color: white;
    font-size: 1.125rem;
    font-weight: 600;
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

  .btn-view-small,
  .btn-message,
  .btn-edit-small {
    padding: 0.5rem 1rem;
    border-radius: 6px;
    font-weight: 600;
    font-size: 0.875rem;
    text-decoration: none;
    text-align: center;
    transition: transform 0.2s, box-shadow 0.2s;
    white-space: nowrap;
  }

  .btn-view-small {
    background-color: #3b82f6;
    color: white;
    border: none;
    cursor: pointer;
  }

  .btn-view-small:hover {
    transform: translateY(-2px);
    box-shadow: 0 2px 8px rgba(59, 130, 246, 0.4);
  }

  .btn-message {
    background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%);
    color: white;
  }

  .btn-message:hover {
    transform: translateY(-2px);
    box-shadow: 0 2px 8px rgba(220, 38, 38, 0.4);
  }

  .btn-edit-small {
    background-color: #f59e0b;
    color: white;
    border: none;
    cursor: pointer;
  }

  .btn-edit-small:hover {
    transform: translateY(-2px);
    box-shadow: 0 2px 8px rgba(245, 158, 11, 0.4);
  }

  .field-hint {
    margin-top: 0.5rem;
    font-size: 0.875rem;
    color: #666;
  }

  .checkbox-label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    cursor: pointer;
  }

  .checkbox-label input[type="checkbox"] {
    width: auto;
    cursor: pointer;
  }

  .checkbox-label span {
    font-weight: normal;
  }

  /* View Modal Styles */
  .modal-image-section {
    width: 100%;
    background-color: #f9fafb;
  }

  .modal-placeholder-image {
    width: 100%;
    height: 400px;
    display: flex;
    align-items: center;
    justify-content: center;
    background-color: #f3f4f6;
  }

  .placeholder-icon {
    font-size: 4rem;
  }

  .modal-info-section {
    padding: 2rem;
  }

  .modal-header-view {
    display: flex;
    justify-content: space-between;
    align-items: start;
    gap: 1rem;
    margin-bottom: 1.5rem;
    padding-bottom: 1rem;
    border-bottom: 2px solid #e5e7eb;
  }

  .modal-header-view h2 {
    font-size: 1.75rem;
    color: #333;
    margin: 0;
    flex: 1;
  }

  .status-badge-view {
    display: inline-block;
    padding: 0.5rem 1rem;
    border-radius: 6px;
    color: white;
    font-weight: 600;
    font-size: 0.875rem;
    text-transform: uppercase;
    white-space: nowrap;
  }

  .product-detail-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 1.5rem;
    margin-bottom: 2rem;
  }

  .detail-item {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .detail-label {
    font-size: 0.875rem;
    color: #666;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    font-weight: 600;
  }

  .detail-value {
    font-size: 1.125rem;
    color: #333;
    font-weight: 500;
  }

  .price-highlight {
    color: #10b981;
    font-weight: 700;
    font-size: 1.5rem;
  }

  .description-section {
    margin-bottom: 2rem;
  }

  .description-section h3 {
    font-size: 1.25rem;
    color: #333;
    margin-bottom: 0.75rem;
  }

  .description-section p {
    color: #666;
    line-height: 1.6;
    white-space: pre-wrap;
  }

  .keywords-section {
    margin-bottom: 2rem;
  }

  .keywords-section h3 {
    font-size: 1.25rem;
    color: #333;
    margin-bottom: 0.75rem;
  }

  .keywords-list {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .keyword-tag {
    display: inline-block;
    padding: 0.5rem 1rem;
    background-color: #f3f4f6;
    color: #666;
    border-radius: 6px;
    font-size: 0.875rem;
    font-weight: 500;
  }

  .btn-open-page {
    flex: 1;
    padding: 1rem 1.5rem;
    background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
    color: white;
    text-decoration: none;
    border-radius: 8px;
    font-weight: 600;
    text-align: center;
    transition: transform 0.2s, box-shadow 0.2s;
  }

  .btn-open-page:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
  }

  .btn-edit-modal {
    flex: 1;
    padding: 1rem 1.5rem;
    background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
    color: white;
    border: none;
    border-radius: 8px;
    font-weight: 600;
    cursor: pointer;
    transition: transform 0.2s, box-shadow 0.2s;
  }

  .btn-edit-modal:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(245, 158, 11, 0.4);
  }

  @media (max-width: 1024px) {
    .product-item {
      flex-wrap: wrap;
    }

    .product-item-price {
      order: 3;
      padding: 0;
      text-align: left;
    }

    .product-item-actions {
      order: 4;
      width: 100%;
    }
  }

  @media (max-width: 640px) {
    .dashboard {
      padding: 1rem;
    }

    .dashboard-header {
      flex-direction: column;
      align-items: flex-start;
    }

    .tabs {
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
    }

    .product-item-actions {
      flex-direction: column;
    }

    .btn-view-small,
    .btn-message,
    .btn-edit-small {
      width: 100%;
    }

    .form-row {
      grid-template-columns: 1fr;
    }

    .modal-content {
      margin: 0;
      max-height: 100vh;
      border-radius: 0;
    }

    .modal-info-section {
      padding: 1.5rem;
    }

    .modal-header-view {
      flex-direction: column;
      align-items: flex-start;
    }

    .product-detail-grid {
      grid-template-columns: 1fr;
    }

    .modal-actions {
      flex-direction: column;
    }

    .modal-placeholder-image {
      height: 250px;
    }
  }
</style>
