<script lang="ts">
  import { goto } from '$app/navigation';
  import { authStore } from '$lib/stores/auth';
  import { onMount } from 'svelte';
  import ProductForm from '$lib/components/ProductForm.svelte';
  import type { Product } from '$lib/api';

  // Check authentication on mount
  onMount(() => {
    if (!$authStore.isAuthenticated) {
      goto('/login?redirect=/sell');
    }
  });

  function handleSuccess(product: Product) {
    // Redirect to product page after successful creation
    setTimeout(() => {
      goto(`/products/${product.id}`);
    }, 1500);
  }
</script>

<svelte:head>
  <title>Sell Your Product - BidMo.to</title>
</svelte:head>

<div class="max-w-[800px] mx-auto py-4 sm:py-8">
  <h1 class="headline-bh text-2xl sm:text-4xl mb-2">List Your Product</h1>
  <p class="text-bh-fg/60 mb-4 sm:mb-8 text-base sm:text-lg">Create a new auction listing for your product</p>

  <div class="card-bh p-4 sm:p-8 mb-4 sm:mb-8">
    <ProductForm mode="create" onSuccess={handleSuccess} />
  </div>

  <div class="bg-bh-yellow border-4 border-bh-border shadow-bh-sm p-4 sm:p-6">
    <h3 class="font-bold text-lg text-bh-fg mb-2">Before You List</h3>
    <ul class="list-disc pl-6 text-bh-fg space-y-2">
      <li>You must be logged in to create a listing</li>
      <li>Make sure to provide accurate and detailed information</li>
      <li>Set a competitive starting price (minimum 100 {$authStore.user?.currency || 'PHP'})</li>
      <li>Set an appropriate bid increment for your product</li>
      <li>Choose an appropriate auction end date</li>
      <li>Upload 1-5 high-quality product images</li>
    </ul>
  </div>
</div>
