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
    pending: 'bg-[#FF3000] text-white',
    reviewed: 'bg-blue-500 text-white',
    resolved: 'bg-green-600 text-white',
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

<div class="py-8">
  <h1 class="text-3xl font-black mb-6 uppercase tracking-widest">Product Reports</h1>

  <!-- Filter Tabs -->
  <div class="flex gap-2 mb-6 flex-wrap">
    {#each (['all', 'pending', 'reviewed', 'resolved'] as const) as filter}
      <button
        onclick={() => setFilter(filter)}
        class="px-4 py-2 text-sm font-bold border-2 border-bh-border transition-colors
          {activeFilter === filter ? 'bg-bh-fg text-bh-bg ' : 'bg-bh-bg text-bh-fg hover:bg-bh-muted'}"
      >
        {filter === 'all' ? 'All' : filter.charAt(0).toUpperCase() + filter.slice(1)}
      </button>
    {/each}
    <span class="self-center text-sm text-bh-fg/60 ml-2">{totalDocs} report{totalDocs !== 1 ? 's' : ''}</span>
  </div>

  {#if error}
    <div class="card-bh bg-red-50 border-red-500 text-red-700 p-4 mb-4 font-bold">{error}</div>
  {/if}

  {#if loading}
    <div class="text-center py-12 text-bh-fg/60 font-bold">Loading reports...</div>
  {:else if reports.length === 0}
    <div class="card-bh p-8 text-center text-bh-fg/60">
      <p class="text-lg font-bold">No reports found</p>
    </div>
  {:else}
    <div class="space-y-3">
      {#each reports as report (report.id)}
        {@const product = getProduct(report)}
        {@const thumb = getProductThumb(report)}
        {@const isSaving = savingId === report.id}

        <!-- Report Row -->
        <div class="card-bh overflow-hidden">
          <button
            onclick={() => toggleExpand(report.id)}
            class="w-full text-left p-4 hover:bg-bh-muted/50 transition-colors"
          >
            <div class="flex items-center gap-3">
              <!-- Thumbnail -->
              <div class="w-10 h-10 flex-shrink-0 border border-bh-border bg-bh-muted overflow-hidden">
                {#if thumb}
                  <img src={thumb} alt="" class="w-full h-full object-cover" />
                {:else}
                  <div class="w-full h-full flex items-center justify-center text-bh-fg/30 text-[10px]">N/A</div>
                {/if}
              </div>

              <!-- Product Title + Reporter -->
              <div class="flex-1 min-w-0">
                <div class="font-bold truncate text-sm">
                  {product?.title || 'Unknown Product'}
                </div>
                <div class="text-xs text-bh-fg/60 truncate">
                  by {getReporterName(report)} &middot; {formatDate(report.createdAt)}
                </div>
              </div>

              <!-- Expand Arrow -->
              <svg
                class="w-4 h-4 transition-transform flex-shrink-0 {expandedId === report.id ? 'rotate-180' : ''}"
                fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"
              >
                <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </div>

            <!-- Badges row -->
            <div class="flex flex-wrap gap-1.5 mt-2 ml-[52px]">
              <span class="px-2 py-0.5 text-[10px] font-bold text-white {reasonColors[report.reason] || 'bg-gray-500'}">
                {reasonLabels[report.reason] || report.reason}
              </span>
              <span class="px-2 py-0.5 text-[10px] font-bold {statusColors[report.status] || ''}">
                {report.status}
              </span>
              {#if product}
                <span class="px-2 py-0.5 text-[10px] font-bold border border-bh-border {product.active ? 'text-green-400' : 'text-red-400'}">
                  {product.active ? 'Visible' : 'Hidden'}
                </span>
              {/if}
            </div>
          </button>

          <!-- Expanded Details -->
          {#if expandedId === report.id}
            <div class="border-t-2 border-bh-border p-4 bg-bh-muted/30 space-y-4">
              <!-- Description -->
              {#if report.description}
                <div>
                  <div class="text-xs font-bold text-bh-fg/60 mb-1 uppercase">Description</div>
                  <p class="text-sm">{report.description}</p>
                </div>
              {/if}

              <!-- Link to product -->
              {#if product}
                <div>
                  <a
                    href="/products/{product.id}"
                    class="text-sm font-bold text-bh-red hover:underline"
                  >
                    View Product Page &rarr;
                  </a>
                </div>
              {/if}

              <!-- Admin Notes -->
              <div>
                <label for="notes-{report.id}" class="text-xs font-bold text-bh-fg/60 mb-1 uppercase block">
                  Admin Notes
                </label>
                <textarea
                  id="notes-{report.id}"
                  bind:value={notesMap[report.id]}
                  rows="3"
                  class="w-full p-2 border-2 border-bh-border bg-bh-bg text-bh-fg text-sm font-medium resize-y focus:outline-none focus:border-bh-red"
                  placeholder="Add internal notes..."
                ></textarea>
              </div>

              <!-- Actions -->
              <div class="flex flex-wrap gap-2">
                {#if product}
                  <button
                    onclick={() => handleToggleVisibility(report)}
                    disabled={isSaving}
                    class="px-4 py-2 text-sm font-bold border-2 border-bh-border  transition-colors disabled:opacity-50
                      {product.active ? 'bg-red-500 text-white hover:bg-red-600' : 'bg-green-600 text-white hover:bg-green-700'}"
                  >
                    {product.active ? 'Hide Product' : 'Unhide Product'}
                  </button>
                {/if}

                {#if report.status !== 'reviewed'}
                  <button
                    onclick={() => handleStatusChange(report, 'reviewed')}
                    disabled={isSaving}
                    class="px-4 py-2 text-sm font-bold border-2 border-bh-border bg-blue-500 text-white  hover:bg-blue-600 transition-colors disabled:opacity-50"
                  >
                    Mark Reviewed
                  </button>
                {/if}

                {#if report.status !== 'resolved'}
                  <button
                    onclick={() => handleStatusChange(report, 'resolved')}
                    disabled={isSaving}
                    class="px-4 py-2 text-sm font-bold border-2 border-bh-border bg-green-600 text-white  hover:bg-green-700 transition-colors disabled:opacity-50"
                  >
                    Mark Resolved
                  </button>
                {/if}

                <button
                  onclick={() => handleSaveNotes(report)}
                  disabled={isSaving}
                  class="px-4 py-2 text-sm font-bold border-2 border-bh-border bg-bh-bg text-bh-fg  hover:bg-bh-muted transition-colors disabled:opacity-50"
                >
                  Save Notes
                </button>

                {#if isSaving}
                  <span class="self-center text-sm text-bh-fg/60">Saving...</span>
                {/if}
              </div>
            </div>
          {/if}
        </div>
      {/each}
    </div>

    <!-- Pagination -->
    {#if totalPages > 1}
      <div class="flex justify-center gap-2 mt-6">
        <button
          onclick={() => goToPage(currentPage - 1)}
          disabled={currentPage <= 1}
          class="px-3 py-2 text-sm font-bold border-2 border-bh-border bg-bh-bg hover:bg-bh-muted disabled:opacity-30 transition-colors"
        >
          Prev
        </button>

        {#each Array.from({ length: totalPages }, (_, i) => i + 1) as p}
          {#if p === 1 || p === totalPages || (p >= currentPage - 2 && p <= currentPage + 2)}
            <button
              onclick={() => goToPage(p)}
              class="px-3 py-2 text-sm font-bold border-2 border-bh-border transition-colors
                {p === currentPage ? 'bg-bh-fg text-bh-bg' : 'bg-bh-bg hover:bg-bh-muted'}"
            >
              {p}
            </button>
          {:else if p === currentPage - 3 || p === currentPage + 3}
            <span class="self-center text-bh-fg/40">...</span>
          {/if}
        {/each}

        <button
          onclick={() => goToPage(currentPage + 1)}
          disabled={currentPage >= totalPages}
          class="px-3 py-2 text-sm font-bold border-2 border-bh-border bg-bh-bg hover:bg-bh-muted disabled:opacity-30 transition-colors"
        >
          Next
        </button>
      </div>
    {/if}
  {/if}
</div>
