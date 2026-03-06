# UX Patterns Reference

Reusable patterns for edge states, feedback, and user interactions in the Bidtomo dark theme.

---

## Skeleton Loaders

All skeletons use `animate-pulse` on `var(--color-muted)` blocks that match the final content shape.

### Product Card Skeleton
```svelte
<div class="card-bh p-0 overflow-hidden">
  <div class="aspect-[4/3] bg-[var(--color-muted)] animate-pulse"></div>
  <div class="p-4 space-y-3">
    <div class="h-4 bg-[var(--color-muted)] rounded w-3/4 animate-pulse"></div>
    <div class="h-3 bg-[var(--color-muted)] rounded w-1/2 animate-pulse"></div>
    <div class="flex justify-between items-center pt-2">
      <div class="h-5 bg-[var(--color-muted)] rounded w-20 animate-pulse"></div>
      <div class="h-3 bg-[var(--color-muted)] rounded w-16 animate-pulse"></div>
    </div>
  </div>
</div>
```

### Product Grid Skeleton (6 cards)
```svelte
<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
  {#each Array(6) as _}
    <ProductCardSkeleton />
  {/each}
</div>
```

### Profile Header Skeleton
```svelte
<div class="flex items-center gap-4">
  <div class="w-16 h-16 rounded-full bg-[var(--color-muted)] animate-pulse"></div>
  <div class="space-y-2">
    <div class="h-5 bg-[var(--color-muted)] rounded w-32 animate-pulse"></div>
    <div class="h-3 bg-[var(--color-muted)] rounded w-48 animate-pulse"></div>
  </div>
</div>
```

### Table Row Skeleton
```svelte
<tr>
  {#each Array(columns) as _}
    <td class="py-3 px-4">
      <div class="h-4 bg-[var(--color-muted)] rounded w-full animate-pulse"></div>
    </td>
  {/each}
</tr>
```

---

## Empty States

Always include: icon/visual, message, suggested action.

### No Products Found
```svelte
<div class="flex flex-col items-center justify-center py-20 text-center">
  <svg class="w-16 h-16 text-[var(--color-muted-fg)] mb-4 opacity-40" ...><!-- search icon --></svg>
  <p class="headline-bh text-lg mb-2">No products found</p>
  <p class="text-sm text-[var(--color-muted-fg)] mb-6 max-w-sm">
    Try adjusting your search terms or removing some filters
  </p>
  <button class="btn-bh" onclick={clearFilters}>Clear all filters</button>
</div>
```

### Empty Watchlist
```svelte
<div class="flex flex-col items-center justify-center py-20 text-center">
  <svg class="w-16 h-16 text-[var(--color-muted-fg)] mb-4 opacity-40" ...><!-- heart icon --></svg>
  <p class="headline-bh text-lg mb-2">Your watchlist is empty</p>
  <p class="text-sm text-[var(--color-muted-fg)] mb-6 max-w-sm">
    Products you save will appear here so you can track bids
  </p>
  <a href="/products" class="btn-bh-red">Browse products</a>
</div>
```

### No Messages
```svelte
<div class="flex flex-col items-center justify-center py-20 text-center">
  <svg class="w-16 h-16 text-[var(--color-muted-fg)] mb-4 opacity-40" ...><!-- message icon --></svg>
  <p class="headline-bh text-lg mb-2">No messages yet</p>
  <p class="text-sm text-[var(--color-muted-fg)] max-w-sm">
    Messages from sellers and buyers will show up here
  </p>
</div>
```

---

## Error States

### API Error (Recoverable)
```svelte
<div class="card-bh p-8 text-center border-[var(--color-red)]/20">
  <p class="text-sm text-[var(--color-muted-fg)] mb-4">{error}</p>
  <button class="btn-bh" onclick={retry}>
    <svg class="w-4 h-4 mr-2" ...><!-- refresh icon --></svg>
    Try again
  </button>
</div>
```

### Inline Field Error
```svelte
<div>
  <input class="input-bh {hasError ? 'border-[var(--color-red)] focus:border-[var(--color-red)]' : ''}" />
  {#if hasError}
    <p class="text-xs text-[var(--color-red)] mt-1 flex items-center gap-1">
      <svg class="w-3 h-3" ...><!-- alert icon --></svg>
      {errorMessage}
    </p>
  {/if}
</div>
```

### Network Offline Banner
```svelte
{#if !navigator.onLine}
  <div class="fixed top-0 left-0 right-0 z-[200] bg-[var(--color-red)] text-white text-center py-2 text-sm">
    You're offline. Some features may be unavailable.
  </div>
{/if}
```

---

## Toast Notification System

### Toast Store Pattern
```ts
// lib/stores/toast.ts
import { writable } from 'svelte/store';

type Toast = { id: number; message: string; type: 'success' | 'error' | 'info'; };
let nextId = 0;

function createToastStore() {
  const { subscribe, update } = writable<Toast[]>([]);
  return {
    subscribe,
    success: (message: string) => {
      const id = nextId++;
      update(t => [...t, { id, message, type: 'success' }]);
      setTimeout(() => update(t => t.filter(x => x.id !== id)), 4000);
    },
    error: (message: string) => {
      const id = nextId++;
      update(t => [...t, { id, message, type: 'error' }]);
      setTimeout(() => update(t => t.filter(x => x.id !== id)), 6000);
    },
    info: (message: string) => {
      const id = nextId++;
      update(t => [...t, { id, message, type: 'info' }]);
      setTimeout(() => update(t => t.filter(x => x.id !== id)), 4000);
    },
  };
}
export const toasts = createToastStore();
```

### Toast Container Component
```svelte
<script lang="ts">
  import { toasts } from '$lib/stores/toast';
  import { slide } from 'svelte/transition';
</script>

<div class="fixed bottom-6 right-6 z-[200] flex flex-col gap-2 pointer-events-none">
  {#each $toasts as toast (toast.id)}
    <div
      class="glass-elevated px-4 py-3 text-sm flex items-center gap-3 min-w-[280px] max-w-[400px] pointer-events-auto"
      transition:slide={{ duration: 200 }}
      role="alert"
    >
      {#if toast.type === 'success'}
        <span class="text-[var(--color-green)] text-lg shrink-0">&#10003;</span>
      {:else if toast.type === 'error'}
        <span class="text-[var(--color-red)] text-lg shrink-0">&#10007;</span>
      {:else}
        <span class="text-[var(--color-blue)] text-lg shrink-0">&#8505;</span>
      {/if}
      <span class="text-[var(--color-fg)]">{toast.message}</span>
    </div>
  {/each}
</div>
```

---

## Form Validation UX

### Principles
- Validate on blur (not on every keystroke)
- Show errors below the field, not in a summary at top
- Use red border + error text + icon (three signals, not just color)
- Don't disable submit — let users click and show what's wrong
- Clear errors when the user starts typing in the field

### Pattern
```svelte
<script lang="ts">
  let value = $state('');
  let touched = $state(false);
  let error = $derived(touched && !value ? 'This field is required' : '');
</script>

<div>
  <label class="label-bh mb-1.5 block">Product title</label>
  <input
    class="input-bh {error ? 'border-[var(--color-red)]' : ''}"
    bind:value
    onblur={() => touched = true}
    oninput={() => { if (error) touched = true; }}
  />
  {#if error}
    <p class="text-xs text-[var(--color-red)] mt-1">{error}</p>
  {/if}
</div>
```

---

## Optimistic Updates

### Watchlist Toggle Example
```svelte
<script lang="ts">
  let isWatchlisted = $state(initialValue);
  let pending = $state(false);

  async function toggle() {
    const prev = isWatchlisted;
    isWatchlisted = !isWatchlisted; // optimistic
    pending = true;
    try {
      await api.toggleWatchlist(productId);
    } catch {
      isWatchlisted = prev; // revert
      toasts.error('Failed to update watchlist');
    } finally {
      pending = false;
    }
  }
</script>
```

### Key Rules
1. Update UI instantly — don't wait for the API
2. Store previous state for rollback
3. If API fails, revert UI and show error toast
4. Disable rapid re-clicking with a `pending` flag
5. Never optimistically update irreversible actions (bids, purchases)

---

## Countdown Timer Pattern

Used on product cards and detail pages for auction end times:

```svelte
<script lang="ts">
  let { endTime }: { endTime: string } = $props();
  let remaining = $state('');
  let urgent = $state(false);

  $effect(() => {
    const target = new Date(endTime).getTime();
    const tick = () => {
      const diff = target - Date.now();
      if (diff <= 0) { remaining = 'Ended'; return; }
      urgent = diff < 3600000; // < 1 hour
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      remaining = h > 0 ? `${h}h ${m}m ${s}s` : m > 0 ? `${m}m ${s}s` : `${s}s`;
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  });
</script>

<span class="label-bh {urgent ? 'text-[var(--color-red)]' : ''}">
  {remaining}
</span>
```
