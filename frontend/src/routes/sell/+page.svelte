<script lang="ts">
  import { goto } from '$app/navigation';
  import { authStore } from '$lib/stores/auth';
  import { t } from '$lib/stores/locale';
  import ProductForm from '$lib/components/ProductForm.svelte';
  import type { Product } from '$lib/api';

  function handleSuccess(product: Product) {
    // Redirect to product page after successful creation
    setTimeout(() => {
      goto(`/products/${product.id}`);
    }, 1500);
  }
</script>

<svelte:head>
  <title>{$t('sell.title')} - BidMo.to</title>
</svelte:head>

<div class="max-w-[800px] mx-auto py-4 sm:py-8">
  <h1 class="headline-bh text-2xl sm:text-4xl mb-2 uppercase tracking-tighter">{$t('sell.title')}</h1>
  <p class="text-bh-fg/60 mb-4 sm:mb-8 text-base sm:text-lg">{$t('sell.subtitle')}</p>

  <div class="card-bh p-4 sm:p-8 mb-4 sm:mb-8">
    <ProductForm mode="create" onSuccess={handleSuccess} />
  </div>

  <div class="bg-bh-red text-white border-2 border-bh-border p-4 sm:p-6">
    <h3 class="font-bold text-lg text-white mb-2 uppercase tracking-wide">{$t('sell.beforeYouList')}</h3>
    <ul class="list-disc pl-6 text-white/90 space-y-2">
      <li>{$t('sell.mustBeLoggedIn')}</li>
      <li>{$t('sell.provideAccurate')}</li>
      <li>{$t('sell.setCompetitivePrice', { currency: $authStore.user?.currency || 'PHP' })}</li>
      <li>{$t('sell.setBidIncrement')}</li>
      <li>{$t('sell.chooseEndDate')}</li>
      <li>{$t('sell.uploadImages')}</li>
    </ul>
  </div>
</div>
