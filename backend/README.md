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