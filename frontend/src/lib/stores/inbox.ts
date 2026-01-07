import { writable } from 'svelte/store';

// Store for unread message count - shared between layout and inbox
function createUnreadStore() {
  const { subscribe, set, update } = writable(0);

  return {
    subscribe,
    set,
    decrement: (amount = 1) => update(n => Math.max(0, n - amount)),
    increment: (amount = 1) => update(n => n + amount),
    reset: () => set(0),
  };
}

export const unreadCountStore = createUnreadStore();

// Helper to trigger a refresh from anywhere
let refreshCallback: (() => void) | null = null;

export function setRefreshCallback(cb: () => void) {
  refreshCallback = cb;
}

export function triggerRefresh() {
  if (refreshCallback) {
    refreshCallback();
  }
}
