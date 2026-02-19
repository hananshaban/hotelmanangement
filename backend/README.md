# Hotel Management System (PMS) Backend

A comprehensive Property Management System (PMS) designed to streamline hotel operations, enhance guest experiences, and optimize resource management.

## Tech Stack

- **Node.js** v18+ (Node 22+ recommended)
- **TypeScript** - Type-safe development
- **Express.js** - Web framework
- **Knex.js** - SQL query builder
- **PostgreSQL** - Primary database

## Getting Started

### Prerequisites

- Node.js v18 or higher (Node 22+ recommended)
- PostgreSQL 14+ installed and running
- npm or yarn package manager

### Installation

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Set up environment variables:**
   - Copy `.env.example` to `.env`
   - Update the database credentials and other configurations
   ```bash
   cp .env.example .env
   ```

3. **Create PostgreSQL databases:**
   ```bash
   # Connect to PostgreSQL
   psql -U postgres

   # Create development database
   CREATE DATABASE hotel_pms_dev;

   # Create test database  
   CREATE DATABASE hotel_pms_test;

   # Exit psql
   \q
   ```

4. **Run database migrations:**
   ```bash
   npm run db:migrate
   ```

5. **Seed the database (optional):**
   ```bash
   npm run db:seed
   ```

6. **Start the development server:**
   ```bash
   npm run dev
   ```

7. **Access the API at** `http://localhost:3000`

## Running the Full System with Docker

To run the **full integration environment** – backend PMS (API + workers), infrastructure (**PostgreSQL + RabbitMQ**), and the external **QloApps PMS** (via official Docker image) – use Docker and Docker Compose.

For more Docker details, see [`DOCKER.md`](./DOCKER.md). The summary below focuses on the “everything running together” path.

### 1. Prerequisites

- Docker and Docker Compose installed
- Port availability:
  - `3000` for the backend API
  - `5432` for PostgreSQL
  - `5672` and `15672` for RabbitMQ
  - `80` / `3306` / `2222` (or alternates) for the QloApps container

### 2. Backend environment for Docker

In the `backend/` directory:

1. **Create a Docker env file** (based on `.env.docker`):

   ```bash
   cd backend
   cp .env.docker .env
   ```

2. **Adjust key variables** in `.env` as needed (DB, RabbitMQ, JWT, QloApps/Beds24 keys, etc.).  
   The Docker compose file already defaults `DB_HOST=postgres` and `RABBITMQ_URL=amqp://guest:guest@rabbitmq:5672`.

### 3. Start infrastructure (PostgreSQL + RabbitMQ)

From `backend/`:

```bash
docker compose --profile infra up -d postgres rabbitmq
```

This will start:

- `postgres` on port `5432`
- `rabbitmq` on ports `5672` (AMQP) and `15672` (management UI)

You can verify with:

```bash
docker compose ps
```

### 4. Run database migrations and seeds (inside Docker)

With infra running:

```bash
# Run migrations
docker compose --profile infra --profile tools run --rm migrate

# Run seeds (optional but recommended for initial data)
docker compose --profile infra --profile tools run --rm seed
```

These commands use the `migrate` and `seed` services defined in `docker-compose.yml` and connect to the `postgres` container.

### 5. Start backend API and workers (PMS side)

To run the API plus all QloApps workers:

```bash
docker compose \
  --profile infra \
  --profile workers \
  up -d api worker-inbound worker-outbound worker-scheduler
```

What you get:

- `api` at `http://localhost:3000`
- `worker-inbound`, `worker-outbound`, `worker-scheduler` connected to RabbitMQ and PostgreSQL

Logs:

```bash
docker compose logs -f api
docker compose logs -f worker-inbound
docker compose logs -f worker-outbound
docker compose logs -f worker-scheduler
```

### 6. Run QloApps PMS via official Docker image

To start a standalone QloApps PMS instance (used by this backend as an external channel/PMS), use the official Docker image from Webkul [`webkul/qloapps_docker`](https://hub.docker.com/r/webkul/qloapps_docker):

1. **Pull the image**:

   ```bash
   docker pull webkul/qloapps_docker:latest
   ```

2. **Run the container** (adjust passwords and DB name):

   ```bash
   docker run -tid \
     -p 80:80 \
     -p 3306:3306 \
     -p 2222:22 \
     --name qloapps \
     -e USER_PASSWORD=qloappsuserpassword \
     -e MYSQL_ROOT_PASSWORD=myrootpassword \
     -e MYSQL_DATABASE=qlo170 \
     webkul/qloapps_docker:latest
   ```

   - Port `80` → QloApps web UI
   - Port `3306` → MySQL in the QloApps container
   - Port `2222` → SSH access to the container

   For more details and version‑specific notes, see the Docker Hub docs: [`webkul/qloapps_docker`](https://hub.docker.com/r/webkul/qloapps_docker).

3. **Complete QloApps installation** in the browser:

   - Open `http://localhost/` (or your server IP) and follow the QloApps installer.
   - For v1.7.0, when asked for the MySQL host, use `127.0.0.1` (per the Docker Hub instructions).
   - After installation, remove the `/install` directory inside the container:

     ```bash
     docker exec -i qloapps rm -rf /home/qloapps/www/QloApps/install
     ```

4. **Configure QloApps integration in this PMS**:

   - Create a QloApps WebService API key inside QloApps.
   - In this backend, set `QLO_API_URL` and `QLO_API_KEY` in `.env` so the API and workers can talk to QloApps.
   - Use the admin UI / API endpoints to configure `qloapps_config` (base URL, API key, QloApps hotel ID).

### 7. Run the frontend (PMS UI)

The frontend currently runs as a Vite dev server (not yet containerized). In a second terminal:

```bash
cd frontend
npm install
npm run dev
```

By default, the frontend will be available at `http://localhost:5173` and should be configured to talk to the backend API at `http://localhost:3000`.

> Note: Backend services (API + workers), infrastructure (PostgreSQL + RabbitMQ), and QloApps PMS are all running in Docker. The frontend runs via Vite on the host; you can add a small Dockerfile/frontend compose service later if you want a fully containerized UI as well.

## Available Scripts

### Development
- `npm run dev` - Start development server with hot reload
- `npm run build` - Build TypeScript to JavaScript
- `npm start` - Start production server

### Database Management
- `npm run db:migrate` - Run all pending migrations
- `npm run db:migrate:make <name>` - Create a new migration
- `npm run db:migrate:rollback` - Rollback last migration
- `npm run db:migrate:status` - Check migration status
- `npm run db:seed` - Run database seeds
- `npm run db:seed:make <name>` - Create a new seed file

### Code Quality
- `npm run lint` - Run ESLint
- `npm run lint:fix` - Fix ESLint errors
- `npm run format` - Format code with Prettier
- `npm test` - Run tests

## Project Structure

```
backend/
├── src/
│   ├── config/              # Configuration files
│   │   └── database.ts      # Database connection
│   ├── database/
│   │   ├── migrations/      # Database migrations
│   │   └── seeds/           # Database seed files
│   ├── services/            # Business logic
│   ├── routes/              # API routes
│   ├── middleware/          # Express middleware
│   ├── app.ts              # Express app setup
│   └── server.ts           # Server entry point
├── knexfile.ts             # Knex configuration
├── tsconfig.json           # TypeScript configuration
├── package.json
└── .env                    # Environment variables
```

## Database

This project uses PostgreSQL with Knex.js for query building and migrations.

See [DATABASE.md](./DATABASE.md) for detailed database setup and management instructions.

## Environment Variables

Required environment variables (see `.env.example`):

```env
# Server
NODE_ENV=development
PORT=3000

# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=hotel_pms_dev
DB_USER=postgres
DB_PASSWORD=your_password

# JWT
JWT_SECRET=your_secret_key
JWT_EXPIRES_IN=7d

# Beds24 Integration
BEDS24_API_KEY=your_api_key
BEDS24_PROP_KEY=your_property_key
```

## License

This project is for demonstration purposes.