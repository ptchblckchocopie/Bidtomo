import { writable } from 'svelte/store';

export interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info' | 'warning';
  duration: number;
}

const { subscribe, update } = writable<Toast[]>([]);

let counter = 0;

export function addToast(
  message: string,
  type: Toast['type'] = 'info',
  duration = 4000
): string {
  const id = `toast-${++counter}-${Date.now()}`;
  const toast: Toast = { id, message, type, duration };

  update((toasts) => [...toasts, toast]);

  if (duration > 0) {
    setTimeout(() => dismissToast(id), duration);
  }

  return id;
}

export function dismissToast(id: string): void {
  update((toasts) => toasts.filter((t) => t.id !== id));
}

export const toastStore = { subscribe };
