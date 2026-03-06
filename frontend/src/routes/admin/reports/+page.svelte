<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { browser } from '$app/environment';
  import { authStore } from '$lib/stores/auth';
  import { fetchReports, updateReport, updateProduct, type Report, type Product } from '$lib/api';

  type StatusFilter = 'all' | 'pending' | 'reviewed' | 'resolved';

  let reports: Report[] = $state([]);
  let loading = $state(true);
  let error = $state('');
  let activeFilter: StatusFilter = $state('all');
  let currentPage = $state(1);
  let totalPages = $state(1);
  let totalDocs = $state(0);
  let expandedId: string | null = $state(null);
  let notesMap: Record<string, string> = $state({});
  let savingId: string | null = $state(null);

  const LIMIT = 20;

  const reasonColors: Record<string, string> = {
    spam: 'bg-gray-500',
    inappropriate: 'bg-orange-500',
    scam: 'bg-red-600',
    counterfeit: 'bg-purple-600',
    other: 'bg-blue-500',
  };

  const reasonLabels: Record<string, string> = {
    spam: 'Spam',
    inappropriate: 'Inappropriate',
    scam: 'Scam',
    counterfeit: 'Counterfeit',
    other: 'Other',
  };

  const statusColors: Record<string, string> = {
    pending: 'bg-[var(--color-red)] text-white',
    reviewed: 'bg-blue-500 text-white',
    resolved: 'bg-[var(--color-green)] text-white',
  };

  onMount(() => {
    if (!$authStore.isAuthenticated || $authStore.user?.role !== 'admin') {
      goto('/');
      return;
    }
    loadReports();
  });

  async function loadReports() {
    loading = true;
    error = '';
    try {
      const params: { status?: string; page: number; limit: number; sort: string } = {
        page: currentPage,
        limit: LIMIT,
        sort: '-createdAt',
      };
      if (activeFilter !== 'all') params.status = activeFilter;

      const result = await fetchReports(params);
      reports = result.docs;
      totalPages = result.totalPages;
      totalDocs = result.totalDocs;

      // Initialize notes map for loaded reports
      for (const r of reports) {
        if (!(r.id in notesMap)) {
          notesMap[r.id] = r.adminNotes || '';
        }
      }
    } catch (e: any) {
      error = e.message || 'Failed to load reports';
    } finally {
      loading = false;
    }
  }

  function setFilter(filter: StatusFilter) {
    activeFilter = filter;
    currentPage = 1;
    loadReports();
  }

  function goToPage(page: number) {
    currentPage = page;
    loadReports();
  }

  function toggleExpand(id: string) {
    expandedId = expandedId === id ? null : id;
  }

  function getProduct(report: Report): Product | null {
    if (typeof report.product === 'object' && report.product !== null) return report.product;
    return null;
  }

  function getReporterName(report: Report): string {
    if (typeof report.reporter === 'object' && report.reporter !== null) return report.reporter.name;
    return String(report.reporter);
  }

  function getProductThumb(report: Report): string | null {
    const product = getProduct(report);
    if (!product?.images?.length) return null;
    const img = product.images[0]?.image;
    if (typeof img === 'object' && img?.url) return img.url;
    return null;
  }

  async function handleToggleVisibility(report: Report) {
    const product = getProduct(report);
    if (!product) return;
    savingId = report.id;
    try {
      await updateProduct(String(product.id), { active: !product.active });
      // Update local state
      const idx = reports.findIndex((r) => r.id === report.id);
      if (idx !== -1) {
        const p = getProduct(reports[idx]);
        if (p) p.active = !p.active;
        reports = [...reports];
      }
    } catch (e: any) {
      error = e.message || 'Failed to update product';
    } finally {
      savingId = null;
    }
  }

  async function handleStatusChange(report: Report, newStatus: 'reviewed' | 'resolved') {
    savingId = report.id;
    try {
      const updated = await updateReport(report.id, { status: newStatus });
      const idx = reports.findIndex((r) => r.id === report.id);
      if (idx !== -1) {
        reports[idx] = { ...reports[idx], ...updated };
        reports = [...reports];
      }
    } catch (e: any) {
      error = e.message || 'Failed to update report';
    } finally {
      savingId = null;
    }
  }

  async function handleSaveNotes(report: Report) {
    savingId = report.id;
    try {
      const updated = await updateReport(report.id, { adminNotes: notesMap[report.id] });
      const idx = reports.findIndex((r) => r.id === report.id);
      if (idx !== -1) {
        reports[idx] = { ...reports[idx], ...updated };
        reports = [...reports];
      }
    } catch (e: any) {
      error = e.message || 'Failed to save notes';
    } finally {
      savingId = null;
    }
  }

  function formatDate(date: string): string {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
</script>

<svelte:head>
  <title>Admin Reports | BidMo.to</title>
</svelte:head>

<div class="max-w-5xl mx-auto px-4 py-8">
  <!-- Header with heavy top border -->
  <div class="border-t-4 border-[var(--color-fg)] pt-4 mb-8">
    <h1 class="font-display text-3xl mb-1 tracking-tight">Product Reports</h1>
    <p class="font-mono text-xs uppercase tracking-widest opacity-50">{totalDocs} report{totalDocs !== 1 ? 's' : ''} total</p>
  </div>

  <!-- Filter Tabs -->
  <div class="flex flex-wrap gap-2 mb-6">
    {#each (['all', 'pending', 'reviewed', 'resolved'] as const) as filter}
      <button
        onclick={() => setFilter(filter)}
        class="px-4 py-2 text-sm font-semibold transition-all border border-[var(--color-fg)]           {activeFilter === filter
            ? 'bg-[var(--color-fg)] text-white border-[var(--color-fg)]'
            : 'bg-transparent text-[var(--color-fg)] hover:bg-[var(--color-muted)]'}"
      >
        {filter === 'all' ? 'All' : filter.charAt(0).toUpperCase() + filter.slice(1)}
      </button>
    {/each}
  </div>

  {#if error}
    <div class="border-l-4 border-[var(--color-red)] bg-[var(--color-red)]/5 p-4 mb-4">
      <p class="font-mono text-sm text-[var(--color-red)]">{error}</p>
    </div>
  {/if}

  {#if loading}
    <div class="text-center py-16">
      <div class="w-6 h-6 border-2 border-[var(--color-border)] border-t-[var(--color-fg)] rounded-full animate-spin mx-auto mb-3"></div>
      <p class="text-xs opacity-50">Loading reports...</p>
    </div>
  {:else if reports.length === 0}
    <div class="card-bh p-12 text-center">
      <p class="text-lg font-semibold opacity-50">No reports found</p>
    </div>
  {:else}
    <!-- Reports Table -->
    <div class="border-t-4 border-[var(--color-fg)]">
      {#each reports as report (report.id)}
        {@const product = getProduct(report)}
        {@const thumb = getProductThumb(report)}
        {@const isSaving = savingId === report.id}

        <!-- Report Row -->
        <div class="border-b border-[var(--color-fg)] {expandedId === report.id ? 'bg-[var(--color-muted)]' : ''}">
          <button
            onclick={() => toggleExpand(report.id)}
            class="w-full text-left p-4 flex items-center gap-4 hover:bg-[var(--color-muted)] transition-colors"
          >
            <!-- Thumbnail -->
            <div class="w-12 h-12 flex-shrink-0 border border-[var(--color-fg)] overflow-hidden">
              {#if thumb}
                <img src={thumb} alt="" class="w-full h-full object-cover newsprint-img" />
              {:else}
                <div class="w-full h-full flex items-center justify-center opacity-30 text-xs font-mono">N/A</div>
              {/if}
            </div>

            <!-- Product Title -->
            <div class="flex-1 min-w-0">
              <div class="font-semibold truncate">
                {product?.title || 'Unknown Product'}
              </div>
              <div class="font-mono text-xs uppercase tracking-widest opacity-50 mt-0.5 normal-case tracking-normal">
                by {getReporterName(report)} &middot; <span class="font-mono">{formatDate(report.createdAt)}</span>
              </div>
            </div>

            <!-- Reason Badge -->
            <span class="badge-bh text-white {reasonColors[report.reason] || 'bg-gray-500'}">
              {reasonLabels[report.reason] || report.reason}
            </span>

            <!-- Status Badge -->
            <span class="badge-bh font-mono {statusColors[report.status] || ''}">
              {report.status}
            </span>

            <!-- Product Visibility -->
            {#if product}
              <span class="badge-bh {product.active ? 'bg-[var(--color-green)]/10 text-[var(--color-green)] border border-[var(--color-green)]/30' : 'bg-[var(--color-red)]/10 text-[var(--color-red)] border border-[var(--color-red)]/30'}">
                {product.active ? 'Visible' : 'Hidden'}
              </span>
            {/if}

            <!-- Expand Arrow -->
            <svg
              class="w-5 h-5 transition-transform flex-shrink-0 opacity-40 {expandedId === report.id ? 'rotate-180' : ''}"
              fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"
            >
              <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          <!-- Expanded Details -->
          {#if expandedId === report.id}
            <div class="border-t border-[var(--color-fg)] p-6 space-y-4">
              <!-- Description -->
              {#if report.description}
                <div>
                  <div class="font-mono text-xs uppercase tracking-widest opacity-50 mb-1">Description</div>
                  <p class="text-sm leading-relaxed">{report.description}</p>
                </div>
              {/if}

              <!-- Link to product -->
              {#if product}
                <div>
                  <a
                    href="/products/{product.id}"
                    class="text-sm font-semibold text-[var(--color-fg)] hover:underline font-mono"
                  >
                    View Product Page &rarr;
                  </a>
                </div>
              {/if}

              <!-- Admin Notes -->
              <div>
                <label for="notes-{report.id}" class="font-mono text-xs uppercase tracking-widest opacity-50 mb-1 block">
                  Admin Notes
                </label>
                <textarea
                  id="notes-{report.id}"
                  bind:value={notesMap[report.id]}
                  rows="3"
                  class="input-bh w-full resize-y !border !border-[var(--color-fg)]"
                  placeholder="Add internal notes..."
                ></textarea>
              </div>

              <!-- Actions -->
              <div class="flex flex-wrap gap-2 pt-2 border-t border-[var(--color-fg)]">
                {#if product}
                  <button
                    onclick={() => handleToggleVisibility(report)}
                    disabled={isSaving}
                    class="btn-bh-red text-sm !py-2 disabled:opacity-40
                      {product.active ? '!bg-[var(--color-red)] !border-[var(--color-red)]' : '!bg-[var(--color-green)] !border-[var(--color-green)]'}"
                  >
                    {product.active ? 'Hide Product' : 'Unhide Product'}
                  </button>
                {/if}

                {#if report.status !== 'reviewed'}
                  <button
                    onclick={() => handleStatusChange(report, 'reviewed')}
                    disabled={isSaving}
                    class="btn-bh text-sm !py-2 disabled:opacity-40"
                  >
                    Mark Reviewed
                  </button>
                {/if}

                {#if report.status !== 'resolved'}
                  <button
                    onclick={() => handleStatusChange(report, 'resolved')}
                    disabled={isSaving}
                    class="btn-bh text-sm !py-2 !bg-[var(--color-green)] !border-[var(--color-green)] !text-white disabled:opacity-40"
                  >
                    Mark Resolved
                  </button>
                {/if}

                <button
                  onclick={() => handleSaveNotes(report)}
                  disabled={isSaving}
                  class="btn-bh-outline text-sm !py-2 disabled:opacity-40"
                >
                  Save Notes
                </button>

                {#if isSaving}
                  <span class="self-center font-mono text-xs uppercase tracking-widest opacity-50">Saving...</span>
                {/if}
              </div>
            </div>
          {/if}
        </div>
      {/each}
    </div>

    <!-- Pagination -->
    {#if totalPages > 1}
      <div class="flex justify-center items-center gap-2 mt-8 pt-4 border-t border-[var(--color-fg)]">
        <button
          onclick={() => goToPage(currentPage - 1)}
          disabled={currentPage <= 1}
          class="btn-bh text-sm !py-1.5 !px-3 disabled:opacity-30"
        >
          Prev
        </button>

        {#each Array.from({ length: totalPages }, (_, i) => i + 1) as p}
          {#if p === 1 || p === totalPages || (p >= currentPage - 2 && p <= currentPage + 2)}
            <button
              onclick={() => goToPage(p)}
              class="px-3 py-1.5 text-sm font-mono font-semibold transition-colors border                 {p === currentPage
                  ? 'bg-[var(--color-fg)] text-white border-[var(--color-fg)]'
                  : 'bg-transparent border-[var(--color-fg)] text-[var(--color-fg)] hover:bg-[var(--color-muted)]'}"
            >
              {p}
            </button>
          {:else if p === currentPage - 3 || p === currentPage + 3}
            <span class="opacity-40 font-mono">...</span>
          {/if}
        {/each}

        <button
          onclick={() => goToPage(currentPage + 1)}
          disabled={currentPage >= totalPages}
          class="btn-bh text-sm !py-1.5 !px-3 disabled:opacity-30"
        >
          Next
        </button>
      </div>
    {/if}
  {/if}
</div>
