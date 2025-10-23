<script lang="ts">
  import { createProduct, uploadMedia } from '$lib/api';
  import { goto } from '$app/navigation';
  import { authStore } from '$lib/stores/auth';
  import { onMount } from 'svelte';
  import KeywordInput from '$lib/components/KeywordInput.svelte';

  let title = '';
  let description = '';
  let keywords: string[] = [];
  let startingPrice = 0;
  let auctionEndDate = '';
  let imageFiles: File[] = [];

  let submitting = false;
  let error = '';
  let success = false;

  let customDays = 0;
  let customHours = 0;
  let durationTab: 'manual' | 'quick' | 'custom' = 'quick';

  // Set default auction end date to 24 hours from now
  function getDefaultEndDate(): string {
    const date = new Date();
    date.setHours(date.getHours() + 24);
    return date.toISOString().slice(0, 16); // Format: YYYY-MM-DDTHH:mm
  }

  // Set minimum date to 1 hour from now
  function getMinimumEndDate(): string {
    const date = new Date();
    date.setHours(date.getHours() + 1);
    return date.toISOString().slice(0, 16);
  }

  let minEndDate = getMinimumEndDate();

  // Get user's currency
  $: userCurrency = $authStore.user?.currency || 'PHP';

  // Set default bid interval based on currency: 50 for PHP, 1 for others
  let bidInterval = 0;

  // Update default bid interval when currency changes
  $: if (bidInterval === 0 || !bidInterval) {
    bidInterval = userCurrency === 'PHP' ? 50 : 1;
  }

  // Check authentication on mount
  onMount(() => {
    if (!$authStore.isAuthenticated) {
      goto('/login?redirect=/sell');
    }

    // Set default auction end date
    if (!auctionEndDate) {
      auctionEndDate = getDefaultEndDate();
    }

    // Update minimum date every minute to keep it current
    const interval = setInterval(() => {
      minEndDate = getMinimumEndDate();
    }, 60000); // Update every minute

    return () => clearInterval(interval);
  });

  // Set duration in hours from now
  function setDuration(hours: number) {
    const date = new Date();
    date.setHours(date.getHours() + hours);
    auctionEndDate = date.toISOString().slice(0, 16);
  }

  // Apply custom duration automatically when values change
  // Only updates date from days/hours, no reverse sync needed
  $: if (durationTab === 'custom' && (customDays > 0 || customHours > 0)) {
    const totalHours = (customDays * 24) + customHours;

    if (totalHours >= 1) {
      const date = new Date();
      date.setHours(date.getHours() + totalHours);
      auctionEndDate = date.toISOString().slice(0, 16);

      // Clear error if it was about duration
      if (error.includes('Duration')) {
        error = '';
      }
    }
  }

  // Handle image file selection
  function handleImageSelect(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files) return;

    const newFiles = Array.from(input.files);
    const remainingSlots = 5 - imageFiles.length;

    if (newFiles.length > remainingSlots) {
      error = `You can only upload ${remainingSlots} more image(s). Maximum is 5 images.`;
      return;
    }

    // Validate file types and sizes
    for (const file of newFiles) {
      if (!file.type.startsWith('image/')) {
        error = 'Only image files are allowed';
        return;
      }
      if (file.size > 10 * 1024 * 1024) { // 10MB limit
        error = 'Each image must be less than 10MB';
        return;
      }
    }

    imageFiles = [...imageFiles, ...newFiles];
    error = '';

    // Reset input
    input.value = '';
  }

  // Remove image from selection
  function removeImage(index: number) {
    imageFiles = imageFiles.filter((_, i) => i !== index);
  }

  // Create preview URL for image
  function getImagePreview(file: File): string {
    return URL.createObjectURL(file);
  }

  // Drag and drop for reordering images
  let draggedIndex: number | null = null;

  function handleDragStart(event: DragEvent, index: number) {
    draggedIndex = index;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
    }
  }

  function handleDragOver(event: DragEvent) {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
  }

  function handleDrop(event: DragEvent, dropIndex: number) {
    event.preventDefault();

    if (draggedIndex === null || draggedIndex === dropIndex) return;

    const newImageFiles = [...imageFiles];
    const [draggedFile] = newImageFiles.splice(draggedIndex, 1);
    newImageFiles.splice(dropIndex, 0, draggedFile);

    imageFiles = newImageFiles;
    draggedIndex = null;
  }

  function handleDragEnd() {
    draggedIndex = null;
  }

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

    if (startingPrice < 100) {
      error = 'Starting price must be at least 100';
      submitting = false;
      return;
    }

    if (imageFiles.length === 0) {
      error = 'Please upload at least one product image';
      submitting = false;
      return;
    }

    try {
      // First, upload all images
      const uploadedImageIds: string[] = [];

      for (const file of imageFiles) {
        const imageId = await uploadMedia(file);
        if (imageId) {
          uploadedImageIds.push(imageId);
        }
      }

      if (uploadedImageIds.length === 0) {
        error = 'Failed to upload images. Please try again.';
        submitting = false;
        return;
      }

      // Create product with image references
      const result = await createProduct({
        title,
        description,
        keywords: keywords.map(k => ({ keyword: k })),
        startingPrice,
        bidInterval,
        auctionEndDate: new Date(auctionEndDate).toISOString(),
        images: uploadedImageIds.map(imageId => ({ image: imageId })),
      });

      if (result) {
        console.log('Product created:', result);
        success = true;
        // Redirect to product page
        setTimeout(() => {
          goto(`/products/${result.id}`);
        }, 1500);
      } else {
        error = 'Failed to create product listing. Please make sure you are logged in.';
      }
    } catch (err) {
      error = 'An error occurred while creating the product. Please try again.';
      console.error('Error:', err);
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
      <label for="keywords">Keywords (for search & SEO)</label>
      <KeywordInput bind:keywords disabled={submitting} />
    </div>

    <div class="form-group">
      <label for="images">Product Images * (1-5 images)</label>
      <div class="image-upload-container">
        {#if imageFiles.length < 5}
          <label class="image-upload-btn" class:disabled={submitting}>
            <input
              type="file"
              accept="image/*"
              multiple
              on:change={handleImageSelect}
              disabled={submitting}
              style="display: none;"
            />
            <span class="upload-icon">📷</span>
            <span>Add Images ({imageFiles.length}/5)</span>
          </label>
        {/if}

        {#if imageFiles.length > 0}
          <div class="image-preview-grid">
            {#each imageFiles as file, index}
              <div
                class="image-preview-item"
                class:dragging={draggedIndex === index}
                draggable="true"
                on:dragstart={(e) => handleDragStart(e, index)}
                on:dragover={handleDragOver}
                on:drop={(e) => handleDrop(e, index)}
                on:dragend={handleDragEnd}
                role="button"
                tabindex="0"
              >
                <img src={getImagePreview(file)} alt="Preview {index + 1}" />
                <button
                  type="button"
                  class="remove-image-btn"
                  on:click={() => removeImage(index)}
                  disabled={submitting}
                  title="Remove image"
                >
                  ✕
                </button>
                <span class="image-number">{index + 1}</span>
                <div class="drag-handle" title="Drag to reorder">⋮⋮</div>
              </div>
            {/each}
          </div>
          <p class="field-hint drag-hint">💡 Drag images to reorder them. The first image will be the main product photo.</p>
        {/if}
      </div>
      <p class="field-hint">Upload 1-5 high-quality images of your product. Each image must be less than 10MB.</p>
    </div>

    <div class="form-group">
      <label for="startingPrice">Starting Price ({userCurrency}) *</label>
      <input
        id="startingPrice"
        type="number"
        bind:value={startingPrice}
        min="100"
        step="0.01"
        placeholder="100.00"
        required
        disabled={submitting}
      />
      <p class="field-hint">Minimum starting price: 100 {userCurrency}</p>
    </div>

    <div class="form-group">
      <label for="bidInterval">Bid Increment ({userCurrency}) *</label>
      <input
        id="bidInterval"
        type="number"
        bind:value={bidInterval}
        min="1"
        step="1"
        placeholder={userCurrency === 'PHP' ? '50' : '1'}
        required
        disabled={submitting}
      />
      <p class="field-hint">Minimum amount each bid must increase by (default: {userCurrency === 'PHP' ? '50' : '1'} {userCurrency})</p>
    </div>

    <div class="form-group">
      <label for="auctionEndDate">Auction End Date *</label>

      <div class="duration-tabs">
        <button
          type="button"
          class="tab-btn"
          class:active={durationTab === 'manual'}
          on:click={() => durationTab = 'manual'}
          disabled={submitting}
        >
          Manual
        </button>
        <button
          type="button"
          class="tab-btn"
          class:active={durationTab === 'quick'}
          on:click={() => durationTab = 'quick'}
          disabled={submitting}
        >
          Quick Duration
        </button>
        <button
          type="button"
          class="tab-btn"
          class:active={durationTab === 'custom'}
          on:click={() => durationTab = 'custom'}
          disabled={submitting}
        >
          Custom Duration
        </button>
      </div>

      <div class="tab-content">
        {#if durationTab === 'manual'}
          <div class="tab-pane">
            <input
              id="auctionEndDate"
              type="datetime-local"
              bind:value={auctionEndDate}
              min={minEndDate}
              required
              disabled={submitting}
            />
            <p class="field-hint">Minimum 1 hour from now.</p>
          </div>
        {:else if durationTab === 'quick'}
          <div class="tab-pane">
            <div class="duration-buttons">
              <button type="button" class="duration-btn" on:click={() => setDuration(1)} disabled={submitting}>1 Hour</button>
              <button type="button" class="duration-btn" on:click={() => setDuration(6)} disabled={submitting}>6 Hours</button>
              <button type="button" class="duration-btn" on:click={() => setDuration(12)} disabled={submitting}>12 Hours</button>
              <button type="button" class="duration-btn" on:click={() => setDuration(24)} disabled={submitting}>24 Hours</button>
            </div>
            <p class="field-hint">Selected: {auctionEndDate ? new Date(auctionEndDate).toLocaleString() : 'None'}</p>
          </div>
        {:else if durationTab === 'custom'}
          <div class="tab-pane">
            <div class="custom-duration-inputs">
              <div class="duration-input-group">
                <input
                  type="number"
                  min="0"
                  placeholder="0"
                  class="duration-input"
                  bind:value={customDays}
                  disabled={submitting}
                />
                <span class="duration-unit">Days</span>
              </div>
              <div class="duration-input-group">
                <input
                  type="number"
                  min="0"
                  placeholder="0"
                  class="duration-input"
                  bind:value={customHours}
                  disabled={submitting}
                />
                <span class="duration-unit">Hours</span>
              </div>
            </div>
            <p class="field-hint">Selected: {auctionEndDate ? new Date(auctionEndDate).toLocaleString() : 'None'}</p>
          </div>
        {/if}
      </div>
    </div>

    {#if error}
      <div class="error-message">
        {error}
      </div>
    {/if}

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
      <li>Set a competitive starting price (minimum 100 {userCurrency})</li>
      <li>Set an appropriate bid increment for your product</li>
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

  .field-hint {
    margin: 0.5rem 0 0 0;
    font-size: 0.875rem;
    color: #666;
    font-style: italic;
  }

  /* Tab Styles */
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

  /* Image Upload Styles */
  .image-upload-container {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .image-upload-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 1rem 2rem;
    background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%);
    color: white;
    border-radius: 8px;
    font-weight: 600;
    cursor: pointer;
    transition: transform 0.2s, box-shadow 0.2s;
    border: none;
    font-size: 1rem;
  }

  .image-upload-btn:hover:not(.disabled) {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(220, 38, 38, 0.4);
  }

  .image-upload-btn.disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .upload-icon {
    font-size: 1.5rem;
  }

  .image-preview-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 1rem;
  }

  .image-preview-item {
    position: relative;
    aspect-ratio: 1;
    border-radius: 8px;
    overflow: hidden;
    border: 2px solid #e5e7eb;
    background: #f9fafb;
    cursor: grab;
    transition: all 0.3s ease;
  }

  .image-preview-item:hover {
    border-color: #dc2626;
    box-shadow: 0 4px 8px rgba(220, 38, 38, 0.2);
  }

  .image-preview-item.dragging {
    opacity: 0.5;
    cursor: grabbing;
    transform: scale(0.95);
  }

  .image-preview-item img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    pointer-events: none;
  }

  .drag-handle {
    position: absolute;
    bottom: 0.5rem;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(0, 0, 0, 0.7);
    color: white;
    padding: 0.25rem 0.75rem;
    border-radius: 12px;
    font-size: 1.25rem;
    font-weight: bold;
    letter-spacing: -2px;
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.2s;
  }

  .image-preview-item:hover .drag-handle {
    opacity: 1;
  }

  .drag-hint {
    margin-top: 0.75rem;
    font-size: 0.9rem;
    color: #059669;
    font-weight: 500;
  }

  .remove-image-btn {
    position: absolute;
    top: 0.5rem;
    right: 0.5rem;
    width: 32px;
    height: 32px;
    background: rgba(220, 38, 38, 0.9);
    color: white;
    border: none;
    border-radius: 50%;
    font-size: 1.25rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
    font-weight: bold;
    line-height: 1;
  }

  .remove-image-btn:hover:not(:disabled) {
    background: #991b1b;
    transform: scale(1.1);
  }

  .remove-image-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .image-number {
    position: absolute;
    bottom: 0.5rem;
    left: 0.5rem;
    background: rgba(0, 0, 0, 0.7);
    color: white;
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    font-size: 0.75rem;
    font-weight: 600;
  }

  @media (max-width: 768px) {
    .image-preview-grid {
      grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
    }
  }
</style>
