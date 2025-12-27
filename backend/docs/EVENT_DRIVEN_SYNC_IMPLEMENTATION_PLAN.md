# Event-Driven Sync Implementation Plan

## Overview

This document outlines the detailed implementation plan for a two-queue, event-driven sync system with durable persistence and reconciliation layer for Beds24 integration.

**Architecture Summary:**
- **Inbound Flow**: Beds24 → Webhook → `beds24.inbound` RabbitMQ queue → Worker(s) → Idempotent create/update in PMS
- **Outbound Flow**: PMS actions → Enqueue to `pms.outbound` → Outbound worker(s) → Call Beds24 API (with idempotency key & per-property rate limiting)
- **Event Persistence**: All events stored in `channel_events` for dedupe/DLQ/replay
- **Mappings**: Stored in `channel_mappings` (rooms/rates/properties)
- **Reconciliation**: Hourly/daily job compares Beds24 ↔ PMS, auto-fixes or flags diffs

---

## Phase 1: Database Schema & Migrations

### 1.1 Create `channel_properties` Table

**Purpose**: Store channel property configurations and connection status

**Schema**:
```sql
CREATE TABLE channel_properties (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    property_id UUID NOT NULL REFERENCES hotel_settings(id) ON DELETE CASCADE,
    channel_name VARCHAR(50) NOT NULL, -- 'beds24'
    channel_property_id VARCHAR(255) NOT NULL, -- Beds24 property ID
    config JSONB DEFAULT '{}', -- Channel-specific configuration
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'error')),
    last_sync_at TIMESTAMP WITH TIME ZONE,
    last_webhook_at TIMESTAMP WITH TIME ZONE,
    last_outbound_success_at TIMESTAMP WITH TIME ZONE,
    failed_events_24h INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(property_id, channel_name)
);
```

**Indexes**:
- `idx_channel_properties_property_channel` ON (property_id, channel_name)
- `idx_channel_properties_status` ON (status)

**Migration File**: `20250101000001_create_channel_properties.ts`

**Tasks**:
- [ ] Create migration file
- [ ] Add table with all columns and constraints
- [ ] Create indexes
- [ ] Add down migration
- [ ] Migrate existing `beds24_config.beds24_property_id` to `channel_properties`

---

### 1.2 Create `channel_mappings` Table

**Purpose**: Store mappings between PMS entities and channel entities (rooms, rates, properties)

**Schema**:
```sql
CREATE TABLE channel_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_property_id UUID NOT NULL REFERENCES channel_properties(id) ON DELETE CASCADE,
    mapping_type VARCHAR(50) NOT NULL CHECK (mapping_type IN ('room', 'rate', 'property', 'room_type')),
    internal_id UUID NOT NULL, -- PMS entity ID (room.id, room_type.id, etc.)
    external_id VARCHAR(255) NOT NULL, -- Channel entity ID (Beds24 room ID, etc.)
    metadata JSONB DEFAULT '{}', -- Additional mapping metadata
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(channel_property_id, mapping_type, internal_id),
    UNIQUE(channel_property_id, mapping_type, external_id)
);
```

**Indexes**:
- `idx_channel_mappings_channel_property` ON (channel_property_id, mapping_type, is_active)
- `idx_channel_mappings_internal` ON (mapping_type, internal_id)
- `idx_channel_mappings_external` ON (mapping_type, external_id)

**Migration File**: `20250101000002_create_channel_mappings.ts`

**Tasks**:
- [ ] Create migration file
- [ ] Add table with all columns and constraints
- [ ] Create indexes
- [ ] Add down migration
- [ ] Migrate existing `rooms.beds24_room_id` to `channel_mappings`

---

### 1.3 Create `channel_events` Table

**Purpose**: Persist all events for deduplication, DLQ, replay, and audit

**Schema**:
```sql
CREATE TABLE channel_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_property_id UUID NOT NULL REFERENCES channel_properties(id) ON DELETE CASCADE,
    direction VARCHAR(10) NOT NULL CHECK (direction IN ('inbound', 'outbound')),
    source VARCHAR(50) NOT NULL, -- 'beds24', 'pms'
    event_type VARCHAR(100) NOT NULL, -- 'booking.created', 'availability.updated', etc.
    entity_type VARCHAR(50) NOT NULL, -- 'booking', 'availability', 'rate'
    entity_external_id VARCHAR(255), -- Beds24/OTA ID
    entity_internal_id UUID, -- PMS ID (reservation.id, room.id, etc.)
    idempotency_key VARCHAR(255) NOT NULL, -- Unique client key for deduplication
    payload JSONB NOT NULL, -- Raw event payload
    normalized_payload JSONB, -- Optional canonical form for comparison
    status VARCHAR(20) NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'processing', 'done', 'retrying', 'failed', 'ignored')),
    attempts INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 3,
    last_error TEXT,
    received_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

**Indexes**:
- `idx_channel_events_idempotency_key` UNIQUE ON (idempotency_key)
- `idx_channel_events_external_id` ON (entity_external_id)
- `idx_channel_events_channel_status` ON (channel_property_id, status)
- `idx_channel_events_status_received` ON (status, received_at)
- `idx_channel_events_entity_lookup` ON (entity_type, entity_internal_id)
- `idx_channel_events_dlq` ON (status, received_at) WHERE status = 'failed'

**Migration File**: `20250101000003_create_channel_events.ts`

**Tasks**:
- [ ] Create migration file
- [ ] Add table with all columns and constraints
- [ ] Create all indexes (including partial index for DLQ)
- [ ] Add down migration

---

### 1.4 Create `inventory_holds` Table

**Purpose**: Track short-lived inventory holds for optimistic booking creation

**Schema**:
```sql
CREATE TABLE inventory_holds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reservation_id UUID NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
    room_type_id UUID REFERENCES room_types(id) ON DELETE CASCADE,
    check_in DATE NOT NULL,
    check_out DATE NOT NULL,
    units_held INTEGER NOT NULL DEFAULT 1,
    hold_expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'confirmed', 'released', 'expired')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

**Indexes**:
- `idx_inventory_holds_reservation` ON (reservation_id)
- `idx_inventory_holds_expires` ON (hold_expires_at, status) WHERE status = 'active'
- `idx_inventory_holds_room_type_dates` ON (room_type_id, check_in, check_out)

**Migration File**: `20250101000004_create_inventory_holds.ts`

**Tasks**:
- [ ] Create migration file
- [ ] Add table with all columns and constraints
- [ ] Create indexes
- [ ] Add down migration

---

### 1.5 Add Version Column to Reservations

**Purpose**: Enable optimistic locking for concurrent updates

**Schema Change**:
```sql
ALTER TABLE reservations ADD COLUMN version INTEGER DEFAULT 1;
```

**Migration File**: `20250101000005_add_version_to_reservations.ts`

**Tasks**:
- [ ] Create migration file
- [ ] Add version column with default 1
- [ ] Add down migration

---

## Phase 2: RabbitMQ Infrastructure

### 2.1 Add Dependencies

**Package**: `package.json`

**Dependencies to Add**:
- `amqplib`: ^0.10.3
- `amqp-connection-manager`: ^4.1.14

**Tasks**:
- [ ] Add dependencies to package.json
- [ ] Run `npm install`

---

### 2.2 Create RabbitMQ Configuration

**File**: `src/config/rabbitmq.ts`

**Configuration**:
- Connection string from environment: `RABBITMQ_URL` (default: `amqp://localhost:5672`)
- Connection pooling settings
- Retry logic for connection failures
- Health check endpoint

**Tasks**:
- [ ] Create config file
- [ ] Add connection string parsing
- [ ] Add connection pool configuration
- [ ] Add retry logic
- [ ] Add health check method

---

### 2.3 Create RabbitMQ Topology Setup

**File**: `src/integrations/beds24/queue/rabbitmq_topology.ts`

**Topology**:
- **Exchange**: `pms.events` (topic, durable)
- **Queues**:
  - `beds24.inbound` (durable) - bound to `pms.events` with routing key `beds24.#`
  - `pms.outbound` (durable) - bound to `pms.events` with routing key `pms.#`
- **DLQs**:
  - `beds24.dlq` (durable) - dead-letter exchange for `beds24.inbound`
  - `pms.dlq` (durable) - dead-letter exchange for `pms.outbound`
- **Dead Letter Exchange**: `pms.events.dlx` (topic, durable)

**Queue Arguments**:
- `x-dead-letter-exchange`: `pms.events.dlx`
- `x-message-ttl`: 86400000 (24 hours)
- `x-max-priority`: 10

**Tasks**:
- [ ] Create topology setup file
- [ ] Implement exchange creation
- [ ] Implement queue creation with DLQ configuration
- [ ] Implement bindings
- [ ] Add topology initialization function
- [ ] Add error handling

---

### 2.4 Create RabbitMQ Publisher Service

**File**: `src/integrations/beds24/queue/rabbitmq_publisher.ts`

**Features**:
- Connection management using `amqp-connection-manager`
- Message serialization (JSON)
- Routing key generation based on event type
- Error handling and retry logic
- Message persistence (delivery mode 2)

**Methods**:
- `publish(eventType: string, payload: any, routingKey: string, options?: PublishOptions): Promise<void>`
- `publishInbound(eventType: string, payload: any): Promise<void>` (routing: `beds24.*`)
- `publishOutbound(eventType: string, payload: any): Promise<void>` (routing: `pms.*`)

**Tasks**:
- [ ] Create publisher service
- [ ] Implement connection management
- [ ] Implement publish methods
- [ ] Add error handling
- [ ] Add logging

---

### 2.5 Create Base RabbitMQ Consumer

**File**: `src/integrations/beds24/queue/rabbitmq_consumer_base.ts`

**Features**:
- Connection management
- Message acknowledgment (ack/nack)
- Error handling with retry and DLQ routing
- Message deserialization
- Concurrency control (prefetch)

**Base Class**:
```typescript
abstract class BaseRabbitMQConsumer {
  abstract processMessage(msg: ConsumeMessage): Promise<void>;
  start(queueName: string, options?: ConsumerOptions): Promise<void>;
  stop(): Promise<void>;
}
```

**Tasks**:
- [ ] Create base consumer class
- [ ] Implement connection management
- [ ] Implement message processing loop
- [ ] Add acknowledgment logic
- [ ] Add error handling with DLQ routing
- [ ] Add prefetch configuration

---

## Phase 3: Event Persistence Layer

### 3.1 Create ChannelEventRepository

**File**: `src/integrations/beds24/repositories/channel_event_repository.ts`

**Methods**:
- `create(event: CreateChannelEventInput): Promise<ChannelEvent>`
- `findByIdempotencyKey(key: string): Promise<ChannelEvent | null>`
- `findByExternalId(externalId: string, entityType: string): Promise<ChannelEvent[]>`
- `updateStatus(id: string, status: string, error?: string): Promise<void>`
- `incrementAttempts(id: string): Promise<void>`
- `getFailedEvents(filters: FailedEventFilters): Promise<ChannelEvent[]>`
- `markProcessed(id: string): Promise<void>`

**Tasks**:
- [ ] Create repository file
- [ ] Implement all CRUD methods
- [ ] Add transaction support where needed
- [ ] Add error handling

---

### 3.2 Create Idempotency Service

**File**: `src/integrations/beds24/services/idempotency_service.ts`

**Features**:
- Check if event already processed using `channel_events.idempotency_key`
- Generate idempotency keys for outbound events
- Key format: `{property_id}-{entity_type}-{entity_id}-{timestamp}`

**Methods**:
- `checkIdempotency(key: string): Promise<boolean>`
- `generateIdempotencyKey(propertyId: string, entityType: string, entityId: string): string`
- `markAsProcessed(key: string, result: any): Promise<void>`

**Tasks**:
- [ ] Create idempotency service
- [ ] Implement key generation
- [ ] Implement idempotency check
- [ ] Add caching layer (optional, for performance)

---

### 3.3 Create Event Normalization Service

**File**: `src/integrations/beds24/services/event_normalization_service.ts`

**Purpose**: Generate canonical payload format for comparison and reconciliation

**Methods**:
- `normalizeBookingEvent(payload: any): NormalizedBookingEvent`
- `normalizeAvailabilityEvent(payload: any): NormalizedAvailabilityEvent`
- `normalizeRateEvent(payload: any): NormalizedRateEvent`

**Tasks**:
- [ ] Create normalization service
- [ ] Implement normalization for each entity type
- [ ] Add validation
- [ ] Add error handling

---

## Phase 4: Inbound Flow (Beds24 → PMS)

### 4.1 Enhance Webhook Handler

**File**: `src/integrations/beds24/webhooks/webhook_handler.ts`

**Changes**:
1. After signature verification, persist event to `channel_events` with status `received`
2. Check idempotency using `idempotency_key` from payload
3. If duplicate, return 200 immediately
4. If new, publish to RabbitMQ `beds24.inbound` queue
5. Update `channel_events` status to `processing` when published

**Flow**:
```
Webhook Request
  ↓
Verify HMAC Signature
  ↓
Extract event_id (idempotency key)
  ↓
Check channel_events for duplicate
  ↓ (if duplicate)
Return 200 OK
  ↓ (if new)
Persist to channel_events (status: 'received')
  ↓
Publish to RabbitMQ (beds24.inbound)
  ↓
Update channel_events (status: 'processing')
  ↓
Return 200 OK
```

**Tasks**:
- [ ] Modify webhook handler to persist events
- [ ] Add idempotency check
- [ ] Integrate RabbitMQ publisher
- [ ] Update event status tracking
- [ ] Add error handling

---

### 4.2 Create Inbound Worker

**File**: `src/integrations/beds24/workers/inbound_worker.ts`

**Features**:
- Consumes from `beds24.inbound` queue
- Extends `BaseRabbitMQConsumer`
- Checks idempotency before processing
- Routes to appropriate handler based on `event_type`
- Updates `channel_events` status
- Handles retries and DLQ routing

**Event Routing**:
- `beds24.booking.created` → `handleBookingCreated`
- `beds24.booking.modified` → `handleBookingModified`
- `beds24.booking.cancelled` → `handleBookingCancelled`
- `beds24.booking.deleted` → `handleBookingDeleted`
- `beds24.availability.updated` → `handleAvailabilityUpdated`

**Processing Flow**:
```
Consume Message
  ↓
Deserialize payload
  ↓
Load channel_event by idempotency_key
  ↓
Check if already processed (status = 'done')
  ↓ (if done)
Ack message, skip processing
  ↓ (if not done)
Update status to 'processing'
  ↓
Route to handler
  ↓
Handler processes (create/update reservation)
  ↓
Update channel_events (status: 'done', processed_at)
  ↓
Ack message
  ↓ (on error)
Update channel_events (status: 'retrying' or 'failed')
  ↓
Nack with requeue or route to DLQ
```

**Tasks**:
- [ ] Create inbound worker class
- [ ] Implement message consumption
- [ ] Add idempotency check
- [ ] Integrate existing webhook handlers
- [ ] Add status tracking
- [ ] Add retry logic
- [ ] Add DLQ routing

---

### 4.3 Refactor Webhook Handlers

**Files**: 
- `src/integrations/beds24/webhooks/handlers/booking_created_handler.ts`
- `src/integrations/beds24/webhooks/handlers/booking_modified_handler.ts`
- `src/integrations/beds24/webhooks/handlers/booking_cancelled_handler.ts`
- `src/integrations/beds24/webhooks/handlers/booking_deleted_handler.ts`

**Changes**:
- Accept `channelEventId` parameter
- Update `channel_events` status after processing
- Return structured result for worker to handle
- Add transaction support

**Tasks**:
- [ ] Refactor each handler to accept channel event ID
- [ ] Add status update calls
- [ ] Add transaction support
- [ ] Improve error handling

---

### 4.4 Implement Retry Logic

**File**: `src/integrations/beds24/workers/inbound_worker.ts`

**Retry Strategy**:
- Max attempts: 3 (configurable per event type)
- Exponential backoff: 5s, 25s, 125s
- After max attempts: Route to DLQ
- Update `channel_events.attempts` and `status`

**Tasks**:
- [ ] Implement retry counter
- [ ] Implement exponential backoff
- [ ] Add DLQ routing on max attempts
- [ ] Update event status

---

## Phase 5: Outbound Flow (PMS → Beds24)

### 5.1 Replace Sync Hooks with RabbitMQ

**File**: `src/integrations/beds24/hooks/sync_hooks.ts`

**Changes**:
- Replace `queueReservationSync` calls with RabbitMQ publisher
- Replace `queueAvailabilitySync` calls with RabbitMQ publisher
- Publish to `pms.outbound` queue with routing keys:
  - `pms.booking.create`
  - `pms.booking.update`
  - `pms.booking.cancel`
  - `pms.availability.update`
  - `pms.rate.update`

**Tasks**:
- [ ] Replace in-memory queue with RabbitMQ publisher
- [ ] Update all sync hook functions
- [ ] Add event persistence before publishing
- [ ] Add error handling

---

### 5.2 Create Outbound Worker

**File**: `src/integrations/beds24/workers/outbound_worker.ts`

**Features**:
- Consumes from `pms.outbound` queue
- Extends `BaseRabbitMQConsumer`
- Generates idempotency key
- Checks per-property rate limiting
- Calls Beds24 API with idempotency key
- Updates `channel_events` status
- Handles retries and DLQ routing

**Processing Flow**:
```
Consume Message
  ↓
Deserialize payload
  ↓
Load channel_event (or create new)
  ↓
Check rate limit for property
  ↓ (if rate limited)
Nack with requeue, delay
  ↓ (if allowed)
Generate idempotency key
  ↓
Call Beds24 API with idempotency key
  ↓
Update channel_events (status: 'done')
  ↓
Clear inventory hold (if applicable)
  ↓
Ack message
  ↓ (on error)
Update channel_events (status: 'retrying' or 'failed')
  ↓
Release inventory hold (on fatal error)
  ↓
Nack with requeue or route to DLQ
```

**Tasks**:
- [ ] Create outbound worker class
- [ ] Implement message consumption
- [ ] Integrate rate limiting
- [ ] Generate idempotency keys
- [ ] Call Beds24 API
- [ ] Update event status
- [ ] Handle inventory holds
- [ ] Add retry logic

---

### 5.3 Implement Per-Property Rate Limiting

**File**: `src/integrations/beds24/services/rate_limiter.ts`

**Algorithm**: Token Bucket

**Storage**: Database table or Redis (prefer DB for simplicity)

**Schema** (if using DB):
```sql
CREATE TABLE rate_limit_buckets (
    channel_property_id UUID PRIMARY KEY REFERENCES channel_properties(id),
    tokens INTEGER NOT NULL DEFAULT 100,
    capacity INTEGER NOT NULL DEFAULT 100,
    last_refill_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    refill_rate INTEGER NOT NULL DEFAULT 100, -- tokens per 5 minutes
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

**Methods**:
- `checkRateLimit(channelPropertyId: string): Promise<boolean>`
- `consumeToken(channelPropertyId: string): Promise<void>`
- `refillTokens(channelPropertyId: string): Promise<void>`

**Tasks**:
- [ ] Create rate limiter service
- [ ] Implement token bucket algorithm
- [ ] Add database table (or Redis integration)
- [ ] Add refill logic
- [ ] Integrate with outbound worker

---

### 5.4 Add Idempotency to Beds24 API Calls

**File**: `src/integrations/beds24/beds24_client.ts`

**Changes**:
- Add `idempotencyKey` parameter to API methods
- Include `X-Idempotency-Key` header in requests
- Store idempotency key in `channel_events` before API call

**Methods to Update**:
- `createBooking`
- `updateBooking`
- `cancelBooking`
- `pushAvailability`
- `pushRates`

**Tasks**:
- [ ] Add idempotency key parameter to API methods
- [ ] Add header to HTTP requests
- [ ] Update all API call sites

---

### 5.5 Implement Retry Logic for Outbound

**File**: `src/integrations/beds24/workers/outbound_worker.ts`

**Retry Strategy**:
- Max attempts: 3 (configurable)
- Exponential backoff: 5s, 25s, 125s
- Rate limit errors: Longer backoff (60s, 300s, 900s)
- After max attempts: Route to DLQ
- Update `channel_events.attempts` and `status`

**Tasks**:
- [ ] Implement retry counter
- [ ] Implement exponential backoff
- [ ] Add special handling for rate limit errors
- [ ] Add DLQ routing on max attempts
- [ ] Update event status

---

## Phase 6: Inventory Hold & Optimistic Locking

### 6.1 Create InventoryHoldService

**File**: `src/services/inventory/inventory_hold_service.ts`

**Methods**:
- `createHold(reservationId: string, roomTypeId: string, checkIn: Date, checkOut: Date, units: number, ttlMinutes: number): Promise<InventoryHold>`
- `releaseHold(holdId: string): Promise<void>`
- `extendHold(holdId: string, additionalMinutes: number): Promise<void>`
- `checkAvailability(roomTypeId: string, checkIn: Date, checkOut: Date): Promise<number>`
- `confirmHold(holdId: string): Promise<void>`
- `getActiveHolds(reservationId: string): Promise<InventoryHold[]>`

**Tasks**:
- [ ] Create inventory hold service
- [ ] Implement all methods
- [ ] Add transaction support
- [ ] Add error handling

---

### 6.2 Integrate Inventory Hold in Reservation Creation

**File**: `src/services/reservations/reservations_controller.ts`

**Changes to `createReservationHandler`**:
1. Start transaction
2. `SELECT ... FOR UPDATE` on `room_types` or availability view
3. Check availability (total - reserved - maintenance - active holds)
4. If available, create inventory hold (TTL: 10-20 minutes)
5. Create reservation with status `PENDING_SYNC`
6. Set `hold_expires_at` on reservation
7. Commit transaction
8. Enqueue outbound event to RabbitMQ
9. On success: Update reservation status to `CONFIRMED`, confirm hold
10. On fatal failure: Release hold, update reservation status

**Code Pattern**:
```typescript
await db.transaction(async (trx) => {
  // Lock room type
  const roomType = await trx('room_types')
    .where({ id: roomTypeId })
    .forUpdate()
    .first();
  
  // Check availability
  const available = await checkAvailability(roomTypeId, checkIn, checkOut);
  if (available < unitsRequested) {
    throw new Error('Not enough availability');
  }
  
  // Create reservation
  const reservation = await trx('reservations').insert({...}).returning('*');
  
  // Create hold
  const hold = await inventoryHoldService.createHold(
    reservation.id,
    roomTypeId,
    checkIn,
    checkOut,
    unitsRequested,
    15 // 15 minutes TTL
  );
  
  return { reservation, hold };
});
```

**Tasks**:
- [ ] Modify createReservationHandler
- [ ] Add SELECT FOR UPDATE
- [ ] Integrate inventory hold creation
- [ ] Set PENDING_SYNC status
- [ ] Add error handling

---

### 6.3 Create Hold Reaper Job

**File**: `src/jobs/inventory_hold_reaper.ts`

**Purpose**: Release expired holds every 5 minutes

**Logic**:
```sql
UPDATE inventory_holds
SET status = 'expired', updated_at = NOW()
WHERE status = 'active'
  AND hold_expires_at < NOW();
```

**Tasks**:
- [ ] Create reaper job file
- [ ] Implement expired hold cleanup
- [ ] Schedule job (every 5 minutes)
- [ ] Add logging

---

### 6.4 Update Outbound Worker to Handle Holds

**File**: `src/integrations/beds24/workers/outbound_worker.ts`

**Changes**:
- On success: Call `confirmHold(holdId)`, update reservation status to `CONFIRMED`
- On fatal error: Call `releaseHold(holdId)`, update reservation status to `FAILED`

**Tasks**:
- [ ] Add hold confirmation on success
- [ ] Add hold release on fatal error
- [ ] Update reservation status accordingly

---

## Phase 7: Reconciliation Job

### 7.1 Create ReconciliationService

**File**: `src/integrations/beds24/services/reconciliation_service.ts`

**Methods**:
- `reconcileBookings(propertyId: string, dateRange?: { start: Date, end: Date }): Promise<ReconciliationResult>`
- `reconcileAvailability(propertyId: string, dateRange?: { start: Date, end: Date }): Promise<ReconciliationResult>`
- `reconcileRates(propertyId: string): Promise<ReconciliationResult>`
- `autoFixBooking(booking: Beds24Booking, pmsReservation: Reservation | null): Promise<FixResult>`
- `flagConflict(conflict: Conflict): Promise<void>`

**Tasks**:
- [ ] Create reconciliation service
- [ ] Implement booking reconciliation
- [ ] Implement availability reconciliation
- [ ] Implement rate reconciliation
- [ ] Add auto-fix logic
- [ ] Add conflict flagging

---

### 7.2 Implement Booking Reconciliation

**File**: `src/integrations/beds24/services/reconciliation_service.ts`

**Logic**:
1. Fetch bookings from Beds24 API (date range: last 30 days + next 90 days)
2. Fetch reservations from PMS (same date range, source = 'Beds24')
3. Compare:
   - Bookings in Beds24 but not in PMS → Auto-fix: Create reservation
   - Reservations in PMS but not in Beds24 → Flag: Manual review
   - Both exist but differ:
     - Date mismatch → Flag (high risk)
     - Status mismatch (Beds24 cancelled, PMS active) → Auto-fix: Cancel
     - Price difference > 5% → Flag (high risk)
     - Price difference ≤ 5% → Auto-fix: Update amount
     - Guest mismatch → Flag (medium risk)

**Auto-Fix Rules**:
- ✅ Create missing bookings (deterministic)
- ✅ Cancel bookings that Beds24 shows cancelled (deterministic)
- ✅ Fix small price differences ≤ 5% (low risk)
- ❌ Flag date mismatches (high risk)
- ❌ Flag large price differences > 5% (high risk)
- ❌ Flag guest mismatches (medium risk)

**Tasks**:
- [ ] Implement booking fetch from Beds24
- [ ] Implement booking fetch from PMS
- [ ] Implement comparison logic
- [ ] Implement auto-fix logic
- [ ] Implement conflict flagging
- [ ] Add audit logging

---

### 7.3 Implement Availability Reconciliation

**File**: `src/integrations/beds24/services/reconciliation_service.ts`

**Logic**:
1. Fetch availability from Beds24 API (date range: today + 365 days)
2. Calculate availability in PMS (total - reserved - maintenance)
3. Compare per room type and date
4. Auto-fix: Small deltas within ±1 room
5. Flag: Large deltas > 1 room

**Auto-Fix Rules**:
- ✅ Fix availability deltas within ±1 room (low risk)
- ❌ Flag deltas > 1 room (high risk - possible overbooking)

**Tasks**:
- [ ] Implement availability fetch from Beds24
- [ ] Implement availability calculation in PMS
- [ ] Implement comparison logic
- [ ] Implement auto-fix for small deltas
- [ ] Implement flagging for large deltas
- [ ] Add audit logging

---

### 7.4 Create Reconciliation Scheduler

**File**: `src/jobs/reconciliation_scheduler.ts`

**Schedule**:
- Bookings: Every 15-30 minutes
- Availability: Every hour
- Rates: Daily (unless rates are critical, then hourly)

**Implementation**: Use `node-cron` or similar

**Tasks**:
- [ ] Create scheduler file
- [ ] Implement cron jobs
- [ ] Add error handling
- [ ] Add logging
- [ ] Add configuration for intervals

---

## Phase 8: Admin Endpoints

### 8.1 Create Channel Mappings CRUD

**File**: `src/services/admin/channel_mappings_controller.ts`

**Endpoints**:
- `GET /admin/channel-mappings` - List mappings (with filters)
- `GET /admin/channel-mappings/:id` - Get mapping
- `POST /admin/channel-mappings` - Create mapping
- `PUT /admin/channel-mappings/:id` - Update mapping
- `DELETE /admin/channel-mappings/:id` - Delete mapping (soft delete)

**Validation**:
- Check if internal_id exists in PMS
- Check if external_id is valid format for channel
- Prevent duplicate mappings

**Tasks**:
- [ ] Create controller file
- [ ] Implement all CRUD endpoints
- [ ] Add validation
- [ ] Add error handling
- [ ] Create routes file

---

### 8.2 Create Mapping Test Endpoint

**File**: `src/services/admin/channel_mappings_controller.ts`

**Endpoint**: `POST /admin/channel-mappings/test`

**Purpose**: Simulate inbound Beds24 payload against mappings

**Request Body**:
```json
{
  "payload": { /* Beds24 booking payload */ },
  "mappingType": "room"
}
```

**Response**:
```json
{
  "success": true,
  "mappedInternalId": "uuid",
  "mappingFound": true,
  "warnings": []
}
```

**Tasks**:
- [ ] Add test endpoint
- [ ] Implement mapping simulation
- [ ] Add validation
- [ ] Return detailed results

---

### 8.3 Create DLQ Listing Endpoint

**File**: `src/services/admin/channel_events_controller.ts`

**Endpoint**: `GET /admin/events`

**Query Parameters**:
- `status` - Filter by status (failed, retrying, etc.)
- `property_id` - Filter by property
- `type` - Filter by event_type
- `direction` - Filter by direction (inbound/outbound)
- `page` - Page number (default: 1)
- `limit` - Items per page (default: 50)
- `sort` - Sort field (default: received_at)
- `order` - Sort order (asc/desc, default: desc)

**Response**:
```json
{
  "events": [...],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 123,
    "totalPages": 3
  }
}
```

**Tasks**:
- [ ] Create controller file
- [ ] Implement listing endpoint
- [ ] Add filtering
- [ ] Add pagination
- [ ] Add sorting
- [ ] Create routes file

---

### 8.4 Create DLQ Action Endpoints

**File**: `src/services/admin/channel_events_controller.ts`

**Endpoints**:
- `POST /admin/events/:id/retry` - Retry failed event
- `POST /admin/events/:id/ignore` - Mark event as ignored
- `POST /admin/events/batch-retry` - Retry multiple events

**Retry Logic**:
- Reset `attempts` to 0
- Update `status` to `received`
- Republish to appropriate queue

**Tasks**:
- [ ] Add retry endpoint
- [ ] Add ignore endpoint
- [ ] Add batch retry endpoint
- [ ] Implement retry logic
- [ ] Add validation

---

### 8.5 Create Connection Status Endpoint

**File**: `src/services/admin/channel_status_controller.ts`

**Endpoint**: `GET /admin/channel-status/:property_id`

**Response**:
```json
{
  "property_id": "uuid",
  "channel_name": "beds24",
  "beds24_connected": true,
  "last_webhook_at": "2025-01-01T12:00:00Z",
  "last_outbound_success_at": "2025-01-01T11:55:00Z",
  "failed_events_24h": 5,
  "mapping_completeness": {
    "rooms": { "mapped": 25, "total": 30, "percentage": 83.3 },
    "rates": { "mapped": 10, "total": 10, "percentage": 100 }
  },
  "queue_depths": {
    "inbound": 0,
    "outbound": 3,
    "dlq": 2
  }
}
```

**Tasks**:
- [ ] Create controller file
- [ ] Implement status endpoint
- [ ] Calculate mapping completeness
- [ ] Fetch queue depths from RabbitMQ
- [ ] Create routes file

---

### 8.6 Create Replay Endpoint

**File**: `src/services/admin/channel_events_controller.ts`

**Endpoint**: `POST /admin/events/:id/replay`

**Purpose**: Reprocess historical event

**Logic**:
1. Load event from `channel_events`
2. Reset status to `received`
3. Reset attempts to 0
4. Republish to appropriate queue (inbound or outbound)

**Tasks**:
- [ ] Add replay endpoint
- [ ] Implement replay logic
- [ ] Add validation
- [ ] Add error handling

---

## Phase 9: Monitoring & Alerts

### 9.1 Create Metrics Service

**File**: `src/services/monitoring/metrics_service.ts`

**Metrics to Track**:
- Queue depth (inbound, outbound, DLQ)
- Processing times (p50, p95, p99)
- Success/failure rates
- DLQ size
- API response times
- Rate limit hits

**Storage**: In-memory or database table

**Tasks**:
- [ ] Create metrics service
- [ ] Implement metric collection
- [ ] Add aggregation methods
- [ ] Add export methods (for dashboards)

---

### 9.2 Implement Alerting

**File**: `src/services/monitoring/alert_service.ts`

**Alerts**:
- DLQ size > 100 events
- Sync success rate < 95% (last hour)
- Beds24 API unavailable > 5 minutes
- Failed events > 10 in last hour
- Queue depth > 1000

**Alert Channels**: Log, email, webhook (configurable)

**Tasks**:
- [ ] Create alert service
- [ ] Implement alert conditions
- [ ] Add alert channels
- [ ] Add alert throttling (prevent spam)

---

### 9.3 Create Health Check Endpoint

**File**: `src/services/health_check/health_check_controller.ts`

**Endpoint**: `GET /health/channel-sync`

**Response**:
```json
{
  "status": "healthy",
  "rabbitmq": { "connected": true },
  "database": { "connected": true },
  "beds24_api": { "reachable": true },
  "queues": {
    "inbound": { "depth": 0, "status": "ok" },
    "outbound": { "depth": 3, "status": "ok" },
    "dlq": { "depth": 2, "status": "warning" }
  }
}
```

**Tasks**:
- [ ] Enhance health check endpoint
- [ ] Add RabbitMQ health check
- [ ] Add Beds24 API health check
- [ ] Add queue depth checks

---

## Implementation Order Summary

1. **Phase 1**: Database Schema & Migrations (Foundation)
2. **Phase 2**: RabbitMQ Infrastructure (Messaging)
3. **Phase 3**: Event Persistence Layer (Deduplication)
4. **Phase 4**: Inbound Flow (Webhook → Queue → Worker)
5. **Phase 5**: Outbound Flow (PMS → Queue → Worker)
6. **Phase 6**: Inventory Hold & Optimistic Locking (Safety)
7. **Phase 7**: Reconciliation Job (Data Integrity)
8. **Phase 8**: Admin Endpoints (Operations)
9. **Phase 9**: Monitoring & Alerts (Observability)

---

## Testing Strategy

### Unit Tests
- Repository methods
- Service methods
- Worker message processing
- Rate limiter
- Idempotency service

### Integration Tests
- Webhook → Queue → Worker flow
- PMS → Queue → Worker flow
- Reconciliation job
- Admin endpoints

### End-to-End Tests
- Full inbound sync cycle
- Full outbound sync cycle
- Reconciliation with auto-fix
- DLQ retry flow

---

## Deployment Checklist

- [ ] Run all migrations
- [ ] Setup RabbitMQ (exchange, queues, DLQs)
- [ ] Configure environment variables
- [ ] Start inbound worker
- [ ] Start outbound worker
- [ ] Start reconciliation scheduler
- [ ] Start hold reaper job
- [ ] Verify webhook endpoint is accessible
- [ ] Test webhook with Beds24
- [ ] Monitor queue depths
- [ ] Monitor DLQ
- [ ] Verify metrics collection

---

## Rollback Plan

1. Stop workers
2. Revert to in-memory queue (if needed)
3. Keep database tables (for audit)
4. Disable webhook endpoint
5. Monitor for issues

---

## Notes

- All timestamps use `TIMESTAMP WITH TIME ZONE`
- All UUIDs use `gen_random_uuid()`
- All JSONB fields should have validation
- All indexes should be optimized for query patterns
- All workers should be horizontally scalable
- All jobs should be idempotent

