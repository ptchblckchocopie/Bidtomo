<script lang="ts">
  import type { PageData } from './$types';
  import StarRating from '$lib/components/StarRating.svelte';
  import type { Rating } from '$lib/api';
  import { trackUserProfileViewed } from '$lib/analytics';
  import { onMount } from 'svelte';

  let { data } = $props<{ data: PageData }>();

  onMount(() => {
    if (data.user?.id) {
      trackUserProfileViewed(data.user.id);
    }
  });

  // Format date helper
  function formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  // Get product image URL
  function getProductImage(product: any): string | null {
    if (product.images && product.images.length > 0) {
      const firstImage = product.images[0]?.image;
      if (typeof firstImage === 'object' && firstImage?.url) {
        return firstImage.url;
      }
    }
    return null;
  }

  // Format price
  function formatPrice(amount: number, currency: string = 'PHP'): string {
    return new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  }

  // Get rater name from rating
  function getRaterName(rating: Rating): string {
    if (typeof rating.rater === 'object' && rating.rater) {
      return rating.rater.name || 'Anonymous';
    }
    return 'Anonymous';
  }

  // Get product from rating (via transaction)
  function getProductFromRating(rating: Rating): any | null {
    if (typeof rating.transaction === 'object' && rating.transaction) {
      const transaction = rating.transaction;
      if (typeof transaction.product === 'object' && transaction.product) {
        return transaction.product;
      }
    }
    return null;
  }

  // Get product image from rating
  function getProductImageFromRating(rating: Rating): string | null {
    const product = getProductFromRating(rating);
    if (product) {
      return getProductImage(product);
    }
    return null;
  }

  // Get the role of the profile user in the transaction (seller or buyer)
  function getProfileUserRole(rating: Rating): 'seller' | 'buyer' {
    // If raterRole is 'buyer', the ratee (profile user) was the seller
    // If raterRole is 'seller', the ratee (profile user) was the buyer
    return rating.raterRole === 'buyer' ? 'seller' : 'buyer';
  }

  // Active tab
  let activeTab: 'listings' | 'reviews' = $state('listings');

  // Separate ratings by role
  let ratingsAsSeller = $derived(data.ratings.filter((r: Rating) => r.raterRole === 'buyer')); // Buyers rate sellers
  let ratingsAsBuyer = $derived(data.ratings.filter((r: Rating) => r.raterRole === 'seller')); // Sellers rate buyers

  // Rating distribution (1-5 stars)
  let ratingDistribution = $derived.by(() => {
    const dist = [0, 0, 0, 0, 0]; // index 0 = 1-star, index 4 = 5-star
    for (const r of data.ratings) {
      const stars = Math.round(r.rating);
      if (stars >= 1 && stars <= 5) dist[stars - 1]++;
    }
    return dist;
  });

  let maxDistCount = $derived(Math.max(...ratingDistribution, 1));

  // Recent 5 ratings (sorted by newest first)
  let recentRatings = $derived(
    [...data.ratings]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 5)
  );
</script>

<svelte:head>
  <title>{data.user.name} - User Profile</title>
</svelte:head>

<div class="max-w-5xl mx-auto px-4 py-8">
  <div class="border border-[var(--color-border)] overflow-hidden bg-[var(--color-surface)]">
    <!-- Profile Header -->
    <div class="flex gap-6 p-8 bg-[var(--color-fg)] text-[var(--color-bg)]">
      <div class="w-24 h-24 bg-[var(--color-bg)]/20 border border-[var(--color-bg)]/30 flex items-center justify-center text-4xl font-sans font-semibold flex-shrink-0 overflow-hidden">
        {#if data.user.profilePicture && typeof data.user.profilePicture === 'object' && data.user.profilePicture.url}
          <img src={data.user.profilePicture.url} alt={data.user.name} class="w-full h-full object-cover" />
        {:else}
          {data.user.name?.charAt(0)?.toUpperCase() || '?'}
        {/if}
      </div>
      <div class="flex-1">
        <h1 class="font-sans text-3xl font-bold tracking-tight mb-1">{data.user.name}</h1>
        <p class="text-xs opacity-70 mb-4">Member since {formatDate(data.user.createdAt)}</p>

        <div class="flex flex-wrap gap-6">
          <div class="flex flex-col gap-1">
            <div class="flex items-center gap-2">
              <StarRating rating={data.ratingStats.asSeller.averageRating} size="small" />
              <span class="font-mono font-bold text-lg">{data.ratingStats.asSeller.averageRating.toFixed(1)}</span>
            </div>
            <span class="label-bh !text-[var(--color-bg)]/70">Seller Rating ({data.ratingStats.asSeller.totalRatings})</span>
          </div>
          <div class="w-px h-10 bg-[var(--color-bg)]/30 self-center hidden sm:block"></div>
          <div class="flex flex-col gap-1">
            <div class="flex items-center gap-2">
              <StarRating rating={data.ratingStats.asBuyer.averageRating} size="small" />
              <span class="font-mono font-bold text-lg">{data.ratingStats.asBuyer.averageRating.toFixed(1)}</span>
            </div>
            <span class="label-bh !text-[var(--color-bg)]/70">Buyer Rating ({data.ratingStats.asBuyer.totalRatings})</span>
          </div>
          <div class="w-px h-10 bg-[var(--color-bg)]/30 self-center hidden sm:block"></div>
          <div class="flex flex-col gap-1">
            <span class="font-mono font-bold text-lg">{data.totalSoldProducts}</span>
            <span class="label-bh !text-[var(--color-bg)]/70">Completed Sales</span>
          </div>
          <div class="w-px h-10 bg-[var(--color-bg)]/30 self-center hidden sm:block"></div>
          <div class="flex flex-col gap-1">
            <span class="font-mono font-bold text-lg">{data.totalActiveProducts}</span>
            <span class="label-bh !text-[var(--color-bg)]/70">Active Listings</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Rating Summary (Play Store style) -->
    {#if data.ratings.length > 0}
      <div class="p-8 border-b border-[var(--color-border)]">
        <h2 class="font-sans text-xl font-bold uppercase tracking-wide mb-6">Ratings & Reviews</h2>
        <div class="flex gap-8 items-center flex-wrap">
          <!-- Left: Big average number + stars -->
          <div class="flex flex-col items-center gap-1 min-w-[120px]">
            <span class="font-mono text-5xl font-bold">{data.ratingStats.averageRating.toFixed(1)}</span>
            <StarRating rating={data.ratingStats.averageRating} size="medium" />
            <span class="label-bh mt-1">{data.ratingStats.totalRatings} rating{data.ratingStats.totalRatings !== 1 ? 's' : ''}</span>
          </div>

          <!-- Right: Distribution bars -->
          <div class="flex-1 flex flex-col gap-1.5 max-w-[400px]">
            {#each [5, 4, 3, 2, 1] as stars}
              <div class="flex items-center gap-2">
                <span class="w-4 text-right font-mono text-sm font-semibold">{stars}</span>
                <div class="flex-1 h-2.5 bg-[var(--color-muted)] border border-[var(--color-border)] overflow-hidden">
                  <div
                    class="h-full bg-[var(--color-fg)] transition-all duration-500"
                    style="width: {(ratingDistribution[stars - 1] / maxDistCount) * 100}%"
                  ></div>
                </div>
                <span class="w-6 font-mono text-xs opacity-50">{ratingDistribution[stars - 1]}</span>
              </div>
            {/each}
          </div>
        </div>

        <!-- Recent Reviews -->
        {#if recentRatings.length > 0}
          <div class="mt-6 pt-6 border-t border-[var(--color-border)]">
            <h3 class="font-semibold mb-4">Recent Reviews</h3>
            <div class="flex flex-col gap-3">
              {#each recentRatings as rating}
                {@const product = getProductFromRating(rating)}
                <div class="p-4 bg-[var(--color-surface)] border border-[var(--color-border)]">
                  <div class="flex justify-between items-start mb-1.5">
                    <div class="flex items-center gap-2">
                      <span class="font-semibold text-sm">{getRaterName(rating)}</span>
                      <span class="badge-bh text-[0.65rem] {rating.raterRole === 'buyer' ? 'bg-[var(--color-fg)] text-[var(--color-bg)]' : 'bg-[var(--color-muted)] text-[var(--color-fg)]'}">
                        {rating.raterRole === 'buyer' ? 'Buyer' : 'Seller'}
                      </span>
                    </div>
                    <span class="font-mono text-xs opacity-50">{formatDate(rating.createdAt)}</span>
                  </div>
                  <div class="flex items-center gap-2 mb-2">
                    <StarRating rating={rating.rating} size="small" />
                    <span class="font-mono text-sm font-semibold">{rating.rating}/5</span>
                  </div>
                  {#if rating.comment}
                    <p class="text-sm italic opacity-80 leading-relaxed">"{rating.comment}"</p>
                  {/if}
                  {#if product}
                    <a href="/products/{product.id}" class="text-xs font-mono text-[var(--color-fg)] hover:underline mt-2 inline-block">
                      {product.title}
                    </a>
                  {/if}
                </div>
              {/each}
            </div>
            {#if data.ratings.length > 5}
              <button class="btn-bh-outline w-full mt-4 text-sm" onclick={() => activeTab = 'reviews'}>
                See all {data.ratings.length} reviews
              </button>
            {/if}
          </div>
        {/if}
      </div>
    {/if}

    <!-- Tabs -->
    <div class="flex border-b border-[var(--color-border)]">
      <button
        class="flex-1 py-4 text-sm font-semibold uppercase tracking-widest transition-all border-b-2
          {activeTab === 'listings'
            ? 'border-[var(--color-fg)] text-[var(--color-fg)]'
            : 'border-transparent opacity-50 hover:opacity-100'}"
        onclick={() => activeTab = 'listings'}
      >
        Listings
      </button>
      <button
        class="flex-1 py-4 text-sm font-semibold uppercase tracking-widest transition-all border-b-2
          {activeTab === 'reviews'
            ? 'border-[var(--color-fg)] text-[var(--color-fg)]'
            : 'border-transparent opacity-50 hover:opacity-100'}"
        onclick={() => activeTab = 'reviews'}
      >
        Reviews ({data.ratings.length})
      </button>
    </div>

    <!-- Tab Content -->
    {#if activeTab === 'listings'}
      <div class="p-8">
        <!-- Active Listings -->
        {#if data.activeProducts.length > 0}
          <section class="mb-8">
            <h2 class="label-bh text-sm mb-4 pb-2 border-b border-[var(--color-border)]">Active Listings</h2>
            <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {#each data.activeProducts as product}
                <a href="/products/{product.id}" class="block border border-[var(--color-border)] overflow-hidden bg-[var(--color-surface)] hover:bg-[var(--color-muted)] transition-all no-underline text-inherit">
                  <div class="relative aspect-[4/3] bg-[var(--color-muted)]">
                    {#if getProductImage(product)}
                      <img src={getProductImage(product)} alt={product.title} class="w-full h-full object-cover newsprint-img" />
                    {:else}
                      <div class="w-full h-full flex items-center justify-center opacity-40 text-sm">No Image</div>
                    {/if}
                    <span class="badge-bh absolute top-2 right-2 bg-[var(--color-fg)] text-[var(--color-bg)] text-[0.65rem]">Active</span>
                  </div>
                  <div class="p-3">
                    <h3 class="font-sans text-sm font-semibold truncate mb-1">{product.title}</h3>
                    <div class="flex flex-col gap-0.5">
                      {#if product.currentBid}
                        <span class="font-mono text-sm font-bold">{formatPrice(product.currentBid, product.seller?.currency)}</span>
                        <span class="label-bh text-[0.6rem]">Current bid</span>
                      {:else}
                        <span class="font-mono text-sm font-bold">{formatPrice(product.startingPrice, product.seller?.currency)}</span>
                        <span class="label-bh text-[0.6rem]">Starting price</span>
                      {/if}
                    </div>
                  </div>
                </a>
              {/each}
            </div>
          </section>
        {/if}

        <!-- Completed Sales -->
        {#if data.soldProducts.length > 0}
          <section class="mb-8">
            <h2 class="label-bh text-sm mb-4 pb-2 border-b border-[var(--color-border)]">Completed Sales</h2>
            <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {#each data.soldProducts as product}
                <a href="/products/{product.id}" class="block border border-[var(--color-border)] overflow-hidden bg-[var(--color-surface)] hover:bg-[var(--color-muted)] transition-all no-underline text-inherit opacity-85">
                  <div class="relative aspect-[4/3] bg-[var(--color-muted)]">
                    {#if getProductImage(product)}
                      <img src={getProductImage(product)} alt={product.title} class="w-full h-full object-cover newsprint-img" />
                    {:else}
                      <div class="w-full h-full flex items-center justify-center opacity-40 text-sm">No Image</div>
                    {/if}
                    <span class="badge-bh absolute top-2 right-2 bg-[var(--color-muted)] text-[var(--color-fg)] text-[0.65rem]">Sold</span>
                  </div>
                  <div class="p-3">
                    <h3 class="font-sans text-sm font-semibold truncate mb-1">{product.title}</h3>
                    <div class="flex flex-col gap-0.5">
                      <span class="font-mono text-sm font-bold">{formatPrice(product.currentBid || product.startingPrice, product.seller?.currency)}</span>
                      <span class="label-bh text-[0.6rem]">Final price</span>
                    </div>
                  </div>
                </a>
              {/each}
            </div>
          </section>
        {/if}

        {#if data.activeProducts.length === 0 && data.soldProducts.length === 0}
          <div class="text-center py-12 opacity-50">
            <p>This user hasn't listed any products yet.</p>
          </div>
        {/if}
      </div>
    {:else if activeTab === 'reviews'}
      <div class="p-8">
        {#if data.ratings.length > 0}
          <!-- Reviews as Seller -->
          {#if ratingsAsSeller.length > 0}
            <section class="mb-8">
              <div class="flex items-center gap-3 mb-4 pb-3 border-b border-[var(--color-border)]">
                <h2 class="font-sans text-xl font-bold uppercase tracking-wide">Reviews as Seller</h2>
                <span class="badge-bh bg-[var(--color-muted)] text-[var(--color-fg)]">{ratingsAsSeller.length} review{ratingsAsSeller.length !== 1 ? 's' : ''}</span>
              </div>
              <div class="flex flex-col gap-4">
                {#each ratingsAsSeller as rating}
                  {@const product = getProductFromRating(rating)}
                  {@const productImage = getProductImageFromRating(rating)}
                  <div class="flex gap-4 p-4 border border-[var(--color-border)] bg-[var(--color-surface)]">
                    <!-- Product Image (Left) -->
                    {#if product}
                      <a href="/products/{product.id}" class="w-24 h-24 flex-shrink-0 overflow-hidden bg-[var(--color-muted)]">
                        {#if productImage}
                          <img src={productImage} alt={product.title} class="w-full h-full object-cover newsprint-img hover:scale-105 transition-transform" />
                        {:else}
                          <div class="w-full h-full flex items-center justify-center text-2xl opacity-40">📦</div>
                        {/if}
                      </a>
                    {:else}
                      <div class="w-24 h-24 flex-shrink-0 bg-[var(--color-muted)] flex items-center justify-center text-2xl opacity-40">📦</div>
                    {/if}

                    <!-- Review Details (Right) -->
                    <div class="flex-1 min-w-0">
                      {#if product}
                        <div class="flex flex-wrap items-center gap-2 mb-3 pb-3 border-b border-[var(--color-border)]/20">
                          <a href="/products/{product.id}" class="font-semibold text-sm hover:underline no-underline">{product.title}</a>
                          <span class="badge-bh text-[0.6rem] bg-[var(--color-muted)]">Sold this item</span>
                          <a href="/inbox?product={product.id}" class="btn-bh text-[0.6rem] !py-0.5 !px-2 ml-auto" title="Open chat">
                            💬 Chat
                          </a>
                        </div>
                      {/if}

                      <div class="flex justify-between items-start mb-2">
                        <div class="flex flex-col gap-0.5">
                          <span class="font-semibold text-sm">{getRaterName(rating)}</span>
                          <span class="badge-bh text-[0.6rem] bg-[var(--color-fg)] text-[var(--color-bg)] w-fit">Buyer</span>
                        </div>
                        <span class="font-mono text-xs opacity-50">{formatDate(rating.createdAt)}</span>
                      </div>
                      <div class="flex items-center gap-2 mb-3">
                        <StarRating rating={rating.rating} size="small" />
                        <span class="font-mono text-sm font-semibold">{rating.rating}/5</span>
                      </div>
                      {#if rating.comment}
                        <p class="text-sm italic opacity-80 leading-relaxed">"{rating.comment}"</p>
                      {/if}

                      {#if rating.hasFollowUp && rating.followUp}
                        <div class="mt-4 pt-4 border-t border-[var(--color-border)]/20">
                          <div class="flex justify-between items-center mb-2">
                            <span class="font-semibold text-sm text-[var(--color-fg)]">Follow-up</span>
                            {#if rating.followUp.createdAt}
                              <span class="font-mono text-xs opacity-50">{formatDate(rating.followUp.createdAt)}</span>
                            {/if}
                          </div>
                          <div class="flex items-center gap-2 mb-2">
                            <StarRating rating={rating.followUp.rating || 0} size="small" />
                            <span class="font-mono text-sm font-semibold">{rating.followUp.rating}/5</span>
                          </div>
                          {#if rating.followUp.comment}
                            <p class="text-sm italic opacity-80 leading-relaxed">"{rating.followUp.comment}"</p>
                          {/if}
                        </div>
                      {/if}
                    </div>
                  </div>
                {/each}
              </div>
            </section>
          {/if}

          <!-- Reviews as Buyer -->
          {#if ratingsAsBuyer.length > 0}
            <section class="mb-8">
              <div class="flex items-center gap-3 mb-4 pb-3 border-b border-[var(--color-border)]">
                <h2 class="font-sans text-xl font-bold uppercase tracking-wide">Reviews as Buyer</h2>
                <span class="badge-bh bg-[var(--color-muted)] text-[var(--color-fg)]">{ratingsAsBuyer.length} review{ratingsAsBuyer.length !== 1 ? 's' : ''}</span>
              </div>
              <div class="flex flex-col gap-4">
                {#each ratingsAsBuyer as rating}
                  {@const product = getProductFromRating(rating)}
                  {@const productImage = getProductImageFromRating(rating)}
                  <div class="flex gap-4 p-4 border border-[var(--color-border)] bg-[var(--color-surface)]">
                    <!-- Product Image (Left) -->
                    {#if product}
                      <a href="/products/{product.id}" class="w-24 h-24 flex-shrink-0 overflow-hidden bg-[var(--color-muted)]">
                        {#if productImage}
                          <img src={productImage} alt={product.title} class="w-full h-full object-cover newsprint-img hover:scale-105 transition-transform" />
                        {:else}
                          <div class="w-full h-full flex items-center justify-center text-2xl opacity-40">📦</div>
                        {/if}
                      </a>
                    {:else}
                      <div class="w-24 h-24 flex-shrink-0 bg-[var(--color-muted)] flex items-center justify-center text-2xl opacity-40">📦</div>
                    {/if}

                    <!-- Review Details (Right) -->
                    <div class="flex-1 min-w-0">
                      {#if product}
                        <div class="flex flex-wrap items-center gap-2 mb-3 pb-3 border-b border-[var(--color-border)]/20">
                          <a href="/products/{product.id}" class="font-semibold text-sm hover:underline no-underline">{product.title}</a>
                          <span class="badge-bh text-[0.6rem] bg-[var(--color-muted)]">Won this item</span>
                          <a href="/inbox?product={product.id}" class="btn-bh text-[0.6rem] !py-0.5 !px-2 ml-auto" title="Open chat">
                            💬 Chat
                          </a>
                        </div>
                      {/if}

                      <div class="flex justify-between items-start mb-2">
                        <div class="flex flex-col gap-0.5">
                          <span class="font-semibold text-sm">{getRaterName(rating)}</span>
                          <span class="badge-bh text-[0.6rem] bg-[var(--color-muted)] text-[var(--color-fg)] w-fit">Seller</span>
                        </div>
                        <span class="font-mono text-xs opacity-50">{formatDate(rating.createdAt)}</span>
                      </div>
                      <div class="flex items-center gap-2 mb-3">
                        <StarRating rating={rating.rating} size="small" />
                        <span class="font-mono text-sm font-semibold">{rating.rating}/5</span>
                      </div>
                      {#if rating.comment}
                        <p class="text-sm italic opacity-80 leading-relaxed">"{rating.comment}"</p>
                      {/if}

                      {#if rating.hasFollowUp && rating.followUp}
                        <div class="mt-4 pt-4 border-t border-[var(--color-border)]/20">
                          <div class="flex justify-between items-center mb-2">
                            <span class="font-semibold text-sm text-[var(--color-fg)]">Follow-up</span>
                            {#if rating.followUp.createdAt}
                              <span class="font-mono text-xs opacity-50">{formatDate(rating.followUp.createdAt)}</span>
                            {/if}
                          </div>
                          <div class="flex items-center gap-2 mb-2">
                            <StarRating rating={rating.followUp.rating || 0} size="small" />
                            <span class="font-mono text-sm font-semibold">{rating.followUp.rating}/5</span>
                          </div>
                          {#if rating.followUp.comment}
                            <p class="text-sm italic opacity-80 leading-relaxed">"{rating.followUp.comment}"</p>
                          {/if}
                        </div>
                      {/if}
                    </div>
                  </div>
                {/each}
              </div>
            </section>
          {/if}
        {:else}
          <div class="text-center py-12 opacity-50">
            <p>This user hasn't received any reviews yet.</p>
          </div>
        {/if}
      </div>
    {/if}
  </div>
</div>
