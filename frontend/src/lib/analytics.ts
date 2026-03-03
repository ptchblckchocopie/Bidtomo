// User analytics tracking module
// Batches events and sends them to CMS via bridge route
// All failures are silently swallowed to never impact user experience

import { browser } from '$app/environment';
import { getAuthToken } from './stores/auth';

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

function flush(useBeacon = false) {
  if (!browser || eventQueue.length === 0) return;
  const batch = eventQueue.splice(0, MAX_BATCH);
  try {
    const body = JSON.stringify({ events: batch });
    const token = getAuthToken();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    if (useBeacon) {
      // sendBeacon for page unload — can't set custom headers, token may be missing
      navigator.sendBeacon('/api/bridge/analytics/track', new Blob([body], { type: 'application/json' }));
    } else {
      fetch('/api/bridge/analytics/track', {
        method: 'POST',
        headers,
        body,
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
      flush(true); // Use sendBeacon for page unload reliability
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
