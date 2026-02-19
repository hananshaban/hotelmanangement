# Docker Setup & Usage Guide

This guide explains how to use Docker Compose to run the Hotel Management System backend with optional services.

## Overview

The Docker setup includes:

- **API Service** - Main backend application (required)
- **Worker Services** - Inbound, Outbound, and Scheduler workers (optional)
- **PostgreSQL** - Database (optional, can use external)
- **RabbitMQ** - Message queue (optional, can use external)
- **Migration & Seed Tools** - Database setup utilities (optional)

## Architecture

### Services

```
┌─────────────────┐
│   API (Port     │
│   3000)         │
├─────────────────┤
│ Workers         │
├─────────────────┤
│ PostgreSQL      │
│ (Port 5432)     │
├─────────────────┤
│ RabbitMQ        │
│ (5672, 15672)   │
└─────────────────┘
```

### Using Docker Profiles

Services are organized into profiles to allow selective startup:

- **`infra`** - PostgreSQL and RabbitMQ infrastructure
- **`workers`** - Worker processes (inbound, outbound, scheduler)
- **`tools`** - Utilities (migrate, seed)

## Getting Started

### Prerequisites

- Docker & Docker Compose installed
- `.env` file configured (copy from `.env.docker`)

### Setup

1. **Create .env file:**
   ```bash
   cp .env.docker .env
   ```

2. **Update environment variables** as needed in `.env`

## Usage Commands

### Option 1: API Only (External Services)

Start just the API and connect to external PostgreSQL and RabbitMQ:

```bash
docker compose up -d api
```

**Requirements:**
- External PostgreSQL running and accessible at configured `DB_HOST`
- External RabbitMQ running and accessible at configured `RABBITMQ_URL`

### Option 2: API + Infrastructure

Start API with local PostgreSQL and RabbitMQ:

```bash
docker compose --profile infra up -d api
```

**What starts:**
- API service (port 3000)
- PostgreSQL (port 5432)
- RabbitMQ (ports 5672, 15672)

**Access:**
- API: `http://localhost:3000`
- RabbitMQ Management: `http://localhost:15672` (guest/guest)

### Option 3: Full Stack (API + Workers + Infrastructure)

Start everything:

```bash
docker compose --profile infra --profile workers up -d
```

**What starts:**
- API service (port 3000)
- Worker services (inbound, outbound, scheduler)
- PostgreSQL (port 5432)
- RabbitMQ (ports 5672, 15672)

### Option 4: Workers Only (With Infrastructure)

Start only workers with infrastructure:

```bash
docker compose --profile infra --profile workers up -d worker-inbound worker-outbound worker-scheduler
```

## Database Operations

### Run Migrations

The `api` service is configured to run database migrations automatically on startup
inside the container (via `npm run db:migrate && npm run dev`). This means that for a
typical `docker compose up` workflow you **do not need** to run migrations manually.

If you prefer (or need) to run migrations manually, you can still use the tools
profile with infrastructure running:

```bash
docker compose --profile infra --profile tools run migrate
```

Or if you have external PostgreSQL:

```bash
docker compose --profile tools run migrate
```

### Run Seeds

Migrations are handled automatically by the `api` container, but **seeds are not**.
To seed the database, run:

```bash
docker compose --profile infra --profile tools run seed
```

### Combined Setup (Infrastructure + Migrations + Seeds)

```bash
# Start infrastructure
docker compose --profile infra up -d postgres rabbitmq

# Wait for services to be healthy
sleep 10

# Run migrations
docker compose --profile infra --profile tools run migrate

# Run seeds
docker compose --profile infra --profile tools run seed

# Start API and workers
docker compose --profile infra --profile workers up -d
```

## Common Commands

### View Logs

```bash
# All services
docker compose logs -f

# Specific service
docker compose logs -f api
docker compose logs -f worker-inbound

# Last 100 lines
docker compose logs --tail=100 api
```

### Stop Services

```bash
# Stop all services (keep volumes)
docker compose --profile infra --profile workers down

# Stop and remove volumes (clean slate)
docker compose --profile infra --profile workers down -v

# Stop specific service
docker compose stop api
```

### Rebuild Containers

```bash
# Rebuild images
docker compose --profile infra --profile workers build

# Rebuild specific service
docker compose build api
```

### Execute Commands in Containers

```bash
# Run a command in API container
docker compose exec api npm run lint

# Access API container shell
docker compose exec api sh

# Run a command in database container
docker compose exec postgres psql -U postgres -d hotel_pms_dev
```

### Health Check

```bash
# Check service health
docker compose ps

# Manual health check
curl http://localhost:3000/api/health
```

## Environment Configuration

Edit `.env` file to customize:

```env
# Server
NODE_ENV=development
PORT=3000

# Database
DB_HOST=postgres          # or your external DB hostname
DB_PORT=5432
DB_NAME=hotel_pms_dev
DB_USER=postgres
DB_PASSWORD=postgres

# RabbitMQ
RABBITMQ_URL=amqp://guest:guest@rabbitmq:5672
RABBITMQ_USER=guest
RABBITMQ_PASSWORD=guest

# JWT
JWT_SECRET=your_secret_key
JWT_EXPIRES_IN=7d

# Integration APIs
BEDS24_API_KEY=your_api_key
BEDS24_PROP_KEY=your_property_key
QLO_API_URL=your_url
QLO_API_KEY=your_api_key
```

## Production Deployment

For production, use the optimized Dockerfile:

```bash
docker build -f Dockerfile -t hotel-pms:latest .
```

This creates a multi-stage build that:
1. Builds TypeScript to JavaScript
2. Installs only production dependencies
3. Runs as non-root user
4. Significantly smaller final image

## Troubleshooting

### Services Not Starting

```bash
# Check service status
docker compose ps

# View detailed logs
docker compose logs --tail=50 service-name
```

### Database Connection Issues

```bash
# Test PostgreSQL connection
docker compose exec postgres psql -U postgres -c "SELECT 1"

# Check network connectivity
docker compose exec api ping postgres
```

### RabbitMQ Connection Issues

```bash
# Check RabbitMQ status
docker compose exec rabbitmq rabbitmq-diagnostics check_running

# View RabbitMQ logs
docker compose logs rabbitmq
```

### Port Already in Use

```bash
# Find process using port
lsof -i :3000        # API port
lsof -i :5432        # PostgreSQL port
lsof -i :5672        # RabbitMQ AMQP port
lsof -i :15672       # RabbitMQ Management port

# Kill process if needed
kill -9 <PID>
```

### Rebuild and Clean

```bash
# Remove all containers and volumes (WARNING: Data will be lost)
docker compose --profile infra --profile workers down -v

# Prune unused Docker resources
docker system prune -a
```

## Development Workflow

### Watch Mode Development

The API service runs with hot reload (via nodemon):

```bash
docker compose --profile infra up api
```

Any changes to source files will automatically restart the API.

### Debugging Workers

Run individual worker in foreground for debugging:

```bash
docker compose --profile infra logs -f worker-inbound
```

### Adding New Workers

1. Add command in `package.json` scripts
2. Add new service in `docker-compose.yml` with `profiles: [workers]`
3. Start with: `docker compose --profile infra --profile workers up new-worker-name`

## Advanced Usage

### Docker Compose Overrides

Create `docker-compose.override.yml` for local customizations:

```yaml
services:
  api:
    environment:
      - DEBUG=*
```

### Using Different .env Files

```bash
# Use specific env file
docker compose --env-file .env.production up
```

### Custom Networks

Services communicate via the `hotel-network` bridge network.

View network:
```bash
docker network inspect hotel-pms_hotel-network
```

## Performance Tips

1. **Use named volumes** - Already configured for `postgres_data` and `rabbitmq_data`
2. **Enable BuildKit** - `DOCKER_BUILDKIT=1 docker build ...`
3. **Use .dockerignore** - Reduces build context size
4. **Layer caching** - Dockerfile is optimized for cache hits

## Security Considerations

⚠️ **Production Security:**

- Change `JWT_SECRET` to a strong random value
- Change RabbitMQ default credentials
- Use environment-specific `.env` files (never commit credentials)
- Run services as non-root (already configured in Dockerfile)
- Use Docker secrets for sensitive data in Swarm mode
- Enable TLS for RabbitMQ connections
- Restrict network access with firewall rules

## See Also

- [README.md](README.md) - General project setup
- [DATABASE.md](DATABASE.md) - Database documentation
- [docker-compose.yml](docker-compose.yml) - Full compose configuration
