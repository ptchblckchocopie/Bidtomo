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

  // Chart colors matching Swiss International Style
  const COLORS = {
    red: 'rgb(255, 48, 0)',
    blue: 'rgb(0, 0, 0)',
    yellow: 'rgb(242, 242, 242)',
    fg: 'rgb(0, 0, 0)',
    green: 'rgb(34, 139, 34)',
  };

  const DARK_COLORS = {
    red: 'rgb(94, 106, 210)',
    blue: 'rgb(139, 147, 224)',
    yellow: 'rgb(212, 180, 74)',
    fg: 'rgb(237, 237, 239)',
    green: 'rgb(90, 232, 121)',
  };

  function isDark(): boolean {
    return document.documentElement.classList.contains('dark');
  }

  function chartColors() {
    return isDark() ? DARK_COLORS : COLORS;
  }

  function chartTextColor() {
    return isDark() ? '#EDEDEF' : '#000000';
  }

  function chartGridColor() {
    return isDark() ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)';
  }

  const DOUGHNUT_COLORS = [
    COLORS.red, COLORS.blue, COLORS.yellow, COLORS.green, COLORS.fg,
    '#7c3aed', '#db2777', '#0891b2', '#65a30d', '#ea580c',
    '#6366f1', '#14b8a6', '#f59e0b', '#ef4444', '#8b5cf6',
    '#06b6d4', '#84cc16', '#f97316', '#ec4899', '#10b981',
    '#3b82f6', '#a855f7', '#f43f5e', '#22d3ee', '#facc15',
  ];

  onMount(() => {
    if (!$authStore.isAuthenticated || $authStore.user?.role !== 'admin') {
      goto('/');
      return;
    }
    loadData();
  });

  onDestroy(() => {
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
    const c = chartColors();
    const textColor = chartTextColor();
    const gridColor = chartGridColor();

    if (lineCanvas) {
      const blueFill = isDark() ? 'rgba(94, 106, 210, 0.15)' : 'rgba(255, 48, 0, 0.1)';
      lineChart = new Chart(lineCanvas, {
        type: 'line',
        data: {
          labels: d.timeSeries.labels,
          datasets: [
            { label: 'Product Views', data: d.timeSeries.productViews, borderColor: c.blue, backgroundColor: blueFill, fill: true, tension: 0.3 },
            { label: 'Searches', data: d.timeSeries.searches, borderColor: c.yellow, backgroundColor: 'transparent', tension: 0.3 },
            { label: 'Bids', data: d.timeSeries.bids, borderColor: c.red, backgroundColor: 'transparent', tension: 0.3 },
            { label: 'Registrations', data: d.timeSeries.registrations, borderColor: c.green, backgroundColor: 'transparent', tension: 0.3 },
            { label: 'Products Sold', data: d.timeSeries.productsSold, borderColor: c.fg, backgroundColor: 'transparent', tension: 0.3, borderDash: [5, 5] },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { position: 'bottom', labels: { color: textColor } } },
          scales: {
            y: { beginAtZero: true, ticks: { color: textColor }, grid: { color: gridColor } },
            x: { ticks: { color: textColor }, grid: { color: gridColor } },
          },
        },
      });
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
            backgroundColor: c.blue,
            borderColor: isDark() ? 'rgba(255, 255, 255, 0.1)' : c.fg,
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
            borderColor: isDark() ? 'rgba(255, 255, 255, 0.08)' : c.fg,
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

    // Sheet 1: Overview
    const overview = workbook.addWorksheet('Overview');
    overview.columns = [
      { header: 'Metric', key: 'metric', width: 25 },
      { header: 'Value', key: 'value', width: 15 },
    ];
    overview.addRow({ metric: 'Period', value: `${fromDate} to ${toDate}` });
    overview.addRow({ metric: 'Total Users', value: data.overview.totalUsers });
    overview.addRow({ metric: 'Active Users (7d)', value: data.overview.activeUsers7d });
    overview.addRow({ metric: 'Total Products', value: data.overview.totalProducts });
    overview.addRow({ metric: 'Products Sold', value: data.overview.productsSold });
    overview.addRow({ metric: 'Total Bids', value: data.overview.totalBids });
    overview.addRow({ metric: 'Total Searches', value: data.overview.totalSearches });
    overview.getRow(1).font = { bold: true };

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
    trends.getRow(1).font = { bold: true };

    // Sheet 3: Top Products
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
    products.getRow(1).font = { bold: true };

    // Sheet 4: Search Keywords
    const keywords = workbook.addWorksheet('Search Keywords');
    keywords.columns = [
      { header: 'Keyword', key: 'keyword', width: 30 },
      { header: 'Count', key: 'count', width: 10 },
    ];
    data.topSearchKeywords.forEach(k => {
      keywords.addRow({ keyword: k.keyword, count: k.count });
    });
    keywords.getRow(1).font = { bold: true };

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
  <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
    <h1 class="text-3xl font-bold uppercase tracking-widest">Analytics</h1>
    <div class="flex flex-wrap items-center gap-3">
      <div class="flex items-center gap-2">
        <label for="from" class="text-sm font-bold">From</label>
        <input
          id="from"
          type="date"
          bind:value={fromDate}
          onchange={handleDateChange}
          class="border-2 border-bh-border bg-bh-bg text-bh-fg px-2 py-1 text-sm"
        />
      </div>
      <div class="flex items-center gap-2">
        <label for="to" class="text-sm font-bold">To</label>
        <input
          id="to"
          type="date"
          bind:value={toDate}
          onchange={handleDateChange}
          class="border-2 border-bh-border bg-bh-bg text-bh-fg px-2 py-1 text-sm"
        />
      </div>
      <button
        onclick={exportExcel}
        disabled={!data || loading}
        class="px-4 py-2 font-bold border-2 border-black bg-[#FF3000] text-white hover:bg-black hover:text-white transition-colors duration-150 text-sm disabled:opacity-50"
      >
        Export Excel
      </button>
    </div>
  </div>

  {#if loading}
    <div class="flex justify-center py-20">
      <div class="w-8 h-8 border-4 border-bh-fg border-t-transparent rounded-full animate-spin"></div>
    </div>
  {:else if error}
    <div class="card-bh p-6 text-center">
      <p class="text-bh-red font-bold">{error}</p>
      <button onclick={loadData} class="px-4 py-2 font-bold border-2 border-black bg-[#FF3000] text-white hover:bg-black hover:text-white transition-colors duration-150 text-sm mt-4">Retry</button>
    </div>
  {:else if data}
    <!-- Overview Cards -->
    <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
      <div class="card-bh p-4 text-center">
        <div class="text-2xl font-bold">{data.overview.totalUsers.toLocaleString()}</div>
        <div class="text-sm text-bh-fg/50 font-bold mt-1">Total Users</div>
      </div>
      <div class="card-bh p-4 text-center">
        <div class="text-2xl font-bold">{data.overview.activeUsers7d.toLocaleString()}</div>
        <div class="text-sm text-bh-fg/50 font-bold mt-1">Active (7d)</div>
      </div>
      <div class="card-bh p-4 text-center">
        <div class="text-2xl font-bold">{data.overview.totalProducts.toLocaleString()}</div>
        <div class="text-sm text-bh-fg/50 font-bold mt-1">Products</div>
      </div>
      <div class="card-bh p-4 text-center">
        <div class="text-2xl font-bold">{data.overview.productsSold.toLocaleString()}</div>
        <div class="text-sm text-bh-fg/50 font-bold mt-1">Sold</div>
      </div>
      <div class="card-bh p-4 text-center">
        <div class="text-2xl font-bold">{data.overview.totalBids.toLocaleString()}</div>
        <div class="text-sm text-bh-fg/50 font-bold mt-1">Bids</div>
      </div>
      <div class="card-bh p-4 text-center">
        <div class="text-2xl font-bold">{data.overview.totalSearches.toLocaleString()}</div>
        <div class="text-sm text-bh-fg/50 font-bold mt-1">Searches</div>
      </div>
    </div>

    <!-- Time Series Chart -->
    <div class="card-bh p-6 mb-8">
      <h2 class="text-lg font-bold mb-4">Daily Activity</h2>
      <div style="height: 350px;">
        <canvas bind:this={lineCanvas}></canvas>
      </div>
    </div>

    <!-- Two-column: Search Keywords + Event Breakdown -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
      <div class="card-bh p-6">
        <h2 class="text-lg font-bold mb-4">Top Search Keywords</h2>
        {#if data.topSearchKeywords?.length > 0}
          <div style="height: 300px;">
            <canvas bind:this={barCanvas}></canvas>
          </div>
        {:else}
          <p class="text-bh-fg/50 text-sm text-center py-8">No search data in this period</p>
        {/if}
      </div>

      <div class="card-bh p-6">
        <h2 class="text-lg font-bold mb-4">Event Breakdown</h2>
        {#if data.eventBreakdown?.length > 0}
          <div style="height: 300px;">
            <canvas bind:this={doughnutCanvas}></canvas>
          </div>
        {:else}
          <p class="text-bh-fg/50 text-sm text-center py-8">No events in this period</p>
        {/if}
      </div>
    </div>

    <!-- Two-column: Top Viewed + Top Sold -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
      <div class="card-bh p-6">
        <h2 class="text-lg font-bold mb-4">Top Viewed Products</h2>
        {#if data.topViewedProducts?.length > 0}
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b-2 border-bh-border">
                <th class="text-left py-2 font-bold">#</th>
                <th class="text-left py-2 font-bold">Product</th>
                <th class="text-right py-2 font-bold">Views</th>
              </tr>
            </thead>
            <tbody>
              {#each data.topViewedProducts as product, i}
                <tr class="border-b border-bh-border/30">
                  <td class="py-2 text-bh-fg/50">{i + 1}</td>
                  <td class="py-2">
                    <a href="/product/{product.id}" class="hover:text-bh-red font-bold">{product.title}</a>
                  </td>
                  <td class="py-2 text-right font-bold">{product.views.toLocaleString()}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        {:else}
          <p class="text-bh-fg/50 text-sm text-center py-8">No view data in this period</p>
        {/if}
      </div>

      <div class="card-bh p-6">
        <h2 class="text-lg font-bold mb-4">Top Sold Products</h2>
        {#if data.topSoldProducts?.length > 0}
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b-2 border-bh-border">
                <th class="text-left py-2 font-bold">#</th>
                <th class="text-left py-2 font-bold">Product</th>
                <th class="text-right py-2 font-bold">Sales</th>
              </tr>
            </thead>
            <tbody>
              {#each data.topSoldProducts as product, i}
                <tr class="border-b border-bh-border/30">
                  <td class="py-2 text-bh-fg/50">{i + 1}</td>
                  <td class="py-2">
                    <a href="/product/{product.id}" class="hover:text-bh-red font-bold">{product.title}</a>
                  </td>
                  <td class="py-2 text-right font-bold">{product.sales.toLocaleString()}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        {:else}
          <p class="text-bh-fg/50 text-sm text-center py-8">No sales in this period</p>
        {/if}
      </div>
    </div>
  {/if}
</div>
