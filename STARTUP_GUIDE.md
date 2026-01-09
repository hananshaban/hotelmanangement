# 🚀 Hotel Management System - Complete Startup Guide

## Overview
This guide provides step-by-step instructions to start all required services for the Hotel Management System with QloApps PMS integration.

## 📋 Prerequisites

### Required Software
- **Node.js**: v18+ or v20+ (LTS recommended)
- **PostgreSQL**: v14+ 
- **RabbitMQ**: v3.12+
- **npm** or **yarn**: Package manager

### Environment Setup
Ensure you have the following environment variables configured in your `.env` files:

#### Backend `.env`
```bash
# Database
DATABASE_URL=postgresql://username:password@localhost:5432/hotel_management
DB_HOST=localhost
DB_PORT=5432
DB_NAME=hotel_management
DB_USER=your_db_user
DB_PASSWORD=your_db_password

# RabbitMQ
RABBITMQ_URL=amqp://localhost:5672
RABBITMQ_HOST=localhost
RABBITMQ_PORT=5672
RABBITMQ_USER=guest
RABBITMQ_PASSWORD=guest

# JWT
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_REFRESH_SECRET=your-super-secret-refresh-key-change-this-in-production

# Encryption (for storing API keys)
ENCRYPTION_KEY=your-32-character-encryption-key

# Server
PORT=3000
NODE_ENV=development

# QloApps (optional - configured via UI)
QLOAPPS_SYNC_INTERVAL_MS=300000  # 5 minutes
```

#### Frontend `.env`
```bash
VITE_API_URL=http://localhost:3000/api
```

---

## 🗄️ Step 1: Start PostgreSQL

### On Ubuntu/Debian:
```bash
# Check if PostgreSQL is running
sudo systemctl status postgresql

# Start PostgreSQL if not running
sudo systemctl start postgresql

# Enable auto-start on boot
sudo systemctl enable postgresql
```

### On macOS (using Homebrew):
```bash
# Start PostgreSQL
brew services start postgresql@14

# Or start without background service
pg_ctl -D /opt/homebrew/var/postgresql@14 start
```

### On Windows:
- Open **Services** (Win + R, type `services.msc`)
- Find **PostgreSQL** service
- Right-click → **Start**

### Verify PostgreSQL is running:
```bash
psql -U postgres -c "SELECT version();"
```

### Create Database (first time only):
```bash
# Connect to PostgreSQL
psql -U postgres

# Create database
CREATE DATABASE hotel_management;

# Create user (if needed)
CREATE USER your_db_user WITH PASSWORD 'your_db_password';

# Grant privileges
GRANT ALL PRIVILEGES ON DATABASE hotel_management TO your_db_user;

# Exit
\q
```

---

## 🐰 Step 2: Start RabbitMQ

### On Ubuntu/Debian:
```bash
# Check if RabbitMQ is running
sudo systemctl status rabbitmq-server

# Start RabbitMQ if not running
sudo systemctl start rabbitmq-server

# Enable auto-start on boot
sudo systemctl enable rabbitmq-server

# Enable Management Plugin (for web UI)
sudo rabbitmq-plugins enable rabbitmq_management
```

### On macOS (using Homebrew):
```bash
# Start RabbitMQ
brew services start rabbitmq

# Or start without background service
rabbitmq-server
```

### On Windows:
- Open **Services** (Win + R, type `services.msc`)
- Find **RabbitMQ** service
- Right-click → **Start**

### Verify RabbitMQ is running:
```bash
# Check status
sudo rabbitmqctl status

# Or visit RabbitMQ Management UI
# Open browser: http://localhost:15672
# Default credentials: guest / guest
```

### Check RabbitMQ Queues:
```bash
# List all queues
sudo rabbitmqctl list_queues

# You should see these QloApps queues after backend starts:
# - qloapps.inbound
# - qloapps.inbound.dlq
# - qloapps.outbound
# - qloapps.outbound.dlq
```

---

## 🖥️ Step 3: Start Backend Server

### Navigate to backend directory:
```bash
cd backend
```

### Install dependencies (first time only):
```bash
npm install
# or
yarn install
```

### Run database migrations (first time only):
```bash
npm run migrate
# or
npx knex migrate:latest
```

### Seed initial data (first time only):
```bash
npm run seed
# or
npx knex seed:run
```

### Start the backend server:
```bash
# Development mode with auto-reload
npm run dev

# Production mode
npm run build
npm start
```

### Verify backend is running:
- Open browser: http://localhost:3000/api/health
- You should see: `{"status":"ok"}`

### Check logs:
- Backend will log startup messages
- Look for: `Server running on port 3000`
- Check for any error messages

---

## ⚙️ Step 4: Start QloApps Inbound Worker

**Important**: This worker processes pull sync messages from QloApps.

### Open a new terminal window/tab:
```bash
cd backend
```

### Start the inbound worker:
```bash
# Using npm script (recommended)
npm run worker:qloapps-inbound

# Or using tsx directly
npx tsx src/workers/qloapps_inbound_worker.ts
```

### Verify worker is running:
You should see logs:
```
[QloApps InboundWorker] Initializing...
[QloApps Inbound] Worker started
[QloApps InboundWorker] Running. Press Ctrl+C to stop.
```

### Common Issues:
- **"Cannot connect to RabbitMQ"**: Make sure RabbitMQ is running (Step 2)
- **"Database connection failed"**: Check PostgreSQL is running (Step 1)
- **Worker exits immediately**: Check for error logs above the exit message

---

## ⚙️ Step 5: Start QloApps Sync Scheduler (Optional)

**Optional**: Only needed if you want automatic scheduled syncs every 5 minutes.

### Open another new terminal window/tab:
```bash
cd backend
```

### Start the sync scheduler:
```bash
# Using npm script
npm run worker:qloapps-scheduler

# Or using tsx directly
npx tsx src/workers/qloapps_sync_scheduler.ts
```

### Verify scheduler is running:
You should see logs:
```
[QloApps Sync] 🔄 Starting QloApps sync scheduler...
[QloApps Sync] ⏰ Default sync interval: 300s
[QloApps Sync] 📋 Found X enabled QloApps configuration(s)
[QloApps Sync] ⏳ Starting first sync in 5 seconds...
```

### To disable automatic sync:
- Go to Settings → Channel Manager tab in the UI
- Disable sync in QloApps configuration
- Or simply don't run this scheduler worker

---

## 🌐 Step 6: Start Frontend

### Open a new terminal window/tab:
```bash
cd frontend
```

### Install dependencies (first time only):
```bash
npm install
# or
yarn install
```

### Start the frontend dev server:
```bash
# Development mode with hot reload
npm run dev

# Or with specific host
npm run dev -- --host 0.0.0.0
```

### Verify frontend is running:
- Open browser: http://localhost:5173 (or port shown in console)
- You should see the login page
- Default admin credentials (after seeding):
  - Email: `admin@hotel.com`
  - Password: `admin123`

---

## 📊 Step 7: Verify All Services

### Service Checklist:
- [ ] **PostgreSQL**: Running on port 5432
- [ ] **RabbitMQ**: Running on port 5672 (Management UI on 15672)
- [ ] **Backend Server**: Running on port 3000
- [ ] **QloApps Inbound Worker**: Running and listening for messages
- [ ] **QloApps Sync Scheduler** (optional): Running if auto-sync is desired
- [ ] **Frontend**: Running on port 5173

### Quick Verification Commands:
```bash
# Check PostgreSQL
psql -U postgres -c "SELECT version();" 2>/dev/null && echo "✓ PostgreSQL OK" || echo "✗ PostgreSQL DOWN"

# Check RabbitMQ
sudo rabbitmqctl status 2>/dev/null && echo "✓ RabbitMQ OK" || echo "✗ RabbitMQ DOWN"

# Check Backend
curl http://localhost:3000/api/health 2>/dev/null && echo "✓ Backend OK" || echo "✗ Backend DOWN"

# Check Frontend
curl http://localhost:5173 2>/dev/null && echo "✓ Frontend OK" || echo "✗ Frontend DOWN"
```

---

## 🔧 Step 8: Configure QloApps Integration

### 1. Login to the application:
- Open http://localhost:5173
- Login with admin credentials

### 2. Navigate to Settings:
- Click **Settings** in the sidebar
- Go to **Channel Manager** tab

### 3. Setup QloApps Configuration:
- Click **"Setup QloApps Connection"** button
- Fill in the form:
  - **QloApps Base URL**: Your QloApps instance URL (e.g., `http://localhost:8080`)
  - **QloApps Hotel ID**: Your hotel ID from QloApps (e.g., `1`)
  - **WebService API Key**: Your QloApps WebService API key
- Click **"Save Configuration"**

### 4. Test Connection:
- Click **"Test Connection"** button
- You should see a success message

### 5. Trigger Manual Pull Sync:
- Click **"↓ Pull Updates"** for incremental sync
- Or click **"⟲ Full Sync"** for full sync
- Watch the sync status in real-time

---

## 🐛 Troubleshooting

### Backend won't start:
```bash
# Check if port 3000 is already in use
lsof -i :3000
# Kill the process if needed
kill -9 <PID>

# Check database connection
psql -U your_db_user -d hotel_management -c "SELECT 1;"

# Check .env file exists and has correct values
cat backend/.env
```

### Worker won't start:
```bash
# Check RabbitMQ is accessible
curl -u guest:guest http://localhost:15672/api/overview

# Check backend is running (worker needs DB connection)
curl http://localhost:3000/api/health

# Check worker logs for specific error messages
npm run worker:qloapps-inbound 2>&1 | tee worker.log
```

### Frontend won't connect to backend:
```bash
# Check VITE_API_URL in frontend/.env
cat frontend/.env

# Verify backend health endpoint
curl http://localhost:3000/api/health

# Check browser console for CORS errors
# If CORS issues, ensure backend allows frontend origin
```

### Sync keeps running forever:
**This was the original issue - now fixed!**
- Make sure **QloApps Inbound Worker** is running
- Check worker logs for processing messages
- Verify sync state in database:
  ```sql
  SELECT * FROM qloapps_sync_state ORDER BY started_at DESC LIMIT 5;
  ```
- Check RabbitMQ queues:
  ```bash
  sudo rabbitmqctl list_queues name messages consumers
  ```

### RabbitMQ queues not created:
- Restart backend server (queues are created on startup)
- Check backend logs for RabbitMQ connection errors
- Visit http://localhost:15672 to inspect queues manually

---

## 📝 Useful Commands

### View RabbitMQ Queues:
```bash
# List all queues with message counts
sudo rabbitmqctl list_queues name messages messages_ready

# Clear all messages from a queue (if stuck)
sudo rabbitmqctl purge_queue qloapps.inbound
```

### Database Queries:
```sql
-- Check QloApps configuration
SELECT id, base_url, sync_enabled, last_successful_sync 
FROM qloapps_config;

-- Check recent sync states
SELECT sync_type, status, started_at, completed_at, 
       reservations_processed, reservations_created, 
       reservations_updated, reservations_failed
FROM qloapps_sync_state
ORDER BY started_at DESC
LIMIT 10;

-- Check sync logs
SELECT sync_type, direction, status, started_at, completed_at,
       records_processed, records_created, records_updated, records_failed
FROM qloapps_sync_logs
ORDER BY started_at DESC
LIMIT 10;

-- Check reservation mappings
SELECT * FROM qloapps_reservation_mappings
ORDER BY created_at DESC
LIMIT 10;
```

### Process Management:
```bash
# Find backend process
ps aux | grep "node.*backend"

# Find worker processes
ps aux | grep "worker.*qloapps"

# Kill all Node processes (careful!)
pkill -f node

# Better: use process managers in production
# PM2 example:
pm2 start backend/dist/server.js --name backend
pm2 start backend/dist/workers/qloapps_inbound_worker.js --name qloapps-worker
pm2 list
pm2 logs
pm2 stop all
```

---

## 🎯 Quick Start Script

Create a file `start-all.sh`:

```bash
#!/bin/bash

echo "🚀 Starting Hotel Management System..."

# Check PostgreSQL
echo "📊 Checking PostgreSQL..."
if ! pg_isready -q; then
    echo "❌ PostgreSQL is not running. Please start it first."
    exit 1
fi
echo "✅ PostgreSQL is running"

# Check RabbitMQ
echo "🐰 Checking RabbitMQ..."
if ! sudo rabbitmqctl status &>/dev/null; then
    echo "❌ RabbitMQ is not running. Please start it first."
    exit 1
fi
echo "✅ RabbitMQ is running"

# Start backend in background
echo "🖥️  Starting backend..."
cd backend
npm run dev &
BACKEND_PID=$!
sleep 5

# Start worker in background
echo "⚙️  Starting QloApps inbound worker..."
npm run worker:qloapps-inbound &
WORKER_PID=$!
sleep 2

# Start frontend in background
echo "🌐 Starting frontend..."
cd ../frontend
npm run dev &
FRONTEND_PID=$!

echo ""
echo "✅ All services started!"
echo "   Backend PID: $BACKEND_PID"
echo "   Worker PID: $WORKER_PID"
echo "   Frontend PID: $FRONTEND_PID"
echo ""
echo "🌐 Open http://localhost:5173 in your browser"
echo "🛠️  Press Ctrl+C to stop all services"

# Wait for Ctrl+C
wait
```

Make it executable:
```bash
chmod +x start-all.sh
./start-all.sh
```

---

## 🎉 Success!

If all services are running correctly, you should be able to:
1. ✅ Login to the application
2. ✅ Configure QloApps connection
3. ✅ Test QloApps connection
4. ✅ Manually trigger pull sync
5. ✅ See sync complete within seconds (not hanging forever)
6. ✅ View synced reservations in the Reservations page

**Happy syncing! 🚀**

