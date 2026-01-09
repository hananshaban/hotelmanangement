# QloApps Workers Guide

## Overview

QloApps integration requires three separate worker processes to run alongside the main API server for full synchronization functionality:

1. **Inbound Worker** - Processes incoming sync messages from QloApps
2. **Outbound Worker** - Processes outgoing sync messages to QloApps
3. **Sync Scheduler** - Runs periodic pull syncs from QloApps

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         QloApps Integration                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  Main API Server                QloApps Workers (Separate)       │
│  ┌──────────────┐              ┌──────────────────────────────┐ │
│  │              │              │                              │ │
│  │  Express API │              │  1. Inbound Worker          │ │
│  │  Server      │──queues──────│     - Pulls from QloApps    │ │
│  │              │  messages    │     - Creates/updates PMS   │ │
│  │  Port: 5000  │              │                              │ │
│  └──────────────┘              │  2. Outbound Worker         │ │
│                                │     - Pushes to QloApps     │ │
│                                │     - Syncs PMS changes     │ │
│                                │                              │ │
│                                │  3. Sync Scheduler          │ │
│                                │     - Periodic pull sync    │ │
│                                │     - Runs every N minutes  │ │
│                                └──────────────────────────────┘ │
│                                                                   │
│                      RabbitMQ Message Broker                      │
│                   ┌──────────────────────────────┐               │
│                   │  qloapps.inbound             │               │
│                   │  qloapps.outbound            │               │
│                   │  qloapps.dlq (dead letter)   │               │
│                   └──────────────────────────────┘               │
└─────────────────────────────────────────────────────────────────┘
```

## Worker Processes

### 1. QloApps Inbound Worker

**Purpose:** Processes messages that pull bookings from QloApps into the PMS

**File:** `backend/src/workers/qloapps_inbound_worker.ts`

**What it does:**
- Consumes messages from `qloapps.inbound` queue
- Pulls bookings from QloApps API
- Creates or updates reservations in PMS
- Handles guest matching and room mapping
- Stores mappings for bidirectional sync

**Start command:**
```bash
npm run worker:qloapps-inbound
```

**Environment variables:**
- Uses standard database and RabbitMQ connections
- No additional config required

---

### 2. QloApps Outbound Worker

**Purpose:** Processes messages that push PMS reservations to QloApps

**File:** `backend/src/workers/qloapps_outbound_worker.ts`

**What it does:**
- Consumes messages from `qloapps.outbound` queue
- Pushes reservations from PMS to QloApps API
- Creates or updates bookings in QloApps
- Syncs availability and rates
- Handles customer creation/matching

**Start command:**
```bash
npm run worker:qloapps-outbound
```

**Environment variables:**
- Uses standard database and RabbitMQ connections
- No additional config required

---

### 3. QloApps Sync Scheduler

**Purpose:** Runs periodic pull syncs from QloApps on a schedule

**File:** `backend/src/workers/qloapps_sync_scheduler.ts`

**What it does:**
- Runs on a configurable interval (default: 5 minutes)
- Pulls modified bookings from QloApps API
- Performs incremental syncs (only changed data)
- Falls back to full sync if needed
- Updates `last_successful_sync` timestamp

**Start command:**
```bash
npm run worker:qloapps-sync
```

**Environment variables:**
- `QLOAPPS_SYNC_INTERVAL_MS` - Sync interval in milliseconds (default: 300000 = 5 minutes)

**Example:**
```bash
# Run sync every 10 minutes
QLOAPPS_SYNC_INTERVAL_MS=600000 npm run worker:qloapps-sync
```

---

## Starting Workers

### Development Mode

Start all services (API + all workers):
```bash
npm run dev:all
```

Or start workers individually in separate terminals:

**Terminal 1 - API Server:**
```bash
cd backend
npm run dev
```

**Terminal 2 - Inbound Worker:**
```bash
cd backend
npm run worker:qloapps-inbound
```

**Terminal 3 - Outbound Worker:**
```bash
cd backend
npm run worker:qloapps-outbound
```

**Terminal 4 - Sync Scheduler:**
```bash
cd backend
npm run worker:qloapps-sync
```

### Production Mode

Build first:
```bash
cd backend
npm run build
```

Start all services:
```bash
npm start:all
```

Or use a process manager like PM2:

```bash
# Install PM2
npm install -g pm2

# Start all processes
pm2 start dist/src/server.js --name "api-server"
pm2 start dist/src/workers/qloapps_inbound_worker.js --name "qloapps-inbound"
pm2 start dist/src/workers/qloapps_outbound_worker.js --name "qloapps-outbound"
pm2 start dist/src/workers/qloapps_sync_scheduler.js --name "qloapps-sync"

# Save process list
pm2 save

# Setup auto-restart on system boot
pm2 startup
```

## Docker Deployment

**docker-compose.yml example:**

```yaml
version: '3.8'

services:
  api:
    build: ./backend
    command: node dist/src/server.js
    ports:
      - "5000:5000"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://...
      - RABBITMQ_URL=amqp://rabbitmq:5672
    depends_on:
      - postgres
      - rabbitmq

  qloapps-inbound:
    build: ./backend
    command: node dist/src/workers/qloapps_inbound_worker.js
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://...
      - RABBITMQ_URL=amqp://rabbitmq:5672
    depends_on:
      - postgres
      - rabbitmq

  qloapps-outbound:
    build: ./backend
    command: node dist/src/workers/qloapps_outbound_worker.js
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://...
      - RABBITMQ_URL=amqp://rabbitmq:5672
    depends_on:
      - postgres
      - rabbitmq

  qloapps-sync:
    build: ./backend
    command: node dist/src/workers/qloapps_sync_scheduler.js
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://...
      - RABBITMQ_URL=amqp://rabbitmq:5672
      - QLOAPPS_SYNC_INTERVAL_MS=300000
    depends_on:
      - postgres
      - rabbitmq

  postgres:
    image: postgres:15
    # ... postgres config

  rabbitmq:
    image: rabbitmq:3-management
    # ... rabbitmq config
```

## Monitoring

### Check Worker Status

**Using PM2:**
```bash
pm2 status
pm2 logs qloapps-inbound
pm2 logs qloapps-outbound
pm2 logs qloapps-sync
```

**Manual check:**
```bash
# Check if workers are running
ps aux | grep qloapps

# View worker logs (if using stdout)
tail -f logs/qloapps-inbound.log
tail -f logs/qloapps-outbound.log
tail -f logs/qloapps-sync.log
```

### RabbitMQ Management

Access RabbitMQ management UI:
- URL: `http://localhost:15672`
- Default credentials: `guest` / `guest`

Check queue status:
- `qloapps.inbound` - Incoming sync messages
- `qloapps.outbound` - Outgoing sync messages
- `qloapps.dlq` - Failed messages

## Troubleshooting

### Workers Not Processing Messages

1. **Check RabbitMQ connection:**
   ```bash
   # Verify RabbitMQ is running
   systemctl status rabbitmq-server
   
   # Check RabbitMQ logs
   tail -f /var/log/rabbitmq/rabbit@hostname.log
   ```

2. **Check worker logs:**
   - Look for connection errors
   - Check for authentication issues
   - Verify QloApps API credentials

3. **Verify QloApps configuration:**
   ```bash
   # In PostgreSQL
   SELECT * FROM qloapps_config;
   
   # Check if sync_enabled is true
   # Check if api_key_encrypted is set
   ```

### Sync Not Running

1. **Check sync scheduler:**
   - Verify scheduler process is running
   - Check `QLOAPPS_SYNC_INTERVAL_MS` environment variable
   - Look for error logs

2. **Check database sync state:**
   ```sql
   SELECT * FROM qloapps_sync_state ORDER BY started_at DESC LIMIT 10;
   ```

3. **Manually trigger sync:**
   - Use the API endpoint: `POST /api/v1/qloapps/sync`

### Messages Stuck in Dead Letter Queue

1. **Check DLQ:**
   ```bash
   # Using RabbitMQ management or rabbitmqadmin
   rabbitmqadmin get queue=qloapps.dlq count=10
   ```

2. **Common causes:**
   - Invalid QloApps credentials
   - Network timeout to QloApps API
   - Data validation errors
   - Missing room type mappings

3. **Resolution:**
   - Fix the root cause
   - Requeue messages from DLQ
   - Or manually process failed bookings

## Performance Tuning

### Sync Interval

Adjust based on booking volume and QloApps API limits:

```bash
# High volume - sync every 2 minutes
QLOAPPS_SYNC_INTERVAL_MS=120000 npm run worker:qloapps-sync

# Low volume - sync every 15 minutes
QLOAPPS_SYNC_INTERVAL_MS=900000 npm run worker:qloapps-sync
```

### Worker Concurrency

For high-volume operations, consider running multiple worker instances:

```bash
# Start 2 inbound workers
pm2 start dist/src/workers/qloapps_inbound_worker.js -i 2 --name "qloapps-inbound"

# Start 2 outbound workers
pm2 start dist/src/workers/qloapps_outbound_worker.js -i 2 --name "qloapps-outbound"
```

## Security Notes

1. **API Keys:** Stored encrypted in database
2. **Network:** Workers need access to:
   - Database (PostgreSQL)
   - Message broker (RabbitMQ)
   - QloApps API (external)
3. **Firewall:** Ensure outbound HTTPS (443) is allowed for QloApps API

## FAQ

**Q: Do I need all three workers?**
A: Yes, for full bidirectional sync:
- Inbound: Receives bookings from QloApps
- Outbound: Sends PMS changes to QloApps
- Scheduler: Periodic sync to catch any missed updates

**Q: Can I run workers on the same machine as the API?**
A: Yes, they can all run on the same machine. Just ensure adequate resources.

**Q: What happens if a worker crashes?**
A: Messages remain in RabbitMQ queues. Restart the worker and it will continue processing. Use PM2 or systemd for auto-restart.

**Q: How do I disable Beds24 and use only QloApps?**
A: Beds24 is already disabled by default. Just configure QloApps from the Settings page and the system will use it exclusively.

## Additional Resources

- QloApps API Documentation: https://devdocs.qloapps.com/webservice/
- RabbitMQ Documentation: https://www.rabbitmq.com/documentation.html
- PM2 Documentation: https://pm2.keymetrics.io/docs/usage/quick-start/

