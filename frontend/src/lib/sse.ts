import { writable, type Writable } from 'svelte/store';
import { browser } from '$app/environment';
import { env } from '$env/dynamic/public';
import { getAuthToken } from './stores/auth';

// Dynamically determine SSE URL based on current hostname
function getSseUrl(): string {
  // Use SvelteKit's dynamic public env (gracefully handles missing variable)
  if (env.PUBLIC_SSE_URL) {
    return env.PUBLIC_SSE_URL.replace(/\/+$/, ''); // Strip trailing slashes
  }
  // Fallback for development
  if (browser && typeof window !== 'undefined') {
    // In production, use same origin with /api/sse path
    if (window.location.protocol === 'https:') {
      return `${window.location.origin}/api/sse`;
    }
    return `http://${window.location.hostname}:3002`;
  }
  return 'http://localhost:3002';
}


const SSE_URL = getSseUrl();

// Connection states
export type SSEConnectionState = 'connecting' | 'connected' | 'disconnected' | 'error';

// Event types
export interface BidEvent {
  type: 'bid';
  success: boolean;
  bidId?: number;
  amount?: number;
  bidderId?: number;
  bidderName?: string;
  censorName?: boolean;
  bidTime?: string;
  error?: string;
  timestamp: number;
}

export interface MessageEvent {
  type: 'new_message';
  messageId: number;
  productId: number;
  senderId: number;
  preview?: string;
  timestamp: number;
  // Full message data for instant display (no extra HTTP request needed)
  message?: {
    id: string;
    message: string;
    sender: { id: string; name?: string; email?: string };
    receiver: { id: string };
    product: { id: string };
    read: boolean;
    createdAt: string;
    updatedAt: string;
  };
}

export interface RedisStatusEvent {
  type: 'redis_status';
  connected: boolean;
}

export interface ConnectedEvent {
  type: 'connected';
  productId?: string;
  userId?: string;
  redis?: 'connected' | 'disconnected';
  fallbackPolling?: boolean;
}

export interface AcceptedEvent {
  type: 'accepted';
  success: boolean;
  status: 'sold';
  winnerId?: number;
  amount?: number;
  error?: string;
  timestamp: number;
}

export interface TypingEvent {
  type: 'typing';
  productId: number;
  userId: number;
  isTyping: boolean;
  timestamp: number;
}

export interface NewProductEvent {
  type: 'new_product';
  product: {
    id: string | number;
    title: string;
    startingPrice: number;
    auctionEndDate: string;
    status: string;
    region?: string;
    city?: string;
    seller: { id: string | number; name?: string };
    images?: any[];
  };
  timestamp: number;
}

export interface BidUpdateEvent {
  type: 'bid';
  productId: number;
  success: boolean;
  amount?: number;
  bidderId?: number;
  bidderName?: string;
  timestamp: number;
}

export type SSEEvent = BidEvent | MessageEvent | RedisStatusEvent | ConnectedEvent | AcceptedEvent | TypingEvent | NewProductEvent | BidUpdateEvent;

// Product SSE client
class ProductSSEClient {
  private eventSource: EventSource | null = null;
  private productId: string;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 20;
  private reconnectDelay = 500;
  private maxReconnectDelay = 10000;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private listeners: Set<(event: SSEEvent) => void> = new Set();
  private fallbackPolling = false;
  private pollingInterval: ReturnType<typeof setInterval> | null = null;

  public state: Writable<SSEConnectionState> = writable('disconnected');
  public lastBid: Writable<BidEvent | null> = writable(null);
  public redisConnected: Writable<boolean> = writable(true);

  constructor(productId: string) {
    this.productId = productId;
  }

  connect(): void {
    if (!browser) return;
    if (this.eventSource) return;

    this.state.set('connecting');

    try {
      this.eventSource = new EventSource(`${SSE_URL}/events/products/${this.productId}`);

      this.eventSource.onopen = () => {
        this.state.set('connected');
        this.reconnectAttempts = 0;
        this.stopFallbackPolling();
      };

      this.eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as SSEEvent;

          // Handle different event types
          if (data.type === 'connected') {
            if ((data as ConnectedEvent).fallbackPolling) {
              this.startFallbackPolling();
            }
            if ((data as ConnectedEvent).redis === 'disconnected') {
              this.redisConnected.set(false);
            }
          } else if (data.type === 'redis_status') {
            this.redisConnected.set((data as RedisStatusEvent).connected);
            if (!(data as RedisStatusEvent).connected) {
              this.startFallbackPolling();
            } else {
              this.stopFallbackPolling();
            }
          } else if (data.type === 'bid') {
            this.lastBid.set(data as BidEvent);
          }

          // Notify all listeners
          this.listeners.forEach((listener) => listener(data));
        } catch {
          // Silently ignore parse errors
        }
      };

      this.eventSource.onerror = () => {
        this.state.set('error');
        this.handleReconnect();
      };
    } catch {
      this.state.set('error');
      this.startFallbackPolling();
    }
  }

  private handleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.startFallbackPolling();
      return;
    }

    this.eventSource?.close();
    this.eventSource = null;

    // Clear any existing reconnect timer to prevent race conditions
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    const delay = Math.min(this.reconnectDelay * Math.pow(2, this.reconnectAttempts), this.maxReconnectDelay);
    // Add jitter (0-25% of delay) to prevent thundering herd
    const jitter = Math.random() * delay * 0.25;
    this.reconnectAttempts++;

    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay + jitter);
  }

  private startFallbackPolling(): void {
    if (this.fallbackPolling) return;
    this.fallbackPolling = true;

    this.pollingInterval = setInterval(async () => {
      try {
        // Use bridge endpoint instead of direct CMS access
        const response = await fetch(`/api/bridge/products/${this.productId}/status`);

        if (response.ok) {
          const data = await response.json();
          const event: SSEEvent = {
            type: 'bid',
            success: true,
            amount: data.currentBid,
            timestamp: Date.now(),
          };
          this.listeners.forEach((listener) => listener(event));
        }
      } catch {
        // Silently ignore polling errors
      }
    }, 5000); // Poll every 5 seconds
  }

  private stopFallbackPolling(): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
    this.fallbackPolling = false;
  }

  subscribe(callback: (event: SSEEvent) => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }

    this.stopFallbackPolling();
    this.state.set('disconnected');
    this.listeners.clear();
  }
}

// User SSE client for message notifications
class UserSSEClient {
  private eventSource: EventSource | null = null;
  private userId: string;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 20;
  private reconnectDelay = 500;
  private maxReconnectDelay = 10000;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private listeners: Set<(event: SSEEvent) => void> = new Set();

  public state: Writable<SSEConnectionState> = writable('disconnected');
  public lastMessage: Writable<MessageEvent | null> = writable(null);
  public unreadCount: Writable<number> = writable(0);

  constructor(userId: string) {
    this.userId = userId;
  }

  connect(): void {
    if (!browser) return;
    if (this.eventSource) return;

    this.state.set('connecting');

    try {
      const token = getAuthToken();
      const tokenParam = token ? `?token=${encodeURIComponent(token)}` : '';
      this.eventSource = new EventSource(`${SSE_URL}/events/users/${this.userId}${tokenParam}`);

      this.eventSource.onopen = () => {
        this.state.set('connected');
        this.reconnectAttempts = 0;
      };

      this.eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as SSEEvent;

          if (data.type === 'new_message') {
            this.lastMessage.set(data as MessageEvent);
            this.unreadCount.update((n) => n + 1);
          }

          this.listeners.forEach((listener) => listener(data));
        } catch {
          // Silently ignore parse errors
        }
      };

      this.eventSource.onerror = () => {
        this.state.set('error');
        this.handleReconnect();
      };
    } catch {
      this.state.set('error');
    }
  }

  private handleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      return;
    }

    this.eventSource?.close();
    this.eventSource = null;

    // Clear any existing reconnect timer to prevent race conditions
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    const delay = Math.min(this.reconnectDelay * Math.pow(2, this.reconnectAttempts), this.maxReconnectDelay);
    const jitter = Math.random() * delay * 0.25;
    this.reconnectAttempts++;

    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay + jitter);
  }

  subscribe(callback: (event: SSEEvent) => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  resetUnreadCount(): void {
    this.unreadCount.set(0);
  }

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }

    this.state.set('disconnected');
    this.listeners.clear();
  }
}

// Global SSE client for dashboard updates (new products, bid updates across all products)
class GlobalSSEClient {
  private eventSource: EventSource | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 20;
  private reconnectDelay = 500;
  private maxReconnectDelay = 10000;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private listeners: Set<(event: SSEEvent) => void> = new Set();

  public state: Writable<SSEConnectionState> = writable('disconnected');

  connect(): void {
    if (!browser) return;
    if (this.eventSource) return;

    this.state.set('connecting');

    try {
      this.eventSource = new EventSource(`${SSE_URL}/events/global`);

      this.eventSource.onopen = () => {
        this.state.set('connected');
        this.reconnectAttempts = 0;
      };

      this.eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as SSEEvent;
          this.listeners.forEach((listener) => listener(data));
        } catch {
          // Silently ignore parse errors
        }
      };

      this.eventSource.onerror = () => {
        this.state.set('error');
        this.handleReconnect();
      };
    } catch {
      this.state.set('error');
    }
  }

  private handleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      return;
    }

    this.eventSource?.close();
    this.eventSource = null;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    const delay = Math.min(this.reconnectDelay * Math.pow(2, this.reconnectAttempts), this.maxReconnectDelay);
    const jitter = Math.random() * delay * 0.25;
    this.reconnectAttempts++;

    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay + jitter);
  }

  subscribe(callback: (event: SSEEvent) => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }

    this.state.set('disconnected');
    this.listeners.clear();
  }
}

// Singleton managers for SSE connections
const productClients = new Map<string, ProductSSEClient>();
const userClients = new Map<string, UserSSEClient>();
let globalClient: GlobalSSEClient | null = null;

export function getProductSSE(productId: string): ProductSSEClient {
  if (!productClients.has(productId)) {
    productClients.set(productId, new ProductSSEClient(productId));
  }
  return productClients.get(productId)!;
}

export function getUserSSE(userId: string): UserSSEClient {
  if (!userClients.has(userId)) {
    userClients.set(userId, new UserSSEClient(userId));
  }
  return userClients.get(userId)!;
}

export function disconnectProductSSE(productId: string): void {
  const client = productClients.get(productId);
  if (client) {
    client.disconnect();
    productClients.delete(productId);
  }
}

export function disconnectUserSSE(userId: string): void {
  const client = userClients.get(userId);
  if (client) {
    client.disconnect();
    userClients.delete(userId);
  }
}

export function getGlobalSSE(): GlobalSSEClient {
  if (!globalClient) {
    globalClient = new GlobalSSEClient();
  }
  return globalClient;
}

export function disconnectGlobalSSE(): void {
  if (globalClient) {
    globalClient.disconnect();
    globalClient = null;
  }
}

export function disconnectAll(): void {
  productClients.forEach((client) => client.disconnect());
  productClients.clear();
  userClients.forEach((client) => client.disconnect());
  userClients.clear();
  disconnectGlobalSSE();
}

// Queue bid helper
export async function queueBid(
  productId: string | number,
  amount: number,
  censorName: boolean = false
): Promise<{ success: boolean; jobId?: string; bidId?: number; error?: string; fallback?: boolean }> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;

  try {
    // Use bridge endpoint instead of direct CMS access
    const response = await fetch('/api/bridge/bid/queue', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `JWT ${token}` } : {}),
      },
      body: JSON.stringify({
        productId: typeof productId === 'string' ? parseInt(productId, 10) : productId,
        amount,
        censorName,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return { success: false, error: data.error || 'Failed to queue bid' };
    }

    return data;
  } catch (error) {
    return { success: false, error: String(error) };
  }
}
