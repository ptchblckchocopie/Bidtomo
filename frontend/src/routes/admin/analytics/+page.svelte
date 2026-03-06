<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { goto } from '$app/navigation';
  import { authStore } from '$lib/stores/auth';
  import { fetchAnalyticsDashboard, type AnalyticsDashboard } from '$lib/api';
  import { Chart, LineController, BarController, DoughnutController, LineElement, BarElement, ArcElement, PointElement, LinearScale, CategoryScale, Tooltip, Legend, Filler } from 'chart.js';

  Chart.register(LineController, BarController, DoughnutController, LineElement, BarElement, ArcElement, PointElement, LinearScale, CategoryScale, Tooltip, Legend, Filler);

  let data: AnalyticsDashboard | null = $state(null);
  let loading = $state(true);
  let error = $state('');

  // Date range — default last 30 days
  const now = new Date();
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  let fromDate = $state(thirtyDaysAgo.toISOString().slice(0, 10));
  let toDate = $state(now.toISOString().slice(0, 10));

  let lineCanvas: HTMLCanvasElement;
  let barCanvas: HTMLCanvasElement;
  let doughnutCanvas: HTMLCanvasElement;
  let lineChart: Chart | null = null;
  let barChart: Chart | null = null;
  let doughnutChart: Chart | null = null;

  // Toggleable legend state for line chart
  let lineDatasets: { label: string; color: string; visible: boolean; dashed?: boolean }[] = $state([]);

  // Chart line colors — each dataset gets a distinct color
  const COLORS = {
    productViews: 'rgb(59, 130, 246)',    // blue
    searches: 'rgb(202, 138, 4)',         // amber
    bids: 'rgb(255, 48, 0)',              // red
    registrations: 'rgb(22, 163, 74)',    // green
    productsSold: 'rgb(107, 114, 128)',   // gray
  };

  const DARK_COLORS = {
    productViews: 'rgb(96, 165, 250)',
    searches: 'rgb(212, 180, 74)',
    bids: 'rgb(94, 106, 210)',
    registrations: 'rgb(90, 232, 121)',
    productsSold: 'rgb(156, 163, 175)',
  };

  function isDark(): boolean {
    return document.documentElement.classList.contains('dark');
  }

  function chartColors() {
    return isDark() ? DARK_COLORS : COLORS;
  }

  function getComputedVar(name: string): string {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function chartTextColor() {
    return getComputedVar('--color-fg') || '#111111';
  }

  function chartGridColor() {
    return 'rgba(128, 128, 128, 0.12)';
  }

  const DOUGHNUT_COLORS = [
    '#3b82f6', '#ef4444', '#f59e0b', '#22c55e', '#8b5cf6',
    '#ec4899', '#06b6d4', '#f97316', '#14b8a6', '#a855f7',
    '#6366f1', '#db2777', '#0891b2', '#65a30d', '#ea580c',
    '#84cc16', '#10b981', '#f43f5e', '#22d3ee', '#facc15',
  ];

  // Re-render charts when theme changes
  let themeObserver: MutationObserver | null = null;

  onMount(() => {
    if (!$authStore.isAuthenticated || $authStore.user?.role !== 'admin') {
      goto('/');
      return;
    }
    loadData();

    themeObserver = new MutationObserver(() => {
      if (data) renderCharts();
    });
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  });

  onDestroy(() => {
    themeObserver?.disconnect();
    lineChart?.destroy();
    barChart?.destroy();
    doughnutChart?.destroy();
  });

  async function loadData() {
    loading = true;
    error = '';
    try {
      data = await fetchAnalyticsDashboard({ from: fromDate, to: toDate });
    } catch (e: any) {
      error = e.message || 'Failed to load analytics';
    } finally {
      loading = false;
    }
    // Wait for DOM to mount canvas elements (they're inside {:else if data} which needs loading=false)
    await new Promise(r => setTimeout(r, 0));
    renderCharts();
  }

  function renderCharts() {
    if (!data) return;

    // Snapshot data to plain objects — Chart.js uses Object.defineProperty
    // on arrays which conflicts with Svelte 5's $state proxy
    const d = $state.snapshot(data) as AnalyticsDashboard;

    // Destroy existing charts
    lineChart?.destroy();
    barChart?.destroy();
    doughnutChart?.destroy();

    // Time series line chart
    const textColor = chartTextColor();
    const gridColor = chartGridColor();
    const c = chartColors();

    if (lineCanvas) {
      const viewsFill = isDark() ? 'rgba(96, 165, 250, 0.12)' : 'rgba(59, 130, 246, 0.1)';
      const datasets = [
        { label: 'Product Views', data: d.timeSeries.productViews, borderColor: c.productViews, backgroundColor: viewsFill, fill: true, tension: 0.3 },
        { label: 'Searches', data: d.timeSeries.searches, borderColor: c.searches, backgroundColor: 'transparent', tension: 0.3 },
        { label: 'Bids', data: d.timeSeries.bids, borderColor: c.bids, backgroundColor: 'transparent', tension: 0.3 },
        { label: 'Registrations', data: d.timeSeries.registrations, borderColor: c.registrations, backgroundColor: 'transparent', tension: 0.3 },
        { label: 'Products Sold', data: d.timeSeries.productsSold, borderColor: c.productsSold, backgroundColor: 'transparent', tension: 0.3, borderDash: [5, 5] },
      ];
      lineChart = new Chart(lineCanvas, {
        type: 'line',
        data: { labels: d.timeSeries.labels, datasets },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            y: { beginAtZero: true, ticks: { color: textColor }, grid: { color: gridColor } },
            x: { ticks: { color: textColor }, grid: { color: gridColor } },
          },
        },
      });
      lineDatasets = datasets.map((ds, i) => ({
        label: ds.label,
        color: ds.borderColor as string,
        visible: true,
        dashed: !!(ds as any).borderDash,
      }));
    }

    // Top search keywords bar chart
    if (barCanvas && d.topSearchKeywords?.length > 0) {
      barChart = new Chart(barCanvas, {
        type: 'bar',
        data: {
          labels: d.topSearchKeywords.map(k => k.keyword),
          datasets: [{
            label: 'Searches',
            data: d.topSearchKeywords.map(k => k.count),
            backgroundColor: c.searches,
            borderColor: isDark() ? 'rgba(255, 255, 255, 0.1)' : textColor,
            borderWidth: isDark() ? 1 : 2,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          indexAxis: 'y',
          plugins: { legend: { display: false } },
          scales: {
            x: { beginAtZero: true, ticks: { color: textColor }, grid: { color: gridColor } },
            y: { ticks: { color: textColor }, grid: { color: gridColor } },
          },
        },
      });
    }

    // Event breakdown doughnut
    if (doughnutCanvas && d.eventBreakdown?.length > 0) {
      doughnutChart = new Chart(doughnutCanvas, {
        type: 'doughnut',
        data: {
          labels: d.eventBreakdown.map(e => formatEventType(e.eventType)),
          datasets: [{
            data: d.eventBreakdown.map(e => e.count),
            backgroundColor: DOUGHNUT_COLORS.slice(0, d.eventBreakdown.length),
            borderColor: isDark() ? 'rgba(255, 255, 255, 0.08)' : textColor,
            borderWidth: isDark() ? 1 : 2,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, padding: 8, color: textColor } } },
        },
      });
    }
  }

  function toggleLineDataset(index: number) {
    if (!lineChart) return;
    const meta = lineChart.getDatasetMeta(index);
    meta.hidden = !meta.hidden;
    lineDatasets[index].visible = !meta.hidden;
    lineChart.update();
  }

  function formatEventType(type: string): string {
    return type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }

  function handleDateChange() {
    loadData();
  }

  async function exportExcel() {
    if (!data) return;
    const ExcelJS = await import('exceljs');
    const workbook = new ExcelJS.Workbook();

    // Shared styles
    const headerFill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FF1A1A2E' } };
    const headerFont = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    const numberFmt = '#,##0';
    const pctFmt = '0.00%';

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function styleHeader(sheet: any) {
      const row = sheet.getRow(1);
      row.font = headerFont;
      row.fill = headerFill;
      row.alignment = { vertical: 'middle', horizontal: 'center' };
      row.height = 22;
      sheet.autoFilter = { from: 'A1', to: `${String.fromCharCode(64 + sheet.columnCount)}1` };
      sheet.views = [{ state: 'frozen', ySplit: 1 }];
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function numCol(sheet: any, colKeys: string[]) {
      for (const key of colKeys) {
        const col = sheet.getColumn(key);
        if (col) col.numFmt = numberFmt;
      }
    }

    // Computed metrics
    const dayCount = data.timeSeries.labels.length || 1;
    const totalViews = data.timeSeries.productViews.reduce((a, b) => a + b, 0);
    const totalBids = data.overview.totalBids;
    const conversionRate = totalViews > 0 ? totalBids / totalViews : 0;
    const avgBidsPerDay = totalBids / dayCount;
    const avgViewsPerDay = totalViews / dayCount;
    const avgSearchesPerDay = data.overview.totalSearches / dayCount;
    const avgRegistrationsPerDay = data.timeSeries.registrations.reduce((a, b) => a + b, 0) / dayCount;

    // Sheet 1: Overview
    const overview = workbook.addWorksheet('Overview');
    overview.columns = [
      { header: 'Metric', key: 'metric', width: 30 },
      { header: 'Value', key: 'value', width: 18 },
    ];
    overview.addRow({ metric: 'Period', value: `${fromDate} to ${toDate}` });
    overview.addRow({ metric: 'Days in Period', value: dayCount });
    overview.addRow({ metric: '', value: '' });
    overview.addRow({ metric: 'Total Users', value: data.overview.totalUsers });
    overview.addRow({ metric: 'Active Users (7d)', value: data.overview.activeUsers7d });
    overview.addRow({ metric: 'Avg Registrations / Day', value: Math.round(avgRegistrationsPerDay * 100) / 100 });
    overview.addRow({ metric: '', value: '' });
    overview.addRow({ metric: 'Total Products', value: data.overview.totalProducts });
    overview.addRow({ metric: 'Products Sold', value: data.overview.productsSold });
    overview.addRow({ metric: '', value: '' });
    overview.addRow({ metric: 'Total Bids', value: totalBids });
    overview.addRow({ metric: 'Avg Bids / Day', value: Math.round(avgBidsPerDay * 100) / 100 });
    overview.addRow({ metric: '', value: '' });
    overview.addRow({ metric: 'Total Product Views', value: totalViews });
    overview.addRow({ metric: 'Avg Views / Day', value: Math.round(avgViewsPerDay * 100) / 100 });
    overview.addRow({ metric: 'Bid Conversion Rate (Bids / Views)', value: conversionRate });
    overview.getCell('B16').numFmt = pctFmt;
    overview.addRow({ metric: '', value: '' });
    overview.addRow({ metric: 'Total Searches', value: data.overview.totalSearches });
    overview.addRow({ metric: 'Avg Searches / Day', value: Math.round(avgSearchesPerDay * 100) / 100 });
    styleHeader(overview);

    // Sheet 2: Daily Trends
    const trends = workbook.addWorksheet('Daily Trends');
    trends.columns = [
      { header: 'Date', key: 'date', width: 15 },
      { header: 'Registrations', key: 'registrations', width: 15 },
      { header: 'Bids', key: 'bids', width: 10 },
      { header: 'Product Views', key: 'productViews', width: 15 },
      { header: 'Searches', key: 'searches', width: 12 },
      { header: 'Products Sold', key: 'productsSold', width: 15 },
    ];
    data.timeSeries.labels.forEach((label, i) => {
      trends.addRow({
        date: label,
        registrations: data!.timeSeries.registrations[i],
        bids: data!.timeSeries.bids[i],
        productViews: data!.timeSeries.productViews[i],
        searches: data!.timeSeries.searches[i],
        productsSold: data!.timeSeries.productsSold[i],
      });
    });
    // Totals row
    const totalsRow = trends.addRow({
      date: 'TOTAL',
      registrations: data.timeSeries.registrations.reduce((a, b) => a + b, 0),
      bids: data.timeSeries.bids.reduce((a, b) => a + b, 0),
      productViews: totalViews,
      searches: data.timeSeries.searches.reduce((a, b) => a + b, 0),
      productsSold: data.timeSeries.productsSold.reduce((a, b) => a + b, 0),
    });
    totalsRow.font = { bold: true };
    totalsRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F0F0' } };
    // Averages row
    const avgRow = trends.addRow({
      date: 'AVG / DAY',
      registrations: Math.round(data.timeSeries.registrations.reduce((a, b) => a + b, 0) / dayCount * 100) / 100,
      bids: Math.round(data.timeSeries.bids.reduce((a, b) => a + b, 0) / dayCount * 100) / 100,
      productViews: Math.round(totalViews / dayCount * 100) / 100,
      searches: Math.round(data.timeSeries.searches.reduce((a, b) => a + b, 0) / dayCount * 100) / 100,
      productsSold: Math.round(data.timeSeries.productsSold.reduce((a, b) => a + b, 0) / dayCount * 100) / 100,
    });
    avgRow.font = { bold: true, italic: true };
    avgRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F0F0' } };
    numCol(trends, ['registrations', 'bids', 'productViews', 'searches', 'productsSold']);
    styleHeader(trends);

    // Sheet 3: Event Breakdown
    const events = workbook.addWorksheet('Event Breakdown');
    events.columns = [
      { header: 'Event Type', key: 'eventType', width: 30 },
      { header: 'Count', key: 'count', width: 15 },
      { header: '% of Total', key: 'pct', width: 15 },
    ];
    const totalEvents = data.eventBreakdown.reduce((a, b) => a + b.count, 0);
    const sorted = [...data.eventBreakdown].sort((a, b) => b.count - a.count);
    sorted.forEach(e => {
      events.addRow({
        eventType: formatEventType(e.eventType),
        count: e.count,
        pct: totalEvents > 0 ? e.count / totalEvents : 0,
      });
    });
    const eventTotalRow = events.addRow({ eventType: 'TOTAL', count: totalEvents, pct: 1 });
    eventTotalRow.font = { bold: true };
    eventTotalRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F0F0' } };
    events.getColumn('count').numFmt = numberFmt;
    events.getColumn('pct').numFmt = pctFmt;
    styleHeader(events);

    // Sheet 4: Top Products
    const products = workbook.addWorksheet('Top Products');
    products.columns = [
      { header: 'Type', key: 'type', width: 12 },
      { header: 'ID', key: 'id', width: 10 },
      { header: 'Title', key: 'title', width: 40 },
      { header: 'Count', key: 'count', width: 10 },
    ];
    data.topViewedProducts.forEach(p => {
      products.addRow({ type: 'Viewed', id: p.id, title: p.title, count: p.views });
    });
    data.topSoldProducts.forEach(p => {
      products.addRow({ type: 'Sold', id: p.id, title: p.title, count: p.sales });
    });
    numCol(products, ['count']);
    styleHeader(products);

    // Sheet 5: Search Keywords
    const keywords = workbook.addWorksheet('Search Keywords');
    keywords.columns = [
      { header: 'Keyword', key: 'keyword', width: 30 },
      { header: 'Count', key: 'count', width: 10 },
    ];
    data.topSearchKeywords.forEach(k => {
      keywords.addRow({ keyword: k.keyword, count: k.count });
    });
    numCol(keywords, ['count']);
    styleHeader(keywords);

    // Sheet 6: Export Metadata
    const meta = workbook.addWorksheet('Metadata');
    meta.columns = [
      { header: 'Property', key: 'prop', width: 25 },
      { header: 'Value', key: 'val', width: 40 },
    ];
    const user = $authStore?.user;
    meta.addRow({ prop: 'Generated At', val: new Date().toISOString() });
    meta.addRow({ prop: 'Exported By', val: user?.name || user?.email || 'Unknown' });
    meta.addRow({ prop: 'Period', val: `${fromDate} to ${toDate}` });
    meta.addRow({ prop: 'Days in Period', val: dayCount });
    meta.addRow({ prop: 'Source', val: 'Bidmo.to Analytics Dashboard' });
    styleHeader(meta);

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `analytics-${fromDate}-to-${toDate}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  }
</script>

<svelte:head>
  <title>Analytics | Bidmo.to Admin</title>
</svelte:head>

<div class="max-w-7xl mx-auto px-4 py-8">
  <!-- Header -->
  <div class="flex flex-col sm:flex-row items-start sm:items-end justify-between gap-4 mb-8 border-t-4 border-[var(--color-fg)] pt-4">
    <div>
      <h1 class="font-display text-3xl mb-1 tracking-tight">Analytics</h1>
      <p class="font-mono text-xs uppercase tracking-widest opacity-50">Dashboard overview</p>
    </div>
    <div class="flex flex-wrap items-center gap-3">
      <div class="flex items-center gap-2">
        <label for="from" class="font-mono text-xs uppercase tracking-widest opacity-50">From</label>
        <input
          id="from"
          type="date"
          bind:value={fromDate}
          onchange={handleDateChange}
          class="input-bh !w-auto"
        />
      </div>
      <div class="flex items-center gap-2">
        <label for="to" class="font-mono text-xs uppercase tracking-widest opacity-50">To</label>
        <input
          id="to"
          type="date"
          bind:value={toDate}
          onchange={handleDateChange}
          class="input-bh !w-auto"
        />
      </div>
      <button
        onclick={exportExcel}
        disabled={!data || loading}
        class="btn-bh-red text-sm disabled:opacity-40"
      >
        Export Excel
      </button>
    </div>
  </div>

  {#if loading}
    <div class="flex justify-center py-20">
      <div class="w-8 h-8 border-2 border-[var(--color-border)] border-t-[var(--color-fg)] rounded-full animate-spin"></div>
    </div>
  {:else if error}
    <div class="card-bh p-8 text-center">
      <p class="font-mono text-[var(--color-red)] font-semibold">{error}</p>
      <button onclick={loadData} class="btn-bh-red mt-4">Retry</button>
    </div>
  {:else if data}
    <!-- Overview Cards -->
    <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-8">
      {#each [
        { value: data.overview.totalUsers, label: 'Total Users' },
        { value: data.overview.activeUsers7d, label: 'Active (7d)' },
        { value: data.overview.totalProducts, label: 'Products' },
        { value: data.overview.productsSold, label: 'Sold' },
        { value: data.overview.totalBids, label: 'Bids' },
        { value: data.overview.totalSearches, label: 'Searches' },
      ] as stat}
        <div class="border border-[var(--color-fg)] bg-[var(--color-surface)] p-4 text-center">
          <div class="font-mono text-2xl font-bold">{stat.value.toLocaleString()}</div>
          <div class="font-mono text-xs uppercase tracking-widest opacity-50 mt-1">{stat.label}</div>
        </div>
      {/each}
    </div>

    <!-- Time Series Chart -->
    <div class="border border-[var(--color-fg)] bg-[var(--color-surface)] p-6 mb-8">
      <h2 class="font-display text-lg font-bold mb-4">Daily Activity</h2>
      <div style="height: 350px;">
        <canvas bind:this={lineCanvas}></canvas>
      </div>
      {#if lineDatasets.length > 0}
        <div class="flex flex-wrap gap-2 mt-4 justify-center">
          {#each lineDatasets as ds, i}
            <button
              onclick={() => toggleLineDataset(i)}
              class="legend-pill"
              class:legend-pill--off={!ds.visible}
              style="--legend-color: {ds.color}"
            >
              <span class="legend-pill-swatch" class:legend-pill-swatch--dashed={ds.dashed}></span>
              {ds.label}
            </button>
          {/each}
        </div>
      {/if}
    </div>

    <!-- Two-column: Search Keywords + Event Breakdown -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
      <div class="border border-[var(--color-fg)] bg-[var(--color-surface)] p-6">
        <h2 class="font-display text-lg font-bold mb-4">Top Search Keywords</h2>
        {#if data.topSearchKeywords?.length > 0}
          <div style="height: 300px;">
            <canvas bind:this={barCanvas}></canvas>
          </div>
        {:else}
          <p class="font-mono text-xs uppercase tracking-widest opacity-50 text-center py-8">No search data in this period</p>
        {/if}
      </div>

      <div class="border border-[var(--color-fg)] bg-[var(--color-surface)] p-6">
        <h2 class="font-display text-lg font-bold mb-4">Event Breakdown</h2>
        {#if data.eventBreakdown?.length > 0}
          <div style="height: 300px;">
            <canvas bind:this={doughnutCanvas}></canvas>
          </div>
        {:else}
          <p class="font-mono text-xs uppercase tracking-widest opacity-50 text-center py-8">No events in this period</p>
        {/if}
      </div>
    </div>

    <!-- Two-column: Top Viewed + Top Sold -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div class="border border-[var(--color-fg)] bg-[var(--color-surface)] p-6">
        <h2 class="font-display text-lg font-bold mb-4">Top Viewed Products</h2>
        {#if data.topViewedProducts?.length > 0}
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-[var(--color-border)]">
                <th class="text-left py-2 font-mono text-xs uppercase tracking-widest opacity-50">#</th>
                <th class="text-left py-2 font-mono text-xs uppercase tracking-widest opacity-50">Product</th>
                <th class="text-right py-2 font-mono text-xs uppercase tracking-widest opacity-50">Views</th>
              </tr>
            </thead>
            <tbody>
              {#each data.topViewedProducts as product, i}
                <tr class="border-b border-[var(--color-fg)]/20">
                  <td class="py-2 font-mono opacity-40">{i + 1}</td>
                  <td class="py-2">
                    <a href="/product/{product.id}" class="hover:text-[var(--color-fg)] font-semibold">{product.title}</a>
                  </td>
                  <td class="py-2 text-right font-mono font-bold">{product.views.toLocaleString()}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        {:else}
          <p class="font-mono text-xs uppercase tracking-widest opacity-50 text-center py-8">No view data in this period</p>
        {/if}
      </div>

      <div class="border border-[var(--color-fg)] bg-[var(--color-surface)] p-6">
        <h2 class="font-display text-lg font-bold mb-4">Top Sold Products</h2>
        {#if data.topSoldProducts?.length > 0}
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-[var(--color-border)]">
                <th class="text-left py-2 font-mono text-xs uppercase tracking-widest opacity-50">#</th>
                <th class="text-left py-2 font-mono text-xs uppercase tracking-widest opacity-50">Product</th>
                <th class="text-right py-2 font-mono text-xs uppercase tracking-widest opacity-50">Sales</th>
              </tr>
            </thead>
            <tbody>
              {#each data.topSoldProducts as product, i}
                <tr class="border-b border-[var(--color-fg)]/20">
                  <td class="py-2 font-mono opacity-40">{i + 1}</td>
                  <td class="py-2">
                    <a href="/product/{product.id}" class="hover:text-[var(--color-fg)] font-semibold">{product.title}</a>
                  </td>
                  <td class="py-2 text-right font-mono font-bold">{product.sales.toLocaleString()}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        {:else}
          <p class="font-mono text-xs uppercase tracking-widest opacity-50 text-center py-8">No sales in this period</p>
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .legend-pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 12px;
    font-size: 0.75rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    border: 2px solid var(--legend-color);
    color: var(--legend-color);
    background: transparent;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .legend-pill:hover {
    background: var(--legend-color);
    color: var(--bh-bg, #fff);
  }

  .legend-pill--off {
    opacity: 0.35;
    border-style: dashed;
  }

  .legend-pill--off:hover {
    opacity: 0.7;
    background: transparent;
    color: var(--legend-color);
  }

  .legend-pill-swatch {
    display: inline-block;
    width: 16px;
    height: 3px;
    background: var(--legend-color);
    border-radius: 1px;
  }

  .legend-pill-swatch--dashed {
    background: repeating-linear-gradient(
      90deg,
      var(--legend-color) 0px,
      var(--legend-color) 4px,
      transparent 4px,
      transparent 7px
    );
  }
</style>
