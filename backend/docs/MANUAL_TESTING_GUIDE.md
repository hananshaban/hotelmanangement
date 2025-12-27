# Manual Testing Guide - Event-Driven Sync System

## Prerequisites

1. **PostgreSQL** - Running and accessible
2. **RabbitMQ** - Running and accessible
3. **Beds24 Configuration** - Already set up in PMS

### Setup RabbitMQ

**Option 1: Docker (Recommended)**
```bash
docker run -d --name rabbitmq \
  -p 5672:5672 \
  -p 15672:15672 \
  -e RABBITMQ_DEFAULT_USER=guest \
  -e RABBITMQ_DEFAULT_PASS=guest \
  rabbitmq:3-management
```

**Option 2: Local Installation**
- Install RabbitMQ locally
- Ensure it's running on `localhost:5672`

**Verify RabbitMQ:**
- Management UI: http://localhost:15672 (guest/guest)
- Or: `rabbitmqctl status`

---

## Step 1: Run Database Migrations

```bash
cd backend
npm run db:migrate
```

This creates:
- `channel_events` table
- `channel_mappings` table
- Migrates existing `rooms.beds24_room_id` to `channel_mappings`

**Verify:**
```bash
psql -d hotel_pms_dev -c "SELECT COUNT(*) FROM channel_events;"
psql -d hotel_pms_dev -c "SELECT COUNT(*) FROM channel_mappings;"
```

---

## Step 2: Install Dependencies

```bash
cd backend
npm install
```

This installs:
- `amqplib`
- `amqp-connection-manager`

---

## Step 3: Configure Environment

Ensure `.env` has:
```env
# Database (already configured)
DB_HOST=localhost
DB_PORT=5432
DB_NAME=hotel_pms_dev
DB_USER=postgres
DB_PASSWORD=your_password

# RabbitMQ (add if not present)
RABBITMQ_URL=amqp://localhost:5672
# Or with credentials:
# RABBITMQ_URL=amqp://guest:guest@localhost:5672
```

---

## Step 4: Start Services

You need **3 separate terminal windows**:

### Terminal 1: API Server
```bash
cd backend
npm run dev
```

**Expected output:**
```
✅ PostgreSQL database connected successfully
[RabbitMQ] Connected
Server running on port 3000
```

### Terminal 2: Inbound Worker
```bash
cd backend
npm run worker:inbound
```

**Expected output:**
```
[RabbitMQ] Connected
[RabbitMQ] Topology initialized
[RabbitMQ] Topology setup complete
[InboundWorker] Started consuming from beds24.inbound queue
[InboundWorker] Running. Press Ctrl+C to stop.
```

### Terminal 3: Outbound Worker
```bash
cd backend
npm run worker:outbound
```

**Expected output:**
```
[RabbitMQ] Connected
[RabbitMQ] Topology initialized
[RabbitMQ] Topology setup complete
[OutboundWorker] Started consuming from pms.outbound queue
[OutboundWorker] Running. Press Ctrl+C to stop.
```

---

## Step 5: Verify RabbitMQ Topology

**Option 1: Management UI**
1. Open http://localhost:15672
2. Login: guest/guest
3. Go to **Exchanges** tab
4. Verify `pms.events` exchange exists (topic, durable)
5. Go to **Queues** tab
6. Verify queues exist:
   - `beds24.inbound` (durable)
   - `pms.outbound` (durable)
   - `beds24.dlq` (durable)
   - `pms.dlq` (durable)

**Option 2: Command Line**
```bash
rabbitmqctl list_exchanges
rabbitmqctl list_queues
```

---

## Testing: Inbound Flow (Beds24 → PMS)

### Test 1: Simulate Webhook Event

**1. Get webhook secret:**
```sql
SELECT webhook_secret FROM beds24_config WHERE property_id = '00000000-0000-0000-0000-000000000001';
```

**2. Generate HMAC signature:**
```bash
# Create test payload
PAYLOAD='{"event":"booking.created","booking":{"id":12345,"roomId":"101","arrivalDate":"2025-02-01","departureDate":"2025-02-03","status":"confirmed","guest":{"name":"Test Guest","email":"test@example.com"}}}'

# Generate signature (replace SECRET with actual webhook_secret)
echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "YOUR_WEBHOOK_SECRET" | cut -d' ' -f2
```

**3. Send webhook request:**
```bash
curl -X POST http://localhost:3000/api/integrations/beds24/webhook \
  -H "Content-Type: application/json" \
  -H "X-Beds24-Signature: YOUR_SIGNATURE_HERE" \
  -d "$PAYLOAD"
```

**Expected response:**
```json
{
  "success": true,
  "message": "Webhook received and queued for processing",
  "eventId": "uuid-here"
}
```

**4. Check event in database:**
```sql
SELECT id, direction, event_type, status, attempts, received_at 
FROM channel_events 
ORDER BY received_at DESC 
LIMIT 5;
```

**Expected:** Event with `status='received'` or `status='processing'`

**5. Check Inbound Worker logs:**
Look in Terminal 2 for:
```
[InboundWorker] Successfully processed event: beds24-12345-booking.created-...
```

**6. Verify reservation created:**
```sql
SELECT id, beds24_booking_id, source, status 
FROM reservations 
WHERE beds24_booking_id = '12345';
```

**Expected:** Reservation with `source='Beds24'` and `beds24_booking_id='12345'`

**7. Check event status:**
```sql
SELECT status, processed_at 
FROM channel_events 
WHERE entity_external_id = '12345';
```

**Expected:** `status='done'` with `processed_at` timestamp

---

### Test 2: Test Idempotency (Duplicate Webhook)

**Send the same webhook again with same booking ID:**

```bash
# Use same payload and signature
curl -X POST http://localhost:3000/api/integrations/beds24/webhook \
  -H "Content-Type: application/json" \
  -H "X-Beds24-Signature: YOUR_SIGNATURE_HERE" \
  -d "$PAYLOAD"
```

**Expected response:**
```json
{
  "success": true,
  "message": "Event already processed",
  "eventId": "same-uuid-as-before"
}
```

**Verify:** Only one reservation exists (no duplicates)

---

## Testing: Outbound Flow (PMS → Beds24)

### Test 3: Create Reservation in PMS

**1. Create reservation via API:**
```bash
# First, get auth token (login)
TOKEN=$(curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@hotel.com","password":"admin123"}' \
  | jq -r '.accessToken')

# Create reservation
curl -X POST http://localhost:3000/api/v1/reservations \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "room_id": "YOUR_ROOM_ID",
    "primary_guest_id": "YOUR_GUEST_ID",
    "check_in": "2025-02-10",
    "check_out": "2025-02-12",
    "status": "Confirmed",
    "source": "Direct"
  }'
```

**2. Check event created:**
```sql
SELECT id, direction, event_type, status, entity_internal_id 
FROM channel_events 
WHERE direction = 'outbound' 
  AND entity_type = 'booking'
ORDER BY received_at DESC 
LIMIT 1;
```

**Expected:** Event with `status='received'` or `status='processing'`

**3. Check Outbound Worker logs:**
Look in Terminal 3 for:
```
[OutboundWorker] Successfully processed event: uuid-here
```

**4. Verify event status:**
```sql
SELECT status, processed_at, last_error 
FROM channel_events 
WHERE direction = 'outbound' 
  AND event_type LIKE 'booking.%'
ORDER BY received_at DESC 
LIMIT 1;
```

**Expected:** `status='done'` if successful, or `status='failed'` with error

**5. Check Beds24 (if accessible):**
- Verify booking exists in Beds24 dashboard
- Or check `reservations.beds24_booking_id` is updated

---

### Test 4: Update Reservation

**1. Update reservation:**
```bash
curl -X PUT http://localhost:3000/api/v1/reservations/{RESERVATION_ID} \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "check_out": "2025-02-13"
  }'
```

**2. Verify outbound event:**
```sql
SELECT event_type, status 
FROM channel_events 
WHERE direction = 'outbound' 
  AND event_type = 'booking.update'
ORDER BY received_at DESC 
LIMIT 1;
```

---

### Test 5: Cancel Reservation

**1. Cancel reservation:**
```bash
curl -X DELETE http://localhost:3000/api/v1/reservations/{RESERVATION_ID} \
  -H "Authorization: Bearer $TOKEN"
```

**2. Verify outbound event:**
```sql
SELECT event_type, status 
FROM channel_events 
WHERE direction = 'outbound' 
  AND event_type = 'booking.cancel'
ORDER BY received_at DESC 
LIMIT 1;
```

---

## Testing: DLQ and Admin Endpoints

### Test 6: View Failed Events (DLQ)

**1. List failed events:**
```bash
curl -X GET "http://localhost:3000/api/admin/events?status=failed&limit=10" \
  -H "Authorization: Bearer $TOKEN"
```

**Expected response:**
```json
{
  "events": [
    {
      "id": "uuid",
      "direction": "outbound",
      "event_type": "booking.create",
      "status": "failed",
      "attempts": 3,
      "last_error": "Error message",
      "received_at": "2025-01-01T12:00:00Z"
    }
  ],
  "pagination": {
    "total": 5,
    "limit": 10,
    "offset": 0,
    "totalPages": 1
  }
}
```

**2. Filter by direction:**
```bash
curl -X GET "http://localhost:3000/api/admin/events?status=failed&direction=outbound" \
  -H "Authorization: Bearer $TOKEN"
```

---

### Test 7: Retry Failed Event

**1. Get failed event ID:**
```bash
EVENT_ID=$(curl -X GET "http://localhost:3000/api/admin/events?status=failed&limit=1" \
  -H "Authorization: Bearer $TOKEN" \
  | jq -r '.events[0].id')
```

**2. Retry event:**
```bash
curl -X POST "http://localhost:3000/api/admin/events/$EVENT_ID/retry" \
  -H "Authorization: Bearer $TOKEN"
```

**Expected response:**
```json
{
  "success": true,
  "message": "Event queued for retry",
  "event": {
    "id": "uuid",
    "status": "received",
    "attempts": 0
  }
}
```

**3. Verify event status reset:**
```sql
SELECT status, attempts 
FROM channel_events 
WHERE id = '$EVENT_ID';
```

**Expected:** `status='received'`, `attempts=0`

**4. Check worker logs:**
- Outbound worker should process the event again
- Check if it succeeds or fails again

---

## Testing: Queue Monitoring

### Check Queue Depths

**Via Management UI:**
1. Go to http://localhost:15672
2. Click **Queues** tab
3. Check **Ready** and **Unacked** messages

**Via Command Line:**
```bash
rabbitmqctl list_queues name messages messages_ready messages_unacknowledged
```

**Expected:**
- `beds24.inbound`: Should be 0 (messages processed quickly)
- `pms.outbound`: Should be 0 (messages processed quickly)
- DLQs: Should be 0 unless there are failures

---

## Testing: Error Scenarios

### Test 8: Simulate API Failure

**1. Temporarily break Beds24 API connection:**
- Stop Beds24 API (if local)
- Or use invalid credentials

**2. Create reservation:**
- Create a reservation in PMS
- Outbound event should be created

**3. Check worker logs:**
- Should see retry attempts
- After 3 attempts, should route to DLQ

**4. Check DLQ:**
```sql
SELECT COUNT(*) 
FROM channel_events 
WHERE status = 'failed' 
  AND attempts >= 3;
```

**5. Fix API connection and retry:**
- Use admin endpoint to retry failed events
- Should succeed after retry

---

## Troubleshooting

### Issue: Workers not connecting to RabbitMQ

**Check:**
1. RabbitMQ is running: `rabbitmqctl status`
2. Connection string in `.env`: `RABBITMQ_URL=amqp://localhost:5672`
3. Firewall/network issues

### Issue: Events stuck in 'received' status

**Check:**
1. Workers are running (Terminal 2 & 3)
2. Workers are consuming from correct queues
3. Check worker logs for errors

### Issue: Events failing immediately

**Check:**
1. Beds24 configuration is valid
2. Refresh token is valid
3. Room mappings exist (`channel_mappings` table)
4. Check `last_error` in `channel_events` table

### Issue: Duplicate events

**Check:**
1. Idempotency keys are unique
2. `channel_events.idempotency_key` has unique index
3. Webhook is not being called multiple times

---

## Quick Verification Checklist

- [ ] Migrations run successfully
- [ ] RabbitMQ is running and accessible
- [ ] API server starts without errors
- [ ] Inbound worker starts and connects
- [ ] Outbound worker starts and connects
- [ ] Queues exist in RabbitMQ
- [ ] Webhook endpoint accepts requests
- [ ] Inbound events create reservations
- [ ] Outbound events sync to Beds24
- [ ] DLQ listing endpoint works
- [ ] Retry endpoint works

---

## Next Steps

Once manual testing is complete:
1. Monitor queue depths regularly
2. Set up alerts for DLQ size
3. Review failed events periodically
4. Consider adding automated tests

