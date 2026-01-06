# Real-Time Architecture Plan: SSE + Redis

## Overview

This document outlines the plan to convert from polling to Server-Sent Events (SSE) for:
1. **Bidding updates** - Real-time bid notifications on product pages
2. **Messaging** - Real-time chat between buyers and sellers

Additionally, it covers:
- Redis queue for bid race condition prevention
- Separate SSE service architecture
- Improved development scripts

---

## Current State

| Component | Status | Details |
|-----------|--------|---------|
| Backend SSE Endpoint | Partially Implemented | `/api/products/:id/stream` exists but embedded in Payload |
| Bid Processing | Direct DB writes | No queue, potential race conditions |
| Messaging | Polling only | No real-time updates |
| Redis | Not used | Available in docker-compose (redis_dev) |
| Start Script | Basic | Logs to files, no live view |

---

## Architecture Overview

### Proposed Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                           FRONTEND                                   │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐     │
│  │ Product Page    │  │ Messages Page   │  │ Browse Page     │     │
│  │ (SSE: bids)     │  │ (SSE: messages) │  │ (SSE: updates)  │     │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘     │
└───────────┼─────────────────────┼─────────────────────┼─────────────┘
            │                     │                     │
            │ EventSource         │ EventSource         │ EventSource
            ▼                     ▼                     ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      SSE SERVICE (Port 3002)                         │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                    Connection Manager                         │   │
│  │  • Product listeners: Map<productId, Set<Response>>          │   │
│  │  • User listeners: Map<userId, Set<Response>>                │   │
│  │  • Heartbeat management                                       │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                              │                                       │
│                    Redis Pub/Sub Subscribe                          │
│                              │                                       │
└──────────────────────────────┼───────────────────────────────────────┘
                               │
┌──────────────────────────────┼───────────────────────────────────────┐
│                         REDIS                                        │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐      │
│  │ Bid Queue       │  │ Product PubSub  │  │ User PubSub     │      │
│  │ "bids:pending"  │  │ "sse:product:*" │  │ "sse:user:*"    │      │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘      │
└──────────────────────────────┬───────────────────────────────────────┘
                               │
            ┌──────────────────┴──────────────────┐
            │                                      │
            ▼                                      ▼
┌───────────────────────┐            ┌───────────────────────┐
│  BID WORKER SERVICE   │            │   PAYLOAD CMS         │
│  (Port 3003)          │            │   (Port 3001)         │
│                       │            │                       │
│  • Consumes bid queue │            │  • REST API           │
│  • Validates bids     │            │  • Admin panel        │
│  • Updates DB         │            │  • Publishes events   │
│  • Publishes SSE      │            │    to Redis           │
│  • Single threaded    │            │                       │
│    (no race condition)│            │                       │
└───────────────────────┘            └───────────────────────┘
            │                                      │
            └──────────────────┬───────────────────┘
                               ▼
                    ┌─────────────────┐
                    │   PostgreSQL    │
                    │   (Port 5432)   │
                    └─────────────────┘
```

---

## Component Details

### 1. SSE Service (New - Port 3002)

**Purpose**: Dedicated service for managing SSE connections, separate from Payload CMS.

**Why separate from Payload?**
- Payload runs with webpack dev middleware (heavy)
- SSE connections are long-lived, need lightweight handling
- Easier to scale independently
- No interference with Payload's request handling
- Can run multiple instances behind load balancer

**Responsibilities**:
- Manage SSE connections for products and users
- Subscribe to Redis pub/sub channels
- Broadcast events to connected clients
- Handle heartbeats and connection cleanup

**File**: `services/sse-service/index.ts`

```
Endpoints:
  GET /events/products/:id    - Subscribe to product updates (bids)
  GET /events/users/:id       - Subscribe to user updates (messages)
  GET /events/health          - Health check

Redis Subscriptions:
  Channel: "sse:product:{productId}" - Bid updates
  Channel: "sse:user:{userId}"       - Message notifications
```

---

### 2. Bid Worker Service (New - Port 3003)

**Purpose**: Process bids sequentially from Redis queue to prevent race conditions.

**Why a separate queue?**
- Current problem: Two users bid simultaneously, both read same currentBid, both succeed
- Solution: Single-threaded worker processes bids one at a time
- Guarantees bid validation against latest state

**File**: `services/bid-worker/index.ts`

```
Flow:
1. Frontend POST /api/bids → Payload
2. Payload pushes to Redis queue "bids:pending"
3. Bid Worker pops from queue (BLPOP - blocking)
4. Worker validates: amount > currentBid + interval
5. Worker updates DB (product.currentBid, create bid)
6. Worker publishes to Redis: "sse:product:{id}"
7. SSE Service broadcasts to connected clients

Queue Structure (Redis List):
  Key: "bids:pending"
  Value: JSON { productId, bidderId, amount, timestamp }
```

---

### 3. Redis Configuration

**Services using Redis**:

| Service | Redis Usage | Purpose |
|---------|-------------|---------|
| Payload CMS | LPUSH to queue | Enqueue new bids |
| Payload CMS | PUBLISH | Publish message events |
| Bid Worker | BLPOP from queue | Process bids sequentially |
| Bid Worker | PUBLISH | Publish bid events |
| SSE Service | SUBSCRIBE | Receive all events |

**Redis Data Structures**:

```
# Bid Queue (List)
bids:pending = [
  {"productId": 1, "bidderId": 2, "amount": 150, "ts": 1234567890},
  {"productId": 1, "bidderId": 3, "amount": 160, "ts": 1234567891}
]

# Pub/Sub Channels
sse:product:{productId}  - Bid updates for a product
sse:user:{userId}        - Message notifications for a user
sse:global               - System-wide announcements
```

---

### 4. Messaging with SSE (Simplified)

**Current State**: Polling every few seconds for new messages

**Simplified Approach**: Use the same SSE infrastructure as bids - no separate queues or services needed.

**Flow**:

```
1. User A sends message to User B
   POST /api/messages → Payload (normal creation)

2. Payload afterChange hook:
   - Message saved to DB (default behavior)
   - PUBLISH to Redis: "sse:user:{receiverId}"
     { type: "message", from: senderId, productId, preview }

3. SSE Service (same one used for bids):
   - Already subscribed to Redis
   - Routes to User B's connection
   - Sends: data: {"type":"message",...}

4. User B's browser:
   - EventSource receives event
   - Show notification badge / append to chat
```

**Why this is simpler**:
- No message queue needed (messages don't have race conditions)
- Same SSE service handles both bids and messages
- Same Redis instance, just different channels
- Payload handles message storage normally

---

## Why Single Redis Works for Both Bids and Messages

```
┌─────────────────────────────────────┐
│            REDIS (6379)             │
│                                     │
│  • bids:pending (LIST)              │  ← Queue for bid processing
│  • sse:product:* (PUB/SUB)          │  ← Bid update broadcasts
│  • sse:user:* (PUB/SUB)             │  ← Message notifications
└─────────────────────────────────────┘
```

**Key insight**: Bids need a queue (race conditions), messages don't.

| Feature | Bids | Messages |
|---------|------|----------|
| Race condition risk | Yes (simultaneous bids) | No (just notifications) |
| Needs queue | Yes (Redis LIST) | No (direct pub/sub) |
| Processing | Bid Worker service | Payload hook only |
| SSE channel | `sse:product:{id}` | `sse:user:{id}` |

**Why NOT separate Redis for messages**:
- Messages have no race conditions (just insert and notify)
- Pub/sub is non-blocking (won't interfere with bid queue)
- Same SSE service can handle both channel types
- Less infrastructure = easier to maintain

---

## Implementation Phases

### Phase 1: Infrastructure Setup
- [ ] Add Redis to docker-compose.yml (already exists as redis_dev)
- [ ] Create SSE service boilerplate
- [ ] Create Bid worker service boilerplate
- [ ] Update start.sh.local for new services

### Phase 2: Bid Queue Implementation
- [ ] Modify Payload bid hook to push to Redis queue
- [ ] Implement bid worker with validation logic
- [ ] Add Redis pub/sub for bid events
- [ ] Connect SSE service to Redis

### Phase 3: Frontend SSE Integration
- [ ] Create SSE client utility (`frontend/src/lib/sse.ts`)
- [ ] Update product detail page to use SSE
- [ ] Add fallback polling (30s interval)
- [ ] Handle reconnection logic

### Phase 4: Messaging SSE (Simplified)
- [ ] Add Redis PUBLISH to Payload message afterChange hook
- [ ] Add user channel subscription to SSE service (already built)
- [ ] Update messages page to listen for SSE events
- [ ] Add notification badge component

### Phase 5: Production Readiness
- [ ] Add health checks for all services
- [ ] Implement graceful shutdown
- [ ] Add monitoring/logging
- [ ] Load testing

---

## File Structure

```
marketplace-platform/
├── cms/                          # Payload CMS (existing)
│   └── src/
│       ├── server.ts             # MODIFY: Remove SSE, add Redis publish
│       └── payload.config.ts     # MODIFY: Bid hook → Redis queue
│
├── services/                     # NEW: Microservices
│   ├── sse-service/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts          # Express server with SSE
│   │       ├── connections.ts    # Connection manager
│   │       └── redis.ts          # Redis subscriber
│   │
│   └── bid-worker/
│       ├── package.json
│       ├── tsconfig.json
│       └── src/
│           ├── index.ts          # Worker entry
│           ├── processor.ts      # Bid processing logic
│           └── redis.ts          # Redis queue consumer
│
├── frontend/                     # SvelteKit (existing)
│   └── src/
│       └── lib/
│           └── sse.ts            # NEW: SSE client utility
│
├── docker-compose.yml            # MODIFY: Add new services
└── start.sh.local                # MODIFY: Start all services
```

---

## Improved start.sh.local

```bash
#!/bin/bash
# Features:
# - Colored output per service
# - Live interleaved logs
# - Health checks before "ready"
# - Redis connection verification
# - Graceful shutdown of all services
# - Port conflict detection

Services to start:
1. Redis (if not using docker)
2. PostgreSQL check
3. Payload CMS (port 3001)
4. SSE Service (port 3002)
5. Bid Worker (port 3003)
6. Frontend (port 5173)

Log display:
- Use 'multitail' or custom solution
- Color code by service:
  - CMS: Blue
  - SSE: Green
  - Worker: Yellow
  - Frontend: Cyan
- Show service name prefix: [CMS] [SSE] [WORKER] [FRONTEND]
```

---

## Environment Variables

### New Variables Needed

```env
# Redis
REDIS_URL=redis://localhost:6379

# SSE Service
SSE_PORT=3002
SSE_CORS_ORIGIN=http://localhost:5173

# Bid Worker
BID_WORKER_CONCURRENCY=1  # Keep at 1 to prevent race conditions

# Frontend
PUBLIC_SSE_URL=http://localhost:3002
```

---

## API Changes

### Payload CMS Changes

**Before** (current):
```typescript
// Bid afterChange hook
afterChange: async ({ doc }) => {
  // Direct DB update
  await payload.update({ collection: 'products', ... });
  // Direct SSE broadcast (embedded)
  broadcastProductUpdate(productId);
}
```

**After** (proposed):
```typescript
// Bid beforeChange hook - push to queue
beforeChange: async ({ data }) => {
  await redis.lpush('bids:pending', JSON.stringify({
    productId: data.product,
    bidderId: data.bidder,
    amount: data.amount,
    timestamp: Date.now()
  }));
  // Don't create bid yet - worker will do it
  throw new Error('BID_QUEUED'); // Prevent direct creation
}

// New endpoint to check bid status
GET /api/bids/status/:queueId
```

### New SSE Endpoints

```
SSE Service (port 3002):

GET /events/products/:productId
  - Headers: Accept: text/event-stream
  - Events: { type: "bid", data: { currentBid, bidder, timestamp } }

GET /events/users/:userId
  - Headers: Accept: text/event-stream
  - Auth: Bearer token required
  - Events: { type: "message", data: { from, preview, productId } }
```

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Redis down | Fallback to direct processing + polling |
| SSE Service down | Frontend falls back to polling |
| Bid Worker down | Bids queue up, process when back |
| High latency | Queue TTL, reject stale bids |
| Memory leak (SSE) | Connection timeout, heartbeat cleanup |

---

## Testing Checklist

- [ ] Bid race condition test (2 simultaneous bids)
- [ ] SSE reconnection after network drop
- [ ] Message delivery in < 500ms
- [ ] 100 concurrent SSE connections
- [ ] Redis failover handling
- [ ] Worker restart with pending bids
- [ ] Frontend fallback when SSE unavailable

---

## Estimated Effort

| Component | New Files | Lines of Code | Complexity |
|-----------|-----------|---------------|------------|
| SSE Service | 4 | ~300 | Medium |
| Bid Worker | 4 | ~250 | Medium |
| Frontend SSE Client | 1 | ~100 | Low |
| Payload Modifications | 0 | ~50 changes | Low |
| Message Hook (Redis pub) | 0 | ~10 lines | Very Low |
| start.sh.local | 0 | ~100 changes | Low |
| Docker Compose | 0 | ~40 changes | Low |

**Total**: ~800 lines of new code + modifications

---

## Summary: Simplified Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Frontend   │────▶│ SSE Service │◀────│    Redis    │
│             │     │  (3002)     │     │   Pub/Sub   │
└─────────────┘     └─────────────┘     └──────┬──────┘
                                               │
                    ┌──────────────────────────┼──────────────────────────┐
                    │                          │                          │
                    ▼                          ▼                          ▼
            ┌───────────────┐          ┌───────────────┐          ┌───────────────┐
            │  Bid Worker   │          │  Payload CMS  │          │  Payload CMS  │
            │  (3003)       │          │  (bid hook)   │          │  (msg hook)   │
            │               │          │               │          │               │
            │ BLPOP queue   │          │ LPUSH bid     │          │ PUBLISH msg   │
            │ Validate      │          │ to queue      │          │ notification  │
            │ Update DB     │          │               │          │               │
            │ PUBLISH event │          │               │          │               │
            └───────────────┘          └───────────────┘          └───────────────┘
```

**Bids**: Queue → Worker → Validate → DB → Publish → SSE
**Messages**: DB Insert → Publish → SSE (no queue needed)
