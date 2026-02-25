#!/usr/bin/env node

/**
 * SSE Load Generator — companion to k6 for proper SSE event verification.
 * Uses native EventSource to open real SSE connections and track event delivery.
 *
 * Usage:
 *   SSE_URL=http://localhost:3002 CONNECTIONS=50 DURATION_S=60 node sse-load.js
 *
 * Output: JSON metrics to stdout every 10 seconds + final summary.
 */

const EventSource = require('eventsource');

const SSE_URL = process.env.SSE_URL || 'http://localhost:3002';
const CONNECTIONS = parseInt(process.env.CONNECTIONS) || 50;
const DURATION_S = parseInt(process.env.DURATION_S) || 60;

// Try to load seed data for product-specific endpoints
let seedData = null;
try {
  seedData = require('./seed-data.json');
} catch { /* no seed data, use global only */ }

const metrics = {
  connectionsOpened: 0,
  connectionsActive: 0,
  connectionsFailed: 0,
  eventsReceived: 0,
  heartbeatsReceived: 0,
  errors: 0,
  startTime: Date.now(),
  eventLatencies: [],
};

const connections = [];

function getEndpoint(index) {
  const endpoints = [`${SSE_URL}/events/global`];

  if (seedData && seedData.products) {
    seedData.products.forEach((p) => {
      endpoints.push(`${SSE_URL}/events/products/${p.id}`);
    });
  }

  return endpoints[index % endpoints.length];
}

function openConnection(index) {
  const url = getEndpoint(index);
  const es = new EventSource(url);

  es.onopen = () => {
    metrics.connectionsOpened++;
    metrics.connectionsActive++;
  };

  es.onmessage = (event) => {
    metrics.eventsReceived++;
    try {
      const data = JSON.parse(event.data);
      if (data.type === 'heartbeat' || data.heartbeat) {
        metrics.heartbeatsReceived++;
      }
    } catch { /* non-JSON event */ }
  };

  es.onerror = (err) => {
    metrics.errors++;
    if (es.readyState === EventSource.CLOSED) {
      metrics.connectionsActive--;
      metrics.connectionsFailed++;
    }
  };

  connections.push(es);
}

function printMetrics() {
  const elapsed = ((Date.now() - metrics.startTime) / 1000).toFixed(1);
  console.log(JSON.stringify({
    elapsed_s: parseFloat(elapsed),
    connections_active: metrics.connectionsActive,
    connections_opened: metrics.connectionsOpened,
    connections_failed: metrics.connectionsFailed,
    events_received: metrics.eventsReceived,
    heartbeats: metrics.heartbeatsReceived,
    errors: metrics.errors,
  }));
}

function cleanup() {
  console.log('\n=== SSE LOAD TEST SUMMARY ===');
  console.log(`Duration: ${DURATION_S}s`);
  console.log(`Target connections: ${CONNECTIONS}`);
  console.log(`Connections opened: ${metrics.connectionsOpened}`);
  console.log(`Connections active at end: ${metrics.connectionsActive}`);
  console.log(`Connections failed: ${metrics.connectionsFailed}`);
  console.log(`Events received: ${metrics.eventsReceived}`);
  console.log(`Heartbeats received: ${metrics.heartbeatsReceived}`);
  console.log(`Errors: ${metrics.errors}`);
  console.log(`Success rate: ${((1 - metrics.connectionsFailed / Math.max(1, metrics.connectionsOpened)) * 100).toFixed(1)}%`);

  // Close all connections
  connections.forEach((es) => es.close());
  process.exit(0);
}

// Ramp up connections gradually (10 per second)
console.log(`Opening ${CONNECTIONS} SSE connections to ${SSE_URL} over ${Math.ceil(CONNECTIONS / 10)}s...`);

let opened = 0;
const rampInterval = setInterval(() => {
  const batch = Math.min(10, CONNECTIONS - opened);
  for (let i = 0; i < batch; i++) {
    openConnection(opened + i);
  }
  opened += batch;

  if (opened >= CONNECTIONS) {
    clearInterval(rampInterval);
    console.log(`All ${CONNECTIONS} connections opened. Holding for ${DURATION_S}s...`);
  }
}, 1000);

// Print metrics every 10 seconds
const metricsInterval = setInterval(printMetrics, 10000);

// Stop after duration
setTimeout(() => {
  clearInterval(metricsInterval);
  printMetrics();
  cleanup();
}, DURATION_S * 1000);

process.on('SIGINT', cleanup);
