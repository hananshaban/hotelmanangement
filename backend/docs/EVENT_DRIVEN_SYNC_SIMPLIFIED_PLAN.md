# Event-Driven Sync - Simplified Implementation Plan (Quick Demo)

## Overview

Minimal implementation to demonstrate two-queue event-driven sync:
- **Inbound**: Beds24 webhook → RabbitMQ → Worker → PMS
- **Outbound**: PMS action → RabbitMQ → Worker → Beds24 API
- **Event Persistence**: `channel_events` for dedupe/DLQ
- **Basic Admin**: DLQ listing and retry

---

## Phase 1: Database Schema (Minimal)

### 1.1 Create `channel_events` Table

**Purpose**: Store all events for deduplication and DLQ

**Schema**:
```sql
CREATE TABLE channel_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    property_id UUID NOT NULL REFERENCES hotel_settings(id) ON DELETE CASCADE,
    direction VARCHAR(10) NOT NULL CHECK (direction IN ('inbound', 'outbound')),
    event_type VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50) NOT NULL, -- 'booking', 'availability'
    entity_external_id VARCHAR(255), -- Beds24 ID
    entity_internal_id UUID, -- PMS ID
    idempotency_key VARCHAR(255) NOT NULL,
    payload JSONB NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'processing', 'done', 'failed')),
    attempts INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 3,
    last_error TEXT,
    received_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMP WITH TIME ZONE
);

CREATE UNIQUE INDEX idx_channel_events_idempotency ON channel_events(idempotency_key);
CREATE INDEX idx_channel_events_status ON channel_events(status, received_at);
CREATE INDEX idx_channel_events_external_id ON channel_events(entity_external_id);
```

**Migration**: `20250101000001_create_channel_events.ts`

**Tasks**:
- [ ] Create migration
- [ ] Add table and indexes
- [ ] Add down migration

---

### 1.2 Create `channel_mappings` Table (Simplified)

**Purpose**: Store room mappings (reuse existing `rooms.beds24_room_id` for now, but add table for future)

**Schema**:
```sql
CREATE TABLE channel_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    property_id UUID NOT NULL REFERENCES hotel_settings(id) ON DELETE CASCADE,
    mapping_type VARCHAR(50) NOT NULL CHECK (mapping_type IN ('room', 'room_type')),
    internal_id UUID NOT NULL,
    external_id VARCHAR(255) NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(property_id, mapping_type, internal_id)
);

CREATE INDEX idx_channel_mappings_lookup ON channel_mappings(mapping_type, internal_id, is_active);
```

**Migration**: `20250101000002_create_channel_mappings.ts`

**Tasks**:
- [ ] Create migration
- [ ] Migrate existing `rooms.beds24_room_id` to `channel_mappings`
- [ ] Add down migration

---

## Phase 2: RabbitMQ Setup (Basic)

### 2.1 Add Dependencies

**Package**: `package.json`
- `amqplib`: ^0.10.3
- `amqp-connection-manager`: ^4.1.14

**Tasks**:
- [ ] Add to package.json
- [ ] Run `npm install`

---

### 2.2 Create RabbitMQ Config

**File**: `src/config/rabbitmq.ts`

**Config**:
- Connection: `RABBITMQ_URL` env var (default: `amqp://localhost:5672`)
- Simple connection manager

**Tasks**:
- [ ] Create config file
- [ ] Add connection setup

---

### 2.3 Create Topology Setup

**File**: `src/integrations/beds24/queue/rabbitmq_topology.ts`

**Topology**:
- Exchange: `pms.events` (topic, durable)
- Queue: `beds24.inbound` (durable) - routing: `beds24.#`
- Queue: `pms.outbound` (durable) - routing: `pms.#`
- DLQ: `beds24.dlq`, `pms.dlq` (via dead-letter exchange)

**Tasks**:
- [ ] Create topology file
- [ ] Setup exchange and queues
- [ ] Add DLQ configuration

---

### 2.4 Create Publisher

**File**: `src/integrations/beds24/queue/rabbitmq_publisher.ts`

**Methods**:
- `publishInbound(eventType: string, payload: any): Promise<void>`
- `publishOutbound(eventType: string, payload: any): Promise<void>`

**Tasks**:
- [ ] Create publisher
- [ ] Implement publish methods
- [ ] Add error handling

---

### 2.5 Create Base Consumer

**File**: `src/integrations/beds24/queue/rabbitmq_consumer_base.ts`

**Features**:
- Connection management
- Message ack/nack
- Basic error handling

**Tasks**:
- [ ] Create base consumer class
- [ ] Implement message processing loop

---

## Phase 3: Event Persistence (Minimal)

### 3.1 Create ChannelEventRepository

**File**: `src/integrations/beds24/repositories/channel_event_repository.ts`

**Methods** (minimal):
- `create(event: CreateEventInput): Promise<ChannelEvent>`
- `findByIdempotencyKey(key: string): Promise<ChannelEvent | null>`
- `updateStatus(id: string, status: string, error?: string): Promise<void>`
- `getFailedEvents(limit: number): Promise<ChannelEvent[]>`

**Tasks**:
- [ ] Create repository
- [ ] Implement basic methods

---

## Phase 4: Inbound Flow

### 4.1 Enhance Webhook Handler

**File**: `src/integrations/beds24/webhooks/webhook_handler.ts`

**Changes**:
1. After signature verification, create `channel_event` (status: 'received')
2. Check idempotency - if duplicate, return 200
3. Publish to `beds24.inbound` queue
4. Update status to 'processing'

**Tasks**:
- [ ] Add event persistence
- [ ] Add idempotency check
- [ ] Integrate RabbitMQ publisher
- [ ] Update status tracking

---

### 4.2 Create Inbound Worker

**File**: `src/integrations/beds24/workers/inbound_worker.ts`

**Flow**:
1. Consume from `beds24.inbound`
2. Check idempotency (skip if already done)
3. Route to existing webhook handlers
4. Update `channel_events` status
5. Ack on success, nack on error (route to DLQ after 3 attempts)

**Tasks**:
- [ ] Create worker
- [ ] Integrate existing handlers
- [ ] Add status updates
- [ ] Add retry logic (3 attempts max)

---

## Phase 5: Outbound Flow

### 5.1 Replace Sync Hooks

**File**: `src/integrations/beds24/hooks/sync_hooks.ts`

**Changes**:
- Replace in-memory queue with RabbitMQ publisher
- Create `channel_event` before publishing
- Publish to `pms.outbound` with routing keys:
  - `pms.booking.create`
  - `pms.booking.update`
  - `pms.booking.cancel`
  - `pms.availability.update`

**Tasks**:
- [ ] Replace queue calls with RabbitMQ
- [ ] Add event persistence
- [ ] Update routing keys

---

### 5.2 Create Outbound Worker

**File**: `src/integrations/beds24/workers/outbound_worker.ts`

**Flow**:
1. Consume from `pms.outbound`
2. Generate idempotency key
3. Call Beds24 API (use existing services)
4. Update `channel_events` status
5. Ack on success, nack on error (route to DLQ after 3 attempts)

**Note**: Use existing `Beds24Client` rate limiting (no custom rate limiter needed for demo)

**Tasks**:
- [ ] Create worker
- [ ] Integrate existing push services
- [ ] Add idempotency key generation
- [ ] Add status updates
- [ ] Add retry logic

---

### 5.3 Add Idempotency to Beds24Client

**File**: `src/integrations/beds24/beds24_client.ts`

**Changes**:
- Add `idempotencyKey` parameter to API methods
- Include `X-Idempotency-Key` header

**Tasks**:
- [ ] Add idempotency key parameter
- [ ] Add header to requests

---

## Phase 6: Admin Endpoints (Minimal)

### 6.1 Create DLQ Listing

**File**: `src/services/admin/channel_events_controller.ts`

**Endpoint**: `GET /admin/events?status=failed&limit=50`

**Response**:
```json
{
  "events": [
    {
      "id": "uuid",
      "event_type": "pms.booking.create",
      "direction": "outbound",
      "status": "failed",
      "last_error": "API error",
      "received_at": "2025-01-01T12:00:00Z",
      "attempts": 3
    }
  ],
  "total": 10
}
```

**Tasks**:
- [ ] Create controller
- [ ] Add listing endpoint
- [ ] Add basic filtering

---

### 6.2 Create Retry Endpoint

**File**: `src/services/admin/channel_events_controller.ts`

**Endpoint**: `POST /admin/events/:id/retry`

**Logic**:
- Reset attempts to 0
- Update status to 'received'
- Republish to appropriate queue

**Tasks**:
- [ ] Add retry endpoint
- [ ] Implement republish logic

---

### 6.3 Create Routes

**File**: `src/services/admin/channel_events_routes.ts`

**Routes**:
- `GET /admin/events` → list events
- `POST /admin/events/:id/retry` → retry event

**Tasks**:
- [ ] Create routes file
- [ ] Register routes in main app

---

## Implementation Order

1. **Phase 1**: Database migrations (channel_events, channel_mappings)
2. **Phase 2**: RabbitMQ setup (config, topology, publisher, consumer)
3. **Phase 3**: Event repository
4. **Phase 4**: Inbound flow (webhook → queue → worker)
5. **Phase 5**: Outbound flow (hooks → queue → worker)
6. **Phase 6**: Admin endpoints (DLQ listing, retry)

---

## What's Removed (For Demo)

- ❌ `channel_properties` table (use existing `beds24_config`)
- ❌ Complex reconciliation job
- ❌ Inventory holds (use simpler reservation creation)
- ❌ Rate limiting service (use existing Beds24Client)
- ❌ Event normalization
- ❌ Mapping CRUD (use existing room mapping)
- ❌ Connection status dashboard
- ❌ Replay endpoint
- ❌ Advanced monitoring
- ❌ Hold reaper job

---

## Quick Start Checklist

- [ ] Run migrations
- [ ] Setup RabbitMQ (local or Docker)
- [ ] Start inbound worker: `npm run worker:inbound`
- [ ] Start outbound worker: `npm run worker:outbound`
- [ ] Test webhook: Send test event to webhook endpoint
- [ ] Test outbound: Create reservation in PMS
- [ ] Check DLQ: `GET /admin/events?status=failed`
- [ ] Retry failed: `POST /admin/events/:id/retry`

---

## Demo Scenarios

1. **Inbound Demo**:
   - Send Beds24 webhook → See event in `channel_events` → See reservation created in PMS

2. **Outbound Demo**:
   - Create reservation in PMS → See event in `channel_events` → See booking in Beds24

3. **DLQ Demo**:
   - Simulate API failure → See event in DLQ → Retry via admin endpoint → See success

---

## Files to Create/Modify

### New Files (15):
1. `src/database/migrations/20250101000001_create_channel_events.ts`
2. `src/database/migrations/20250101000002_create_channel_mappings.ts`
3. `src/config/rabbitmq.ts`
4. `src/integrations/beds24/queue/rabbitmq_topology.ts`
5. `src/integrations/beds24/queue/rabbitmq_publisher.ts`
6. `src/integrations/beds24/queue/rabbitmq_consumer_base.ts`
7. `src/integrations/beds24/repositories/channel_event_repository.ts`
8. `src/integrations/beds24/workers/inbound_worker.ts`
9. `src/integrations/beds24/workers/outbound_worker.ts`
10. `src/services/admin/channel_events_controller.ts`
11. `src/services/admin/channel_events_routes.ts`
12. `src/workers/inbound_worker.ts` (entry point)
13. `src/workers/outbound_worker.ts` (entry point)

### Modified Files (5):
1. `src/integrations/beds24/webhooks/webhook_handler.ts`
2. `src/integrations/beds24/hooks/sync_hooks.ts`
3. `src/integrations/beds24/beds24_client.ts`
4. `package.json` (add dependencies)
5. `src/routes.ts` (add admin routes)

---

## Estimated Time

- Phase 1: 2 hours
- Phase 2: 3 hours
- Phase 3: 1 hour
- Phase 4: 3 hours
- Phase 5: 3 hours
- Phase 6: 2 hours

**Total: ~14 hours** for working demo

