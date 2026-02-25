import { Trend, Rate, Counter } from 'k6/metrics';

// Custom metrics for specific endpoint tracking
export const bidQueueDuration = new Trend('bid_queue_duration', true);
export const bidQueueErrors = new Rate('bid_queue_errors');
export const productListDuration = new Trend('product_list_duration', true);
export const productDetailDuration = new Trend('product_detail_duration', true);
export const loginDuration = new Trend('login_duration', true);
export const userLimitsDuration = new Trend('user_limits_duration', true);
export const searchDuration = new Trend('search_duration', true);
export const sseConnectDuration = new Trend('sse_connect_duration', true);
export const sseConnectionCount = new Counter('sse_connection_count');
export const dangerousEndpointDuration = new Trend('dangerous_endpoint_duration', true);

/**
 * Track a response for a named endpoint metric.
 */
export function track(metric, res) {
  metric.add(res.timings.duration);
}
