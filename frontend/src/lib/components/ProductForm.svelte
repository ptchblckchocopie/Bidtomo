<script lang="ts">
  import { onMount } from 'svelte';
  import { createProduct, updateProduct, uploadMedia, deleteMedia } from '$lib/api';
  import { authStore } from '$lib/stores/auth';
  import KeywordInput from './KeywordInput.svelte';
  import type { Product } from '$lib/api';
  import { regions, getCitiesByRegion } from '$lib/data/philippineLocations';
  import { categories } from '$lib/data/categories';

  // Props
  let {
    mode = 'create',
    product = null,
    onSuccess = null,
    onCancel = null
  }: {
    mode?: 'create' | 'edit';
    product?: Product | null;
    onSuccess?: ((product: Product) => void) | null;
    onCancel?: (() => void) | null;
  } = $props();

  // Form fields
  let title = $state(product?.title || '');
  let description = $state(product?.description || '');
  let keywords = $state<string[]>(product?.keywords?.map(k => k.keyword) || []);
  let startingPrice = $state(product?.startingPrice || 0);
  let bidInterval = $state(0);
  let auctionEndDate = $state('');
  let active = $state(product?.active ?? true);
  let region = $state(product?.region || '');
  let city = $state(product?.city || '');
  let deliveryOptions: 'delivery' | 'meetup' | 'both' | '' = $state(product?.delivery_options || '');
  let selectedCategories = $state<string[]>(product?.categories || []);

  // Image handling
  let existingImages = $state<Array<{ id: string; image: { id: string; url: string; alt?: string } }>>([]);
  let imageFiles = $state<File[]>([]);
  let imagesToDelete = $state<string[]>([]);

  // State
  let submitting = $state(false);
  let error = $state('');
  let success = $state(false);
  let hasBids = $state(false);
  let loadingMessage = $state('');
  let showToast = $state(false);
  let toastMessage = $state('');
  let toastType: 'success' | 'error' = $state('success');

  // Duration controls
  let customDays = $state(0);
  let customHours = $state(0);
  let isUpdatingFromDuration = $state(false);
  let isUpdatingFromDate = $state(false);

  // User currency
  let userCurrency = $derived($authStore.user?.currency || 'PHP');

  // Get cities for selected region
  let availableCities = $derived(region ? getCitiesByRegion(region) : []);

  // Reset city when region changes
  $effect(() => {
    if (region && !availableCities.includes(city)) {
      city = '';
    }
  });

  // Initialize form on mount
  onMount(() => {
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
      selectedCategories = product.categories || [];

      const formattedDate = formatDateForInput(product.auctionEndDate);
      auctionEndDate = formattedDate;
      prevAuctionEndDate = formattedDate;

      active = product.active;
      hasBids = !!(product.currentBid && product.currentBid > 0);

      existingImages = (product.images?.map((img: any, index: number) => ({
        id: `existing-${index}`,
        image: typeof img.image === 'object' ? img.image : { id: img.image, url: '', alt: '' }
      })) || []) as Array<{ id: string; image: { id: string; url: string; alt?: string } }>;

      imageFiles = [];
      imagesToDelete = [];

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
      customDays = 1;
      customHours = 0;
      prevCustomDays = 1;
      prevCustomHours = 0;
    }
  });

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

    if (mode === 'edit' && product?.createdAt) {
      const createdAt = new Date(product.createdAt);
      const hoursSinceCreation = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60);

      if (hoursSinceCreation > 1) {
        const minDate = new Date(now);
        minDate.setMinutes(minDate.getMinutes() + 1);
        return formatDateToLocalInput(minDate);
      }
    }

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

  let minEndDate = $derived(getMinimumEndDate());

  let prevAuctionEndDate = $state('');
  let prevCustomDays = $state(0);
  let prevCustomHours = $state(0);

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
      setTimeout(() => {
        isUpdatingFromDuration = false;
      }, 0);
    }
  }

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

    setTimeout(() => {
      isUpdatingFromDate = false;
    }, 0);
  }

  $effect(() => {
    if ((customDays !== prevCustomDays || customHours !== prevCustomHours) && !isUpdatingFromDate) {
      prevCustomDays = customDays;
      prevCustomHours = customHours;
      updateDateFromDuration();
    }
  });

  $effect(() => {
    if (auctionEndDate && auctionEndDate !== prevAuctionEndDate && !isUpdatingFromDuration) {
      prevAuctionEndDate = auctionEndDate;
      updateDurationFromDate();
    }
  });

  function handleImageSelect(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files) return;

    const newFiles = Array.from(input.files);
    const remainingSlots = 5 - (mode === 'edit' ? existingImages.length + imageFiles.length : imageFiles.length);

    if (newFiles.length > remainingSlots) {
      error = `You can only upload ${remainingSlots} more image(s). Maximum is 5 images.`;
      return;
    }

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

  function removeImage(index: number) {
    imageFiles = imageFiles.filter((_, i) => i !== index);
  }

  function removeExistingImage(imageId: string) {
    const img = existingImages.find(i => i.image.id === imageId);
    if (img) {
      imagesToDelete = [...imagesToDelete, img.image.id];
      existingImages = existingImages.filter(i => i.image.id !== imageId);
    }
  }

  function getImagePreview(file: File): string {
    return URL.createObjectURL(file);
  }

  let draggedIndex: number | null = $state(null);
  let draggingExisting = $state(false);

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

    const endDate = new Date(auctionEndDate);
    const now = new Date();
    const minFutureDate = new Date(now.getTime() + 60000);

    if (endDate <= minFutureDate) {
      if (mode === 'create') {
        showToastNotification('Auction end date must be at least 1 minute in the future', 'error');
        submitting = false;
        auctionEndDate = getMinimumEndDate();
        return;
      }
    }

    try {
      if (mode === 'edit' && product) {
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
          delivery_options: deliveryOptions || undefined,
          categories: selectedCategories.length > 0 ? selectedCategories : undefined
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
          delivery_options: deliveryOptions || undefined,
          categories: selectedCategories.length > 0 ? selectedCategories : undefined
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
      let errorMessage = `An error occurred while ${mode === 'edit' ? 'updating' : 'creating'} the product. Please try again.`;

      if (err instanceof Error) {
        const errorText = err.message;

        if (errorText.includes('auctionEndDate') && errorText.includes('must be in the future')) {
          errorMessage = 'Auction end date must be in the future. Please select a date at least 1 minute from now.';
          auctionEndDate = getMinimumEndDate();
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

<form onsubmit={handleSubmit} class="w-full">
  <!-- Title -->
  <div class="mb-6">
    <label for="title" class="label-bh block mb-2">Product Title *</label>
    <input
      id="title"
      type="text"
      bind:value={title}
      placeholder="Enter a descriptive title"
      required
      disabled={submitting}
      class="input-bh"
    />
  </div>

  <!-- Description -->
  <div class="mb-6">
    <label for="description" class="label-bh block mb-2">Description *</label>
    <textarea
      id="description"
      bind:value={description}
      placeholder="Describe your product in detail"
      rows="6"
      required
      disabled={submitting}
      class="input-bh"
    ></textarea>
  </div>

  <!-- Keywords -->
  <div class="mb-6">
    <label for="keywords" class="label-bh block mb-2">Keywords (for search & SEO)</label>
    <KeywordInput bind:keywords disabled={submitting} />
  </div>

  <!-- Region -->
  <div class="mb-6">
    <label for="region" class="label-bh block mb-2">Region</label>
    <select id="region" bind:value={region} disabled={submitting} class="input-bh">
      <option value="">Select a region...</option>
      {#each regions as regionOption}
        <option value={regionOption}>{regionOption}</option>
      {/each}
    </select>
    <p class="mt-1.5 text-xs text-bh-fg/50 italic font-sans">Where is your product located?</p>
  </div>

  <!-- City -->
  <div class="mb-6">
    <label for="city" class="label-bh block mb-2">City/Municipality</label>
    <select id="city" bind:value={city} disabled={submitting || !region} class="input-bh">
      <option value="">Select a city...</option>
      {#each availableCities as cityOption}
        <option value={cityOption}>{cityOption}</option>
      {/each}
    </select>
    <p class="mt-1.5 text-xs text-bh-fg/50 italic font-sans">
      {#if !region}
        Please select a region first
      {:else}
        Select the city or municipality
      {/if}
    </p>
  </div>

  <!-- Delivery Options -->
  <div class="mb-6">
    <label for="deliveryOptions" class="label-bh block mb-2">Delivery Options</label>
    <select id="deliveryOptions" bind:value={deliveryOptions} disabled={submitting} class="input-bh">
      <option value="">Select an option...</option>
      <option value="delivery">Delivery</option>
      <option value="meetup">Meetup</option>
      <option value="both">Both Delivery and Meetup</option>
    </select>
    <p class="mt-1.5 text-xs text-bh-fg/50 italic font-sans">How will the buyer receive the product?</p>
  </div>

  <!-- Categories -->
  <div class="mb-6">
    <label class="label-bh block mb-2">Product Categories</label>
    <div class="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-2 my-2">
      {#each categories as category}
        <label class="category-checkbox flex items-center gap-2 px-3 py-2.5 cursor-pointer transition-colors
                      border border-[var(--color-border)] bg-transparent                       hover:bg-[var(--color-muted)]">
          <input
            type="checkbox"
            value={category.value}
            checked={selectedCategories.includes(category.value)}
            onchange={(e) => {
              if ((e.currentTarget as HTMLInputElement).checked) {
                selectedCategories = [...selectedCategories, category.value];
              } else {
                selectedCategories = selectedCategories.filter(c => c !== category.value);
              }
            }}
            disabled={submitting}
            class="w-4 h-4 cursor-pointer accent-[var(--color-fg)]"
          />
          <span class="text-sm font-medium text-bh-fg">{category.label}</span>
        </label>
      {/each}
    </div>
    <p class="mt-1.5 text-xs text-bh-fg/50 italic font-sans">Select one or more categories that describe your product</p>
  </div>

  <!-- Images -->
  <div class="mb-6">
    <label for="images" class="label-bh block mb-2">Product Images * (1-5 images)</label>
    <div class="flex flex-col gap-4">
      {#if (mode === 'edit' ? existingImages.length + imageFiles.length : imageFiles.length) < 5}
        <label class="inline-flex items-center gap-2 px-6 py-3 cursor-pointer transition-all font-bold text-base
                      bg-[var(--color-fg)] text-white border border-[var(--color-fg)]                       hover:brightness-110
                      {submitting ? 'opacity-60 cursor-not-allowed' : ''}">
          <input
            type="file"
            accept="image/*"
            multiple
            onchange={handleImageSelect}
            disabled={submitting}
            class="hidden"
          />
          <span class="text-2xl font-black">+</span>
          <span>Add Images ({mode === 'edit' ? existingImages.length + imageFiles.length : imageFiles.length}/5)</span>
        </label>
      {/if}

      {#if existingImages.length > 0 || imageFiles.length > 0}
        <div class="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-4 sm:grid-cols-[repeat(auto-fill,minmax(120px,1fr))]">
          {#each existingImages as img, index}
            <div
              class="image-preview relative aspect-square overflow-hidden cursor-grab transition-all
                     border border-[var(--color-border)] bg-[var(--color-muted)]                      hover:border-[var(--color-fg)]
                     {draggedIndex === index && draggingExisting ? 'opacity-50 scale-95' : ''}"
              draggable="true"
              ondragstart={(e) => handleDragStart(e, index, true)}
              ondragover={handleDragOver}
              ondrop={(e) => handleDrop(e, index, true)}
              ondragend={handleDragEnd}
              role="button"
              tabindex="0"
            >
              <img src={img.image.url} alt="Preview {index + 1}" class="w-full h-full object-cover pointer-events-none" />
              <button
                type="button"
                class="absolute top-2 right-2 w-8 h-8 flex items-center justify-center text-xl font-bold leading-none
                       bg-[var(--color-red)] text-white  cursor-pointer transition-all
                       hover:brightness-110 hover:scale-110
                       disabled:opacity-50 disabled:cursor-not-allowed"
                onclick={() => removeExistingImage(img.image.id)}
                disabled={submitting}
                title="Remove image"
              >
                &#10005;
              </button>
              <span class="absolute bottom-2 left-2 px-2 py-0.5 text-xs font-bold
                           bg-black/60 text-white rounded">{index + 1}</span>
              <div class="drag-handle absolute bottom-2 left-1/2 -translate-x-1/2
                          px-3 py-0.5 text-xl font-bold tracking-[-2px] pointer-events-none
                          opacity-0 transition-opacity
                          bg-black/60 text-white rounded">&#8942;&#8942;</div>
            </div>
          {/each}

          {#each imageFiles as file, index}
            <div
              class="image-preview relative aspect-square overflow-hidden cursor-grab transition-all
                     border border-[var(--color-border)] bg-[var(--color-muted)]                      hover:border-[var(--color-fg)]
                     {draggedIndex === index && !draggingExisting ? 'opacity-50 scale-95' : ''}"
              draggable="true"
              ondragstart={(e) => handleDragStart(e, index, false)}
              ondragover={handleDragOver}
              ondrop={(e) => handleDrop(e, index, false)}
              ondragend={handleDragEnd}
              role="button"
              tabindex="0"
            >
              <img src={getImagePreview(file)} alt="Preview {existingImages.length + index + 1}" class="w-full h-full object-cover pointer-events-none" />
              <button
                type="button"
                class="absolute top-2 right-2 w-8 h-8 flex items-center justify-center text-xl font-bold leading-none
                       bg-[var(--color-red)] text-white  cursor-pointer transition-all
                       hover:brightness-110 hover:scale-110
                       disabled:opacity-50 disabled:cursor-not-allowed"
                onclick={() => removeImage(index)}
                disabled={submitting}
                title="Remove image"
              >
                &#10005;
              </button>
              <span class="absolute bottom-2 left-2 px-2 py-0.5 text-xs font-bold
                           bg-black/60 text-white rounded">{existingImages.length + index + 1}</span>
              <div class="drag-handle absolute bottom-2 left-1/2 -translate-x-1/2
                          px-3 py-0.5 text-xl font-bold tracking-[-2px] pointer-events-none
                          opacity-0 transition-opacity
                          bg-black/60 text-white rounded">&#8942;&#8942;</div>
              <span class="badge-bh absolute top-2 left-2 bg-[var(--color-fg)] text-white rounded">NEW</span>
            </div>
          {/each}
        </div>
        <p class="mt-3 text-sm text-[var(--color-fg)] font-medium">
          Drag images to reorder them. The first image will be the main product photo.
        </p>
      {/if}
    </div>
    <p class="mt-1.5 text-xs text-bh-fg/50 italic font-sans">Upload 1-5 high-quality images of your product. Each image must be less than 10MB.</p>
  </div>

  <!-- Starting Price -->
  {#if hasBids && mode === 'edit'}
    <div class="mb-6 p-4 bg-[var(--color-fg)]/5 border border-[var(--color-fg)]/30 ">
      <p class="mb-1"><strong>Starting Price:</strong> {startingPrice} {userCurrency}</p>
      <p class="mb-1"><strong>Current Bid:</strong> {product?.currentBid} {userCurrency}</p>
      <p class="text-sm text-[var(--color-fg)] italic mt-2">Note: Starting price cannot be changed after bids have been placed.</p>
    </div>
  {:else}
    <div class="mb-6">
      <label for="startingPrice" class="label-bh block mb-2">Starting Price ({userCurrency}) *</label>
      <input
        id="startingPrice"
        type="number"
        bind:value={startingPrice}
        min="100"
        step="0.01"
        placeholder="100.00"
        required
        disabled={submitting}
        class="input-bh"
      />
      <p class="mt-1.5 text-xs text-bh-fg/50 italic font-sans">Minimum starting price: 100 {userCurrency}</p>
    </div>
  {/if}

  <!-- Bid Increment -->
  <div class="mb-6">
    <label for="bidInterval" class="label-bh block mb-2">Bid Increment ({userCurrency}) *</label>
    <input
      id="bidInterval"
      type="number"
      bind:value={bidInterval}
      min="1"
      step="1"
      placeholder={userCurrency === 'PHP' ? '50' : '1'}
      required
      disabled={submitting}
      class="input-bh"
    />
    <p class="mt-1.5 text-xs text-bh-fg/50 italic font-sans">Minimum amount each bid must increase by (default: {userCurrency === 'PHP' ? '50' : '1'} {userCurrency})</p>
  </div>

  <!-- Auction End Date -->
  <div class="mb-6">
    <label for="auctionEndDate" class="label-bh block mb-2">Auction End Date *</label>

    <div class="mb-4">
      <input
        id="auctionEndDate"
        type="datetime-local"
        bind:value={auctionEndDate}
        min={minEndDate}
        required
        disabled={submitting}
        class="input-bh"
      />
      {#if mode === 'edit' && product?.createdAt}
        {@const hoursSinceCreation = (new Date().getTime() - new Date(product.createdAt).getTime()) / (1000 * 60 * 60)}
        <p class="mt-1.5 text-xs text-bh-fg/50 italic font-sans">
          {hoursSinceCreation > 1 ? 'Minimum 1 minute from now.' : 'Minimum 1 hour from creation time.'}
        </p>
      {:else}
        <p class="mt-1.5 text-xs text-bh-fg/50 italic font-sans">Minimum 1 hour from now.</p>
      {/if}
    </div>

    <!-- Duration divider -->
    <div class="flex items-center my-6">
      <div class="flex-1 h-[2px] bg-[var(--color-border)]"></div>
      <span class="px-4 text-xs font-bold uppercase tracking-widest text-bh-fg font-mono">Or set custom duration</span>
      <div class="flex-1 h-[2px] bg-[var(--color-border)]"></div>
    </div>

    <div class="flex gap-3 items-end flex-wrap">
      <div class="flex flex-col gap-1">
        <input
          type="number"
          min="0"
          placeholder="0"
          class="input-bh !w-20"
          bind:value={customDays}
          disabled={submitting}
        />
        <span class="text-sm font-bold text-bh-fg">Days</span>
      </div>
      <div class="flex flex-col gap-1">
        <input
          type="number"
          min="0"
          placeholder="0"
          class="input-bh !w-20"
          bind:value={customHours}
          disabled={submitting}
        />
        <span class="text-sm font-bold text-bh-fg">Hours</span>
      </div>
    </div>
    {#if auctionEndDate}
      <p class="mt-1.5 text-xs text-bh-fg/50 italic font-sans">Selected: {new Date(auctionEndDate).toLocaleString()}</p>
    {/if}
  </div>

  <!-- Active checkbox (admin only, edit mode) -->
  {#if mode === 'edit' && $authStore.user?.role === 'admin'}
    <div class="mb-6">
      <label class="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          bind:checked={active}
          disabled={submitting}
          class="w-4 h-4 accent-[var(--color-fg)]"
        />
        <span class="text-sm font-medium text-bh-fg">Active (visible on Browse Products page)</span>
      </label>
    </div>
  {/if}

  <!-- Actions -->
  <div class="flex gap-4 mt-8 sm:flex-col">
    <button type="submit" class="btn-bh-red" disabled={submitting}>
      {submitting ? (mode === 'edit' ? 'Updating...' : 'Creating Listing...') : (mode === 'edit' ? 'Update Product' : 'Create Listing')}
    </button>
    {#if onCancel}
      <button type="button" class="btn-bh-outline" onclick={onCancel} disabled={submitting}>
        Cancel
      </button>
    {/if}
  </div>
</form>

<!-- Fullscreen Loading Overlay -->
{#if submitting}
  <div class="fixed inset-0 bg-black/90 flex items-center justify-center z-[9999] animate-fade-in">
    <div class="text-center text-white max-w-[400px] px-8">
      <div class="w-16 h-16 border-[6px] border-white/20 border-t-[var(--color-fg)]
                  rounded-full animate-spin mx-auto mb-6"></div>
      <p class="text-xl font-bold mb-2">{loadingMessage}</p>
      <p class="text-sm text-white/70">Please wait, do not close this window...</p>
    </div>
  </div>
{/if}

<!-- Toast Notification -->
{#if showToast}
  <div class="fixed top-5 right-5 z-[10000] flex items-center gap-3 px-6 py-4 min-w-[300px] max-w-[500px]
              border border-[var(--color-border)] text-base animate-slide-in               {toastType === 'success' ? 'bg-[var(--color-fg)] text-white' : 'bg-[var(--color-red)] text-white'}
              sm:top-2.5 sm:right-2.5 sm:left-2.5 sm:min-w-0 sm:max-w-none">
    <div class="w-7 h-7 flex items-center justify-center bg-white/20 flex-shrink-0 font-bold text-lg
                ">
      {#if toastType === 'success'}
        &#10003;
      {:else}
        &#10005;
      {/if}
    </div>
    <div class="flex-1 font-medium">{toastMessage}</div>
  </div>
{/if}

<style>
  @keyframes fade-in {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  .animate-fade-in {
    animation: fade-in 0.3s ease-in;
  }

  @keyframes slide-in {
    from { transform: translateX(100%); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
  }
  .animate-slide-in {
    animation: slide-in 0.3s ease-out, fade-out 0.3s ease-in 3.7s;
  }
  @keyframes fade-out {
    from { opacity: 1; }
    to { opacity: 0; }
  }

  .image-preview:hover .drag-handle {
    opacity: 1;
  }

  /* checked category styling */
  .category-checkbox input[type="checkbox"]:checked + span {
    font-weight: 700;
    color: var(--color-fg);
  }
</style>
