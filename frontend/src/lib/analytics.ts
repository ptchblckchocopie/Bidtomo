// User analytics tracking module
// Batches events and sends them to CMS via bridge route
// All failures are silently swallowed to never impact user experience

import { browser } from '$app/environment';

// Session ID: unique per browser tab, persisted in sessionStorage
function getSessionId(): string {
  if (!browser) return '';
  let id = sessionStorage.getItem('analytics_session_id');
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem('analytics_session_id', id);
  }
  return id;
}

// Device info: cached once per session
let cachedDeviceInfo: Record<string, any> | null = null;
function getDeviceInfo(): Record<string, any> {
  if (!browser) return {};
  if (cachedDeviceInfo) return cachedDeviceInfo;
  cachedDeviceInfo = {
    userAgent: navigator.userAgent,
    screenWidth: screen.width,
    screenHeight: screen.height,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    platform: navigator.platform,
    language: navigator.language,
    touchSupport: 'ontouchstart' in window || navigator.maxTouchPoints > 0,
  };
  return cachedDeviceInfo;
}

interface AnalyticsEvent {
  eventType: string;
  page?: string;
  metadata?: Record<string, any>;
  sessionId?: string;
  deviceInfo?: Record<string, any>;
  referrer?: string;
}

// Event queue
let eventQueue: AnalyticsEvent[] = [];
let flushTimer: ReturnType<typeof setInterval> | null = null;
const FLUSH_INTERVAL = 3000; // 3 seconds
const MAX_BATCH = 10;

function enqueue(event: AnalyticsEvent) {
  if (!browser) return;
  eventQueue.push(event);
  if (eventQueue.length >= MAX_BATCH) {
    flush();
  }
}

function flush() {
  if (!browser || eventQueue.length === 0) return;
  const batch = eventQueue.splice(0, MAX_BATCH);
  try {
    const payload = JSON.stringify({ events: batch });
    // Try sendBeacon first (works during page unload)
    const sent = navigator.sendBeacon('/api/bridge/analytics/track', new Blob([payload], { type: 'application/json' }));
    if (!sent) {
      // Fallback to fetch
      fetch('/api/bridge/analytics/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        credentials: 'include',
        keepalive: true,
      }).catch(() => {});
    }
  } catch {
    // Silently swallow all errors
  }
}

// Start flush timer and visibility listener
function init() {
  if (!browser) return;
  if (flushTimer) return; // Already initialized
  flushTimer = setInterval(flush, FLUSH_INTERVAL);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      flush();
    }
  });
}

function buildEvent(eventType: string, metadata?: Record<string, any>): AnalyticsEvent {
  init();
  return {
    eventType,
    page: browser ? window.location.pathname : undefined,
    metadata,
    sessionId: getSessionId(),
    deviceInfo: getDeviceInfo(),
    referrer: browser ? document.referrer : undefined,
  };
}

// Convenience tracking functions

export function trackPageView(path?: string) {
  const event = buildEvent('page_view');
  if (path) event.page = path;
  enqueue(event);
}

export function trackLogin() {
  enqueue(buildEvent('login'));
}

export function trackLoginFailed() {
  enqueue(buildEvent('login_failed'));
}

export function trackLogout() {
  enqueue(buildEvent('logout'));
}

export function trackRegister() {
  enqueue(buildEvent('register'));
}

export function trackSearch(query: string, filters?: Record<string, any>, resultCount?: number) {
  enqueue(buildEvent('search', { query, filters, resultCount }));
}

export function trackProductView(productId: string | number, title?: string) {
  enqueue(buildEvent('product_view', { productId, title }));
}

export function trackConversationOpened(productId: string | number) {
  enqueue(buildEvent('conversation_opened', { productId }));
}

export function trackUserProfileViewed(userId: string | number) {
  enqueue(buildEvent('user_profile_viewed', { userId }));
}

export function trackMediaUploaded(mediaId?: string | number) {
  enqueue(buildEvent('media_uploaded', { mediaId }));
}
