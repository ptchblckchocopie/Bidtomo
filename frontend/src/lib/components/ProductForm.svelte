<script lang="ts">
  import { onMount } from 'svelte';
  import { createProduct, updateProduct, uploadMedia, deleteMedia } from '$lib/api';
  import { authStore } from '$lib/stores/auth';
  import KeywordInput from './KeywordInput.svelte';
  import type { Product } from '$lib/api';
  import { regions, getCitiesByRegion } from '$lib/data/philippineLocations';

  // Props
  export let mode: 'create' | 'edit' = 'create';
  export let product: Product | null = null;
  export let onSuccess: ((product: Product) => void) | null = null;
  export let onCancel: (() => void) | null = null;

  // Form fields
  let title = product?.title || '';
  let description = product?.description || '';
  let keywords: string[] = product?.keywords?.map(k => k.keyword) || [];
  let startingPrice = product?.startingPrice || 0;
  let bidInterval = 0;
  let auctionEndDate = '';
  let active = product?.active ?? true;
  let region = product?.region || '';
  let city = product?.city || '';
  let deliveryOptions: 'delivery' | 'meetup' | 'both' | '' = product?.delivery_options || '';

  // Image handling
  let existingImages: Array<{ id: string; image: { id: string; url: string; alt?: string } }> = [];
  let imageFiles: File[] = [];
  let imagesToDelete: string[] = [];

  // State
  let submitting = false;
  let error = '';
  let success = false;
  let hasBids = false;
  let loadingMessage = '';
  let showToast = false;
  let toastMessage = '';
  let toastType: 'success' | 'error' = 'success';

  // Duration controls
  let customDays = 0;
  let customHours = 0;
  let isUpdatingFromDuration = false;
  let isUpdatingFromDate = false;

  // User currency
  $: userCurrency = $authStore.user?.currency || 'PHP';

  // Get cities for selected region
  $: availableCities = region ? getCitiesByRegion(region) : [];

  // Reset city when region changes
  $: if (region && !availableCities.includes(city)) {
    city = '';
  }

  // Initialize form on mount
  onMount(() => {
    // Set default bid interval based on currency if not already set
    if (bidInterval === 0 || !bidInterval) {
      bidInterval = product?.bidInterval || (userCurrency === 'PHP' ? 50 : 1);
    }

    if (mode === 'edit' && product) {
      title = product.title;
      description = product.description;
      keywords = product.keywords?.map(k => k.keyword) || [];
      startingPrice = product.startingPrice;
      bidInterval = product.bidInterval;
      region = product.region || '';
      city = product.city || '';
      deliveryOptions = product.delivery_options || '';

      // Format and set the auction end date
      const formattedDate = formatDateForInput(product.auctionEndDate);
      auctionEndDate = formattedDate;
      prevAuctionEndDate = formattedDate; // Initialize to prevent reactive updates on mount

      active = product.active;
      hasBids = !!(product.currentBid && product.currentBid > 0);

      // Load existing images
      existingImages = product.images?.map((img, index) => ({
        id: `existing-${index}`,
        image: typeof img.image === 'object' ? img.image : { id: img.image, url: '', alt: '' }
      })) || [];

      imageFiles = [];
      imagesToDelete = [];

      // Calculate initial duration from the date
      const endDate = new Date(product.auctionEndDate);
      const now = new Date();
      if (!isNaN(endDate.getTime())) {
        const diffMs = endDate.getTime() - now.getTime();
        const diffHours = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60)));
        customDays = Math.floor(diffHours / 24);
        customHours = diffHours % 24;
        prevCustomDays = customDays;
        prevCustomHours = customHours;
      }
    } else if (mode === 'create' && !auctionEndDate) {
      auctionEndDate = getDefaultEndDate();
      prevAuctionEndDate = auctionEndDate;
      // Calculate initial duration for the default date (24 hours = 1 day)
      customDays = 1;
      customHours = 0;
      prevCustomDays = 1;
      prevCustomHours = 0;
    }
  });

  // Date formatting helpers that handle local timezone properly
  function formatDateToLocalInput(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  }

  function getDefaultEndDate(): string {
    const date = new Date();
    date.setHours(date.getHours() + 24);
    return formatDateToLocalInput(date);
  }

  function getMinimumEndDate(): string {
    const now = new Date();

    // Check if we're editing an existing product
    if (mode === 'edit' && product?.createdAt) {
      const createdAt = new Date(product.createdAt);
      const hoursSinceCreation = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60);

      // If product was created more than 1 hour ago, minimum is 1 minute from now
      if (hoursSinceCreation > 1) {
        const minDate = new Date(now);
        minDate.setMinutes(minDate.getMinutes() + 1);
        return formatDateToLocalInput(minDate);
      }
    }

    // Default: minimum is 1 hour from now
    const minDate = new Date(now);
    minDate.setHours(minDate.getHours() + 1);
    return formatDateToLocalInput(minDate);
  }

  function formatDateForInput(dateString: string): string {
    if (!dateString) return '';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '';
    return formatDateToLocalInput(date);
  }

  // Make minEndDate reactive to mode and product changes
  $: minEndDate = getMinimumEndDate();

  // Store previous values to detect actual changes
  let prevAuctionEndDate = '';
  let prevCustomDays = 0;
  let prevCustomHours = 0;

  // Function to update auction date from custom duration
  function updateDateFromDuration() {
    if (isUpdatingFromDate) return;

    const totalHours = (customDays * 24) + customHours;
    if (totalHours >= 1) {
      isUpdatingFromDuration = true;
      const date = new Date();
      date.setHours(date.getHours() + totalHours);
      const newDate = formatDateToLocalInput(date);

      if (newDate !== auctionEndDate) {
        auctionEndDate = newDate;
        prevAuctionEndDate = newDate;
      }

      if (error.includes('Duration')) {
        error = '';
      }
      // Use setTimeout to reset flag after the reactive cycle
      setTimeout(() => {
        isUpdatingFromDuration = false;
      }, 0);
    }
  }

  // Function to update custom duration from auction date
  function updateDurationFromDate() {
    if (isUpdatingFromDuration || !auctionEndDate) return;

    isUpdatingFromDate = true;
    const endDate = new Date(auctionEndDate);
    const now = new Date();

    if (!isNaN(endDate.getTime())) {
      const diffMs = endDate.getTime() - now.getTime();
      const diffHours = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60)));

      const newDays = Math.floor(diffHours / 24);
      const newHours = diffHours % 24;

      if (newDays !== customDays || newHours !== customHours) {
        customDays = newDays;
        customHours = newHours;
        prevCustomDays = newDays;
        prevCustomHours = newHours;
      }
    }

    // Use setTimeout to reset flag after the reactive cycle
    setTimeout(() => {
      isUpdatingFromDate = false;
    }, 0);
  }

  // Apply custom duration automatically when values change
  $: if ((customDays !== prevCustomDays || customHours !== prevCustomHours) && !isUpdatingFromDate) {
    prevCustomDays = customDays;
    prevCustomHours = customHours;
    updateDateFromDuration();
  }

  // Update custom duration when auction date changes
  $: if (auctionEndDate && auctionEndDate !== prevAuctionEndDate && !isUpdatingFromDuration) {
    prevAuctionEndDate = auctionEndDate;
    updateDurationFromDate();
  }

  // Image handling for create mode
  function handleImageSelect(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files) return;

    const newFiles = Array.from(input.files);
    const totalImages = mode === 'edit'
      ? existingImages.length + imageFiles.length + newFiles.length
      : imageFiles.length + newFiles.length;

    const remainingSlots = 5 - (mode === 'edit' ? existingImages.length + imageFiles.length : imageFiles.length);

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
      if (file.size > 10 * 1024 * 1024) {
        error = 'Each image must be less than 10MB';
        return;
      }
    }

    imageFiles = [...imageFiles, ...newFiles];
    error = '';
    input.value = '';
  }

  // Remove image from selection
  function removeImage(index: number) {
    imageFiles = imageFiles.filter((_, i) => i !== index);
  }

  // Remove existing image (edit mode)
  function removeExistingImage(imageId: string) {
    const img = existingImages.find(i => i.image.id === imageId);
    if (img) {
      imagesToDelete = [...imagesToDelete, img.image.id];
      existingImages = existingImages.filter(i => i.image.id !== imageId);
    }
  }

  // Create preview URL for image
  function getImagePreview(file: File): string {
    return URL.createObjectURL(file);
  }

  // Drag and drop for reordering images
  let draggedIndex: number | null = null;
  let draggingExisting = false;

  function handleDragStart(event: DragEvent, index: number, isExisting: boolean = false) {
    draggedIndex = index;
    draggingExisting = isExisting;
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

  function handleDrop(event: DragEvent, dropIndex: number, isExistingDrop: boolean = false) {
    event.preventDefault();

    if (draggedIndex === null || draggedIndex === dropIndex) return;

    // Only allow reordering within the same category (existing or new)
    if (draggingExisting !== isExistingDrop) return;

    if (draggingExisting) {
      const newExistingImages = [...existingImages];
      const [draggedImg] = newExistingImages.splice(draggedIndex, 1);
      newExistingImages.splice(dropIndex, 0, draggedImg);
      existingImages = newExistingImages;
    } else {
      const newImageFiles = [...imageFiles];
      const [draggedFile] = newImageFiles.splice(draggedIndex, 1);
      newImageFiles.splice(dropIndex, 0, draggedFile);
      imageFiles = newImageFiles;
    }

    draggedIndex = null;
    draggingExisting = false;
  }

  function handleDragEnd() {
    draggedIndex = null;
    draggingExisting = false;
  }

  function showToastNotification(message: string, type: 'success' | 'error' = 'success') {
    toastMessage = message;
    toastType = type;
    showToast = true;
    setTimeout(() => {
      showToast = false;
    }, 4000);
  }

  async function handleSubmit(e: Event) {
    e.preventDefault();

    error = '';
    success = false;
    submitting = true;

    // Validation
    if (!title || !description || startingPrice <= 0 || !auctionEndDate) {
      showToastNotification('Please fill in all required fields', 'error');
      submitting = false;
      return;
    }

    if (startingPrice < 100) {
      showToastNotification('Starting price must be at least 100', 'error');
      submitting = false;
      return;
    }

    const totalImages = mode === 'edit' ? existingImages.length + imageFiles.length : imageFiles.length;
    if (totalImages === 0) {
      showToastNotification('Please upload at least one product image', 'error');
      submitting = false;
      return;
    }

    // Validate auction end date is in the future
    const endDate = new Date(auctionEndDate);
    const now = new Date();
    const minFutureDate = new Date(now.getTime() + 60000); // At least 1 minute in the future

    if (endDate <= minFutureDate) {
      if (mode === 'create') {
        showToastNotification('Auction end date must be at least 1 minute in the future', 'error');
        submitting = false;
        // Update the date to minimum valid date
        auctionEndDate = getMinimumEndDate();
        return;
      }
      // For edit mode, allow dates in the past (for products that haven't ended yet)
      // The backend will validate this properly
    }

    try {
      if (mode === 'edit' && product) {
        // Edit mode: delete old images, upload new ones, update product
        loadingMessage = 'Preparing your changes...';

        if (imagesToDelete.length > 0) {
          loadingMessage = `Removing ${imagesToDelete.length} image${imagesToDelete.length > 1 ? 's' : ''}...`;
          for (const mediaId of imagesToDelete) {
            await deleteMedia(mediaId);
          }
        }

        const uploadedImageIds: string[] = [];
        if (imageFiles.length > 0) {
          for (let i = 0; i < imageFiles.length; i++) {
            loadingMessage = `Uploading image ${i + 1} of ${imageFiles.length}...`;
            const imageId = await uploadMedia(imageFiles[i]);
            if (imageId) {
              uploadedImageIds.push(imageId);
            }
          }
        }

        const allImageIds = [
          ...existingImages.map(img => img.image.id),
          ...uploadedImageIds
        ];

        loadingMessage = 'Updating product details...';

        const updateData: any = {
          title,
          description,
          keywords: keywords.map(k => ({ keyword: k })),
          bidInterval,
          auctionEndDate: new Date(auctionEndDate).toISOString(),
          active,
          images: allImageIds.map(id => ({ image: id })),
          region,
          city,
          delivery_options: deliveryOptions || undefined
        };

        if (!hasBids) {
          updateData.startingPrice = startingPrice;
        }

        const result = await updateProduct(product.id, updateData);

        if (result) {
          loadingMessage = 'Success! Refreshing...';
          success = true;
          showToastNotification('Product updated successfully!', 'success');
          if (onSuccess) {
            onSuccess(result);
          }
        } else {
          showToastNotification('Failed to update product. Please try again.', 'error');
        }
      } else {
        // Create mode: upload images and create product
        const uploadedImageIds: string[] = [];

        for (let i = 0; i < imageFiles.length; i++) {
          loadingMessage = `Uploading image ${i + 1} of ${imageFiles.length}...`;
          const imageId = await uploadMedia(imageFiles[i]);
          if (imageId) {
            uploadedImageIds.push(imageId);
          }
        }

        if (uploadedImageIds.length === 0) {
          showToastNotification('Failed to upload images. Please try again.', 'error');
          submitting = false;
          return;
        }

        loadingMessage = 'Creating your product listing...';

        const result = await createProduct({
          title,
          description,
          keywords: keywords.map(k => ({ keyword: k })),
          startingPrice,
          bidInterval,
          auctionEndDate: new Date(auctionEndDate).toISOString(),
          images: uploadedImageIds.map(imageId => ({ image: imageId })),
          region,
          city,
          delivery_options: deliveryOptions || undefined
        });

        if (result) {
          loadingMessage = 'Success! Redirecting...';
          success = true;
          showToastNotification('Product created successfully!', 'success');
          if (onSuccess) {
            onSuccess(result);
          }
        } else {
          showToastNotification('Failed to create product. Please make sure you are logged in.', 'error');
        }
      }
    } catch (err) {
      // Parse error message if it's a validation error
      let errorMessage = `An error occurred while ${mode === 'edit' ? 'updating' : 'creating'} the product. Please try again.`;

      if (err instanceof Error) {
        const errorText = err.message;

        // Check if it's an auction date validation error
        if (errorText.includes('auctionEndDate') && errorText.includes('must be in the future')) {
          errorMessage = 'Auction end date must be in the future. Please select a date at least 1 minute from now.';
          // Reset the date to a valid future date
          auctionEndDate = getMinimumEndDate();
          // Recalculate the duration
          const endDate = new Date(auctionEndDate);
          const now = new Date();
          const diffMs = endDate.getTime() - now.getTime();
          const diffHours = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60)));
          customDays = Math.floor(diffHours / 24);
          customHours = diffHours % 24;
          prevCustomDays = customDays;
          prevCustomHours = customHours;
          prevAuctionEndDate = auctionEndDate;
        } else if (errorText.includes('ValidationError')) {
          // Try to extract more specific error message
          try {
            const match = errorText.match(/"message":"([^"]+)"/);
            if (match && match[1]) {
              errorMessage = match[1];
            }
          } catch (e) {
            // Use default error message
          }
        }
      }

      showToastNotification(errorMessage, 'error');
      console.error('Error:', err);
    }

    submitting = false;
    loadingMessage = '';
  }
</script>

<form on:submit={handleSubmit} class="product-form">
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
    <label for="region">Region</label>
    <select
      id="region"
      bind:value={region}
      disabled={submitting}
    >
      <option value="">Select a region...</option>
      {#each regions as regionOption}
        <option value={regionOption}>{regionOption}</option>
      {/each}
    </select>
    <p class="field-hint">Where is your product located?</p>
  </div>

  <div class="form-group">
    <label for="city">City/Municipality</label>
    <select
      id="city"
      bind:value={city}
      disabled={submitting || !region}
    >
      <option value="">Select a city...</option>
      {#each availableCities as cityOption}
        <option value={cityOption}>{cityOption}</option>
      {/each}
    </select>
    <p class="field-hint">
      {#if !region}
        Please select a region first
      {:else}
        Select the city or municipality
      {/if}
    </p>
  </div>

  <div class="form-group">
    <label for="deliveryOptions">Delivery Options</label>
    <select
      id="deliveryOptions"
      bind:value={deliveryOptions}
      disabled={submitting}
    >
      <option value="">Select an option...</option>
      <option value="delivery">Delivery</option>
      <option value="meetup">Meetup</option>
      <option value="both">Both Delivery and Meetup</option>
    </select>
    <p class="field-hint">How will the buyer receive the product?</p>
  </div>

  <div class="form-group">
    <label for="images">Product Images * (1-5 images)</label>
    <div class="image-upload-container">
      {#if (mode === 'edit' ? existingImages.length + imageFiles.length : imageFiles.length) < 5}
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
          <span>Add Images ({mode === 'edit' ? existingImages.length + imageFiles.length : imageFiles.length}/5)</span>
        </label>
      {/if}

      {#if existingImages.length > 0 || imageFiles.length > 0}
        <div class="image-preview-grid">
          {#each existingImages as img, index}
            <div
              class="image-preview-item"
              class:dragging={draggedIndex === index && draggingExisting}
              draggable="true"
              on:dragstart={(e) => handleDragStart(e, index, true)}
              on:dragover={handleDragOver}
              on:drop={(e) => handleDrop(e, index, true)}
              on:dragend={handleDragEnd}
              role="button"
              tabindex="0"
            >
              <img src={img.image.url} alt="Preview {index + 1}" />
              <button
                type="button"
                class="remove-image-btn"
                on:click={() => removeExistingImage(img.image.id)}
                disabled={submitting}
                title="Remove image"
              >
                ✕
              </button>
              <span class="image-number">{index + 1}</span>
              <div class="drag-handle" title="Drag to reorder">⋮⋮</div>
            </div>
          {/each}

          {#each imageFiles as file, index}
            <div
              class="image-preview-item"
              class:dragging={draggedIndex === index && !draggingExisting}
              draggable="true"
              on:dragstart={(e) => handleDragStart(e, index, false)}
              on:dragover={handleDragOver}
              on:drop={(e) => handleDrop(e, index, false)}
              on:dragend={handleDragEnd}
              role="button"
              tabindex="0"
            >
              <img src={getImagePreview(file)} alt="Preview {existingImages.length + index + 1}" />
              <button
                type="button"
                class="remove-image-btn"
                on:click={() => removeImage(index)}
                disabled={submitting}
                title="Remove image"
              >
                ✕
              </button>
              <span class="image-number">{existingImages.length + index + 1}</span>
              <div class="drag-handle" title="Drag to reorder">⋮⋮</div>
              <span class="new-badge">NEW</span>
            </div>
          {/each}
        </div>
        <p class="field-hint drag-hint">💡 Drag images to reorder them. The first image will be the main product photo.</p>
      {/if}
    </div>
    <p class="field-hint">Upload 1-5 high-quality images of your product. Each image must be less than 10MB.</p>
  </div>

  {#if hasBids && mode === 'edit'}
    <div class="form-info">
      <p><strong>Starting Price:</strong> {startingPrice} {userCurrency}</p>
      <p><strong>Current Bid:</strong> {product?.currentBid} {userCurrency}</p>
      <p class="note">Note: Starting price cannot be changed after bids have been placed.</p>
    </div>
  {:else}
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
  {/if}

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

    <div class="duration-section">
      <input
        id="auctionEndDate"
        type="datetime-local"
        bind:value={auctionEndDate}
        min={minEndDate}
        required
        disabled={submitting}
      />
      {#if mode === 'edit' && product?.createdAt}
        {@const hoursSinceCreation = (new Date().getTime() - new Date(product.createdAt).getTime()) / (1000 * 60 * 60)}
        <p class="field-hint">
          {hoursSinceCreation > 1 ? 'Minimum 1 minute from now.' : 'Minimum 1 hour from creation time.'}
        </p>
      {:else}
        <p class="field-hint">Minimum 1 hour from now.</p>
      {/if}
    </div>

    <div class="duration-divider">
      <span>Or set custom duration</span>
    </div>

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
    {#if auctionEndDate}
      <p class="field-hint">Selected: {new Date(auctionEndDate).toLocaleString()}</p>
    {/if}
  </div>

  {#if mode === 'edit'}
    <div class="form-group">
      <label class="checkbox-label">
        <input
          type="checkbox"
          bind:checked={active}
          disabled={submitting}
        />
        <span>Active (visible on Browse Products page)</span>
      </label>
    </div>
  {/if}

  <div class="form-actions">
    <button type="submit" class="btn-primary" disabled={submitting}>
      {submitting ? (mode === 'edit' ? 'Updating...' : 'Creating Listing...') : (mode === 'edit' ? 'Update Product' : 'Create Listing')}
    </button>
    {#if onCancel}
      <button type="button" class="btn-secondary" on:click={onCancel} disabled={submitting}>
        Cancel
      </button>
    {/if}
  </div>
</form>

<!-- Fullscreen Loading Overlay -->
{#if submitting}
  <div class="fullscreen-loader">
    <div class="loader-content">
      <div class="spinner"></div>
      <p class="loader-message">{loadingMessage}</p>
      <p class="loader-hint">Please wait, do not close this window...</p>
    </div>
  </div>
{/if}

<!-- Toast Notification -->
{#if showToast}
  <div class="toast {toastType}" class:show={showToast}>
    <div class="toast-icon">
      {#if toastType === 'success'}
        ✓
      {:else}
        ✕
      {/if}
    </div>
    <div class="toast-message">{toastMessage}</div>
  </div>
{/if}

<style>
  .product-form {
    width: 100%;
  }

  .success-message {
    background-color: #10b981;
    color: white;
    padding: 1rem;
    border-radius: 4px;
    margin-bottom: 1.5rem;
  }

  .error-message {
    background-color: #ef4444;
    color: white;
    padding: 1rem;
    border-radius: 4px;
    margin-bottom: 1.5rem;
  }

  .form-group {
    margin-bottom: 1.5rem;
  }

  .form-info {
    background-color: #f0f9ff;
    border: 1px solid #bae6fd;
    border-radius: 6px;
    padding: 1rem;
    margin-bottom: 1.5rem;
  }

  .form-info p {
    margin: 0.5rem 0;
  }

  .form-info .note {
    font-size: 0.875rem;
    color: #0369a1;
    font-style: italic;
    margin-top: 0.75rem;
  }

  label {
    display: block;
    margin-bottom: 0.5rem;
    font-weight: 600;
    color: #333;
  }

  .checkbox-label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    cursor: pointer;
  }

  .checkbox-label input[type="checkbox"] {
    width: auto;
    margin: 0;
  }

  input,
  textarea,
  select {
    width: 100%;
    padding: 0.75rem;
    font-size: 1rem;
    border: 1px solid #ccc;
    border-radius: 4px;
    font-family: inherit;
  }

  input:focus,
  textarea:focus,
  select:focus {
    outline: none;
    border-color: #dc2626;
    box-shadow: 0 0 0 3px rgba(220, 38, 38, 0.1);
  }

  input:disabled,
  textarea:disabled,
  select:disabled {
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
    border: none;
    font-weight: 600;
  }

  .btn-primary {
    background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%);
    color: white;
  }

  .btn-primary:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(220, 38, 38, 0.3);
  }

  .btn-primary:disabled {
    background-color: #ccc;
    cursor: not-allowed;
    transform: none;
  }

  .btn-secondary {
    background-color: #f0f0f0;
    color: #333;
    border: 1px solid #ccc;
  }

  .btn-secondary:hover:not(:disabled) {
    background-color: #e0e0e0;
  }

  .field-hint {
    margin: 0.5rem 0 0 0;
    font-size: 0.875rem;
    color: #666;
    font-style: italic;
  }

  /* Duration Styles */
  .duration-section {
    margin-bottom: 1rem;
  }

  .duration-divider {
    display: flex;
    align-items: center;
    text-align: center;
    margin: 1.5rem 0;
  }

  .duration-divider::before,
  .duration-divider::after {
    content: '';
    flex: 1;
    border-bottom: 1px solid #e5e7eb;
  }

  .duration-divider span {
    padding: 0 1rem;
    color: #666;
    font-size: 0.875rem;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.5px;
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

  .new-badge {
    position: absolute;
    top: 0.5rem;
    left: 0.5rem;
    background: #059669;
    color: white;
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.5px;
  }

  @media (max-width: 768px) {
    .image-preview-grid {
      grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
    }

    .form-actions {
      flex-direction: column;
    }

    .btn-primary,
    .btn-secondary {
      width: 100%;
    }
  }

  /* Fullscreen Loader */
  .fullscreen-loader {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.85);
    backdrop-filter: blur(8px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9999;
    animation: fadeIn 0.3s ease-in;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  .loader-content {
    text-align: center;
    color: white;
    max-width: 400px;
    padding: 2rem;
  }

  .spinner {
    width: 64px;
    height: 64px;
    border: 6px solid rgba(255, 255, 255, 0.2);
    border-top-color: #dc2626;
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin: 0 auto 1.5rem;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .loader-message {
    font-size: 1.25rem;
    font-weight: 600;
    margin-bottom: 0.5rem;
    color: white;
  }

  .loader-hint {
    font-size: 0.9rem;
    color: rgba(255, 255, 255, 0.7);
    margin: 0;
  }

  /* Toast Notification */
  .toast {
    position: fixed;
    top: 20px;
    right: 20px;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 16px 24px;
    border-radius: 12px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
    z-index: 10000;
    min-width: 300px;
    max-width: 500px;
    animation: slideInRight 0.3s ease-out, fadeOut 0.3s ease-in 3.7s;
    font-size: 1rem;
  }

  @keyframes slideInRight {
    from {
      transform: translateX(100%);
      opacity: 0;
    }
    to {
      transform: translateX(0);
      opacity: 1;
    }
  }

  @keyframes fadeOut {
    from {
      opacity: 1;
    }
    to {
      opacity: 0;
    }
  }

  .toast.success {
    background: linear-gradient(135deg, #10b981 0%, #059669 100%);
    color: white;
  }

  .toast.error {
    background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
    color: white;
  }

  .toast-icon {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.2);
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: bold;
    font-size: 1.2rem;
    flex-shrink: 0;
  }

  .toast-message {
    flex: 1;
    font-weight: 500;
  }

  @media (max-width: 768px) {
    .toast {
      top: 10px;
      right: 10px;
      left: 10px;
      min-width: auto;
      max-width: none;
    }
  }
</style>
