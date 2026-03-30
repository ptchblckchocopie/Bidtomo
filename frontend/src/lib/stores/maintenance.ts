import { writable } from 'svelte/store';
import { browser } from '$app/environment';

export interface MaintenanceStatus {
  enabled: boolean;
  scheduledAt: number | null;
  message: string;
}

const DEFAULT: MaintenanceStatus = { enabled: false, scheduledAt: null, message: '' };

function createMaintenanceStore() {
  const { subscribe, set, update } = writable<MaintenanceStatus>(DEFAULT);

  return {
    subscribe,
    set,
    update,

    /** Fetch current status from the bridge route */
    async fetch(): Promise<MaintenanceStatus> {
      if (!browser) return DEFAULT;
      try {
        const res = await fetch('/api/bridge/maintenance');
        if (!res.ok) return DEFAULT;
        const data: MaintenanceStatus = await res.json();
        set(data);
        return data;
      } catch {
        return DEFAULT;
      }
    },

    /** Toggle maintenance on/off (admin only) */
    async toggle(enabled: boolean, message = ''): Promise<boolean> {
      if (!browser) return false;
      try {
        const res = await fetch('/api/bridge/maintenance', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ enabled, message, scheduledAt: null }),
        });
        if (!res.ok) return false;
        const data = await res.json();
        set({ enabled: data.enabled, scheduledAt: data.scheduledAt, message: data.message });
        return true;
      } catch {
        return false;
      }
    },

    /** Schedule maintenance at a future time (admin only) */
    async schedule(scheduledAt: number, message = ''): Promise<boolean> {
      if (!browser) return false;
      try {
        const res = await fetch('/api/bridge/maintenance', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ enabled: false, scheduledAt, message }),
        });
        if (!res.ok) return false;
        const data = await res.json();
        set({ enabled: data.enabled, scheduledAt: data.scheduledAt, message: data.message });
        return true;
      } catch {
        return false;
      }
    },

    /** Cancel scheduled maintenance (admin only) */
    async cancel(): Promise<boolean> {
      if (!browser) return false;
      try {
        const res = await fetch('/api/bridge/maintenance', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ enabled: false, scheduledAt: null, message: '' }),
        });
        if (!res.ok) return false;
        set(DEFAULT);
        return true;
      } catch {
        return false;
      }
    },

    /** Handle SSE event */
    handleSSE(event: { type: string; enabled?: boolean; scheduledAt?: number; message?: string }) {
      if (event.type === 'maintenance_toggle') {
        set({
          enabled: Boolean(event.enabled),
          scheduledAt: null,
          message: event.message || '',
        });
      } else if (event.type === 'maintenance_scheduled') {
        set({
          enabled: false,
          scheduledAt: event.scheduledAt || null,
          message: event.message || '',
        });
      }
    },
  };
}

export const maintenanceStore = createMaintenanceStore();
