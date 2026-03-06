<script lang="ts">
  import { goto } from '$app/navigation';
  import { onDestroy } from 'svelte';
  import { authStore } from '$lib/stores/auth';
  import ProductForm from '$lib/components/ProductForm.svelte';
  import type { Product } from '$lib/api';

  let redirectTimeout: ReturnType<typeof setTimeout> | null = null;

  function handleSuccess(product: Product) {
    // Redirect to product page after successful creation
    redirectTimeout = setTimeout(() => {
      goto(`/products/${product.id}`);
    }, 1500);
  }

  onDestroy(() => {
    if (redirectTimeout) clearTimeout(redirectTimeout);
  });
</script>

<svelte:head>
  <title>Sell Your Product - BidMo.to</title>
</svelte:head>

<div class="max-w-[800px] mx-auto py-4 sm:py-8">
  <!-- Header -->
  <h1 class="headline-bh text-2xl sm:text-4xl mb-1 tracking-tighter">List Your Product</h1>
  <p class="label-bh text-sm mb-4 sm:mb-8">Create a new auction listing for your product</p>

  <!-- Form card -->
  <div class="card-bh p-4 sm:p-8 mb-4 sm:mb-8">
    <ProductForm mode="create" onSuccess={handleSuccess} />
  </div>

  <!-- Tips section -->
  <div class="glass-surface p-4 sm:p-6">
    <h3 class="headline-bh text-lg mb-3">Before You List</h3>
    <ul class="space-y-2 pl-6 list-disc">
      <li class="text-sm opacity-60">You must be logged in to create a listing</li>
      <li class="text-sm opacity-60">Make sure to provide accurate and detailed information</li>
      <li class="text-sm opacity-60">Set a competitive starting price (minimum 100 {$authStore.user?.currency || 'PHP'})</li>
      <li class="text-sm opacity-60">Set an appropriate bid increment for your product</li>
      <li class="text-sm opacity-60">Choose an appropriate auction end date</li>
      <li class="text-sm opacity-60">Upload 1-5 high-quality product images</li>
    </ul>
  </div>
</div>
