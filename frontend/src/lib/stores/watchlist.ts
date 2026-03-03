import { writable, get } from 'svelte/store';
import { fetchWatchlist, addToWatchlist, removeFromWatchlist } from '$lib/api';

interface WatchlistState {
  /** Map of productId → watchlistItemId for O(1) lookup */
  items: Map<string, string>;
  loaded: boolean;
}

function createWatchlistStore() {
  const { subscribe, set, update } = writable<WatchlistState>({
    items: new Map(),
    loaded: false,
  });

  return {
    subscribe,

    async load() {
      try {
        const result = await fetchWatchlist({ limit: 500 });
        const items = new Map<string, string>();
        for (const doc of result.docs) {
          const productId = typeof doc.product === 'object' ? doc.product?.id : doc.product;
          if (productId) {
            items.set(String(productId), String(doc.id));
          }
        }
        set({ items, loaded: true });
      } catch {
        set({ items: new Map(), loaded: true });
      }
    },

    async add(productId: string) {
      const result = await addToWatchlist(productId);
      if (result) {
        update((state) => {
          state.items.set(productId, String(result.id));
          return { ...state, items: new Map(state.items) };
        });
        return true;
      }
      return false;
    },

    async remove(productId: string) {
      const state = get({ subscribe });
      const itemId = state.items.get(productId);
      if (!itemId) return false;

      const success = await removeFromWatchlist(itemId);
      if (success) {
        update((state) => {
          state.items.delete(productId);
          return { ...state, items: new Map(state.items) };
        });
        return true;
      }
      return false;
    },

    isWatched(productId: string): boolean {
      return get({ subscribe }).items.has(productId);
    },

    reset() {
      set({ items: new Map(), loaded: false });
    },
  };
}

export const watchlistStore = createWatchlistStore();
