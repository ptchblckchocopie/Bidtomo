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

  // Chart colors — tuned for dark backgrounds (lower saturation, soft glow feel)
  const COLORS = {
    productViews: 'rgb(96, 165, 250)',     // soft blue
    searches: 'rgb(212, 180, 74)',          // warm amber
    bids: 'rgb(129, 140, 248)',             // indigo
    registrations: 'rgb(52, 211, 153)',     // emerald
    productsSold: 'rgb(156, 163, 175)',     // muted gray
  };

  const DOUGHNUT_COLORS = [
    '#60A5FA', '#F87171', '#FBBF24', '#34D399', '#A78BFA',
    '#F472B6', '#22D3EE', '#FB923C', '#2DD4BF', '#C084FC',
    '#818CF8', '#EC4899', '#06B6D4', '#84CC16', '#F97316',
    '#A3E635', '#10B981', '#FB7185', '#67E8F9', '#FDE047',
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
    await new Promise(r => setTimeout(r, 0));
    renderCharts();
  }

  function renderCharts() {
    if (!data) return;

    const d = $state.snapshot(data) as AnalyticsDashboard;

    lineChart?.destroy();
    barChart?.destroy();
    doughnutChart?.destroy();

    const textColor = '#8A8F98';
    const gridColor = 'rgba(255, 255, 255, 0.04)';

    // Time series line chart
    if (lineCanvas) {
      const datasets = [
        { label: 'Product Views', data: d.timeSeries.productViews, borderColor: COLORS.productViews, backgroundColor: 'rgba(96, 165, 250, 0.08)', fill: true, tension: 0.4, borderWidth: 2, pointRadius: 0, pointHoverRadius: 4 },
        { label: 'Searches', data: d.timeSeries.searches, borderColor: COLORS.searches, backgroundColor: 'transparent', tension: 0.4, borderWidth: 2, pointRadius: 0, pointHoverRadius: 4 },
        { label: 'Bids', data: d.timeSeries.bids, borderColor: COLORS.bids, backgroundColor: 'transparent', tension: 0.4, borderWidth: 2, pointRadius: 0, pointHoverRadius: 4 },
        { label: 'Registrations', data: d.timeSeries.registrations, borderColor: COLORS.registrations, backgroundColor: 'transparent', tension: 0.4, borderWidth: 2, pointRadius: 0, pointHoverRadius: 4 },
        { label: 'Products Sold', data: d.timeSeries.productsSold, borderColor: COLORS.productsSold, backgroundColor: 'transparent', tension: 0.4, borderWidth: 1.5, borderDash: [5, 5], pointRadius: 0, pointHoverRadius: 4 },
      ];
      lineChart = new Chart(lineCanvas, {
        type: 'line',
        data: { labels: d.timeSeries.labels, datasets },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: 'rgba(19, 19, 22, 0.95)',
              borderColor: 'rgba(255, 255, 255, 0.08)',
              borderWidth: 1,
              titleColor: '#F5F5F3',
              bodyColor: '#8A8F98',
              padding: 12,
              cornerRadius: 10,
              bodySpacing: 6,
            },
          },
          scales: {
            y: { beginAtZero: true, ticks: { color: textColor, font: { size: 11 } }, grid: { color: gridColor }, border: { display: false } },
            x: { ticks: { color: textColor, font: { size: 11 }, maxRotation: 0, autoSkipPadding: 20 }, grid: { display: false }, border: { display: false } },
          },
        },
      });
      lineDatasets = datasets.map((ds) => ({
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
            backgroundColor: 'rgba(212, 180, 74, 0.6)',
            borderColor: 'rgba(212, 180, 74, 0.8)',
            borderWidth: 1,
            borderRadius: 4,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          indexAxis: 'y',
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: 'rgba(19, 19, 22, 0.95)',
              borderColor: 'rgba(255, 255, 255, 0.08)',
              borderWidth: 1,
              titleColor: '#F5F5F3',
              bodyColor: '#8A8F98',
              padding: 12,
              cornerRadius: 10,
            },
          },
          scales: {
            x: { beginAtZero: true, ticks: { color: textColor, font: { size: 11 } }, grid: { color: gridColor }, border: { display: false } },
            y: { ticks: { color: textColor, font: { size: 11 } }, grid: { display: false }, border: { display: false } },
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
            borderColor: 'rgba(10, 10, 10, 0.8)',
            borderWidth: 2,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '65%',
          plugins: {
            legend: {
              position: 'bottom',
              labels: {
                boxWidth: 10,
                boxHeight: 10,
                padding: 12,
                color: '#8A8F98',
                font: { size: 11 },
                usePointStyle: true,
                pointStyleWidth: 10,
              },
            },
            tooltip: {
              backgroundColor: 'rgba(19, 19, 22, 0.95)',
              borderColor: 'rgba(255, 255, 255, 0.08)',
              borderWidth: 1,
              titleColor: '#F5F5F3',
              bodyColor: '#8A8F98',
              padding: 12,
              cornerRadius: 10,
            },
          },
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

<div class="analytics-page">
  <!-- Header -->
  <div class="analytics-header">
    <div>
      <span class="label-bh">Admin</span>
      <h1 class="font-display tracking-tighter text-3xl sm:text-4xl font-bold mt-1">Analytics</h1>
    </div>
    <div class="analytics-controls">
      <div class="date-range">
        <div class="date-field">
          <label for="from">From</label>
          <input
            id="from"
            type="date"
            bind:value={fromDate}
            onchange={handleDateChange}
            class="input-bh"
          />
        </div>
        <div class="date-field">
          <label for="to">To</label>
          <input
            id="to"
            type="date"
            bind:value={toDate}
            onchange={handleDateChange}
            class="input-bh"
          />
        </div>
      </div>
      <button
        onclick={exportExcel}
        disabled={!data || loading}
        class="export-btn"
      >
        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
        </svg>
        Export
      </button>
    </div>
  </div>

  {#if loading}
    <div class="loading-state">
      <div class="loading-spinner"></div>
      <p class="text-[var(--color-muted-fg)] text-sm mt-4">Loading analytics...</p>
    </div>
  {:else if error}
    <div class="error-state">
      <svg class="w-10 h-10 text-[var(--color-red)] mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
        <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
      </svg>
      <p class="text-[var(--color-fg)] font-medium mb-1">{error}</p>
      <button onclick={loadData} class="retry-btn">
        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
        </svg>
        Retry
      </button>
    </div>
  {:else if data}
    <!-- Overview Stat Cards -->
    <div class="stat-grid">
      {#each [
        { value: data.overview.totalUsers, label: 'Total Users', icon: '&#9733;' },
        { value: data.overview.activeUsers7d, label: 'Active (7d)', icon: '&#9889;' },
        { value: data.overview.totalProducts, label: 'Products', icon: '&#9776;' },
        { value: data.overview.productsSold, label: 'Sold', icon: '&#10003;' },
        { value: data.overview.totalBids, label: 'Bids', icon: '&#9829;' },
        { value: data.overview.totalSearches, label: 'Searches', icon: '&#128269;' },
      ] as stat, i}
        <div class="stat-card" style="animation-delay: {i * 60}ms">
          <div class="stat-value">{stat.value.toLocaleString()}</div>
          <div class="stat-label">{stat.label}</div>
        </div>
      {/each}
    </div>

    <!-- Time Series Chart -->
    <div class="chart-panel" style="animation-delay: 200ms">
      <div class="chart-header">
        <h2 class="chart-title">Daily Activity</h2>
        <span class="chart-subtitle">{fromDate} — {toDate}</span>
      </div>
      <div class="chart-body" style="height: 350px;">
        <canvas bind:this={lineCanvas}></canvas>
      </div>
      {#if lineDatasets.length > 0}
        <div class="legend-row">
          {#each lineDatasets as ds, i}
            <button
              onclick={() => toggleLineDataset(i)}
              class="legend-pill"
              class:legend-pill--off={!ds.visible}
              style="--legend-color: {ds.color}"
            >
              <span class="legend-swatch" class:legend-swatch--dashed={ds.dashed}></span>
              {ds.label}
            </button>
          {/each}
        </div>
      {/if}
    </div>

    <!-- Two-column: Search Keywords + Event Breakdown -->
    <div class="chart-grid">
      <div class="chart-panel" style="animation-delay: 300ms">
        <div class="chart-header">
          <h2 class="chart-title">Top Search Keywords</h2>
        </div>
        {#if data.topSearchKeywords?.length > 0}
          <div class="chart-body" style="height: 300px;">
            <canvas bind:this={barCanvas}></canvas>
          </div>
        {:else}
          <div class="empty-chart">
            <p>No search data in this period</p>
          </div>
        {/if}
      </div>

      <div class="chart-panel" style="animation-delay: 360ms">
        <div class="chart-header">
          <h2 class="chart-title">Event Breakdown</h2>
        </div>
        {#if data.eventBreakdown?.length > 0}
          <div class="chart-body" style="height: 300px;">
            <canvas bind:this={doughnutCanvas}></canvas>
          </div>
        {:else}
          <div class="empty-chart">
            <p>No events in this period</p>
          </div>
        {/if}
      </div>
    </div>

    <!-- Two-column: Top Viewed + Top Sold -->
    <div class="chart-grid">
      <div class="chart-panel" style="animation-delay: 420ms">
        <div class="chart-header">
          <h2 class="chart-title">Top Viewed Products</h2>
        </div>
        {#if data.topViewedProducts?.length > 0}
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th class="w-10">#</th>
                  <th>Product</th>
                  <th class="text-right">Views</th>
                </tr>
              </thead>
              <tbody>
                {#each data.topViewedProducts as product, i}
                  <tr>
                    <td class="rank">{i + 1}</td>
                    <td>
                      <a href="/products/{product.id}" class="product-link">{product.title}</a>
                    </td>
                    <td class="text-right font-mono text-sm">{product.views.toLocaleString()}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {:else}
          <div class="empty-chart">
            <p>No view data in this period</p>
          </div>
        {/if}
      </div>

      <div class="chart-panel" style="animation-delay: 480ms">
        <div class="chart-header">
          <h2 class="chart-title">Top Sold Products</h2>
        </div>
        {#if data.topSoldProducts?.length > 0}
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th class="w-10">#</th>
                  <th>Product</th>
                  <th class="text-right">Sales</th>
                </tr>
              </thead>
              <tbody>
                {#each data.topSoldProducts as product, i}
                  <tr>
                    <td class="rank">{i + 1}</td>
                    <td>
                      <a href="/products/{product.id}" class="product-link">{product.title}</a>
                    </td>
                    <td class="text-right font-mono text-sm">{product.sales.toLocaleString()}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {:else}
          <div class="empty-chart">
            <p>No sales in this period</p>
          </div>
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  /* Page layout */
  .analytics-page {
    max-width: 80rem;
    margin: 0 auto;
    padding: 2rem 0;
  }

  /* Header */
  .analytics-header {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    margin-bottom: 2rem;
  }
  @media (min-width: 768px) {
    .analytics-header {
      flex-direction: row;
      align-items: flex-end;
      justify-content: space-between;
    }
  }

  .analytics-controls {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.75rem;
  }

  .date-range {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .date-field {
    display: flex;
    align-items: center;
    gap: 0.375rem;
  }
  .date-field label {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--color-muted-fg);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .date-field .input-bh {
    padding: 0.375rem 0.625rem;
    font-size: 0.8rem;
    min-width: 0;
  }

  .export-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.5rem 1rem;
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--color-fg);
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    cursor: pointer;
    transition: all 200ms cubic-bezier(0.4, 0, 0.2, 1);
  }
  .export-btn:hover {
    background: var(--color-surface-hover);
    border-color: var(--color-accent);
    box-shadow: 0 0 12px rgba(16, 185, 129, 0.1);
  }
  .export-btn:disabled {
    opacity: 0.4;
    pointer-events: none;
  }

  /* Loading */
  .loading-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 5rem 0;
  }
  .loading-spinner {
    width: 2rem;
    height: 2rem;
    border: 2px solid var(--color-border);
    border-top-color: var(--color-accent);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  /* Error */
  .error-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 5rem 0;
    text-align: center;
  }
  .retry-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    margin-top: 1rem;
    padding: 0.5rem 1.25rem;
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--color-fg);
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    cursor: pointer;
    transition: all 200ms;
  }
  .retry-btn:hover {
    background: var(--color-surface-hover);
    border-color: var(--color-accent);
  }

  /* Stat cards */
  .stat-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 0.75rem;
    margin-bottom: 1.5rem;
  }
  @media (min-width: 768px) {
    .stat-grid { grid-template-columns: repeat(3, 1fr); }
  }
  @media (min-width: 1024px) {
    .stat-grid { grid-template-columns: repeat(6, 1fr); }
  }

  .stat-card {
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    padding: 1.25rem 1rem;
    text-align: center;
    transition: all 300ms cubic-bezier(0.4, 0, 0.2, 1);
    animation: fadeUp 0.5s cubic-bezier(0.4, 0, 0.2, 1) both;
  }
  .stat-card:hover {
    border-color: rgba(255, 255, 255, 0.1);
    background: var(--color-surface-hover);
    transform: translateY(-2px);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
  }

  .stat-value {
    font-family: var(--font-display);
    font-size: 1.75rem;
    font-weight: 700;
    letter-spacing: -0.03em;
    color: var(--color-fg);
    line-height: 1.1;
  }
  .stat-label {
    font-size: 0.7rem;
    font-weight: 600;
    color: var(--color-muted-fg);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    margin-top: 0.5rem;
  }

  /* Chart panels */
  .chart-panel {
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    overflow: hidden;
    margin-bottom: 1.5rem;
    animation: fadeUp 0.5s cubic-bezier(0.4, 0, 0.2, 1) both;
  }

  .chart-header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    padding: 1.25rem 1.5rem 0;
  }
  .chart-title {
    font-family: var(--font-display);
    font-size: 1rem;
    font-weight: 700;
    letter-spacing: -0.02em;
    color: var(--color-fg);
  }
  .chart-subtitle {
    font-size: 0.7rem;
    color: var(--color-muted-fg);
    font-family: var(--font-mono);
  }

  .chart-body {
    padding: 1rem 1.5rem 1.25rem;
  }

  .chart-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 1.5rem;
    margin-bottom: 1.5rem;
  }
  @media (min-width: 1024px) {
    .chart-grid { grid-template-columns: repeat(2, 1fr); }
  }
  .chart-grid .chart-panel {
    margin-bottom: 0;
  }

  .empty-chart {
    padding: 3rem 1.5rem;
    text-align: center;
    color: var(--color-muted-fg);
    font-size: 0.85rem;
  }

  /* Legend */
  .legend-row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.375rem;
    justify-content: center;
    padding: 0 1.5rem 1.25rem;
  }

  .legend-pill {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.25rem 0.75rem;
    font-size: 0.7rem;
    font-weight: 600;
    letter-spacing: 0.02em;
    color: var(--legend-color);
    background: transparent;
    border: 1px solid color-mix(in srgb, var(--legend-color) 30%, transparent);
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: all 200ms cubic-bezier(0.4, 0, 0.2, 1);
  }
  .legend-pill:hover {
    background: color-mix(in srgb, var(--legend-color) 12%, transparent);
    border-color: var(--legend-color);
  }
  .legend-pill--off {
    opacity: 0.3;
    border-style: dashed;
  }
  .legend-pill--off:hover {
    opacity: 0.6;
  }

  .legend-swatch {
    display: inline-block;
    width: 14px;
    height: 2px;
    background: var(--legend-color);
    border-radius: 1px;
  }
  .legend-swatch--dashed {
    background: repeating-linear-gradient(
      90deg,
      var(--legend-color) 0px,
      var(--legend-color) 3px,
      transparent 3px,
      transparent 6px
    );
  }

  /* Tables */
  .table-wrap {
    padding: 0 1.5rem 1.25rem;
  }
  table {
    width: 100%;
    border-collapse: collapse;
  }
  th {
    font-size: 0.7rem;
    font-weight: 600;
    color: var(--color-muted-fg);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    text-align: left;
    padding: 0.625rem 0.5rem;
    border-bottom: 1px solid var(--color-border);
  }
  td {
    font-size: 0.85rem;
    color: var(--color-fg);
    padding: 0.625rem 0.5rem;
    border-bottom: 1px solid rgba(255, 255, 255, 0.03);
  }
  tr:hover td {
    background: rgba(255, 255, 255, 0.02);
  }
  .rank {
    font-family: var(--font-mono);
    font-size: 0.75rem;
    color: var(--color-muted-fg);
  }
  .product-link {
    color: var(--color-fg);
    font-weight: 500;
    transition: color 200ms;
  }
  .product-link:hover {
    color: var(--color-accent);
  }

  /* Entrance animation */
  @keyframes fadeUp {
    from {
      opacity: 0;
      transform: translateY(12px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
</style>
