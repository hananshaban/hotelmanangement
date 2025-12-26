# Database Setup Guide

## Prerequisites

- PostgreSQL 14+ installed and running
- Node.js 18+ installed

## Initial Setup

### 1. Create the PostgreSQL Database

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

### 2. Configure Environment Variables

Copy `.env.example` to `.env` and update the database credentials:

```bash
cp .env.example .env
```

Edit `.env` and set your PostgreSQL credentials:

```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=hotel_pms_dev
DB_USER=postgres
DB_PASSWORD=your_password_here
```

### 3. Run Migrations

```bash
# Run all pending migrations
npm run db:migrate

# Check migration status
npm run db:migrate:status

# Rollback last migration
npm run db:migrate:rollback

# Rollback all migrations
npm run db:migrate:rollback:all
```

### 4. Seed the Database (Optional)

```bash
npm run db:seed
```

## Database Management Commands

### Migrations

```bash
# Create a new migration
npm run db:migrate:make <migration_name>

# Example: Create hotels table
npm run db:migrate:make create_hotels_table

# Run migrations
npm run db:migrate

# Rollback last migration batch
npm run db:migrate:rollback

# Rollback all migrations
npm run db:migrate:rollback:all

# Check migration status
npm run db:migrate:status
```

### Seeds

```bash
# Create a new seed file
npm run db:seed:make <seed_name>

# Example: Seed hotels
npm run db:seed:make seed_hotels

# Run all seed files
npm run db:seed
```

## Using Knex in Your Code

```typescript
import db from './config/database';

// Select query
const users = await db('users').select('*');

// Insert
await db('users').insert({
  email: 'user@example.com',
  name: 'John Doe'
});

// Update
await db('users')
  .where({ id: 1 })
  .update({ name: 'Jane Doe' });

// Delete
await db('users').where({ id: 1 }).delete();

// Raw query
const result = await db.raw('SELECT NOW()');

// Transactions
await db.transaction(async (trx) => {
  await trx('users').insert({ name: 'User 1' });
  await trx('posts').insert({ title: 'Post 1', user_id: 1 });
});
```

## Database Schema

The database uses PostgreSQL with the following features:

- **UUID primary keys** - Using uuid-ossp extension
- **Timestamps** - Automatic created_at and updated_at
- **Soft deletes** - deleted_at column for soft deletions
- **JSONB columns** - For flexible data storage
- **Foreign keys** - With CASCADE and RESTRICT constraints
- **Indexes** - For optimized queries

## Troubleshooting

### Connection Issues

If you get connection errors:

1. Check PostgreSQL is running:
   ```bash
   sudo systemctl status postgresql
   # or on macOS with Homebrew
   brew services list
   ```

2. Verify credentials in `.env` file

3. Test connection:
   ```bash
   psql -U postgres -d hotel_pms_dev
   ```

### Migration Errors

If migrations fail:

1. Check the migration file for syntax errors
2. Rollback and try again:
   ```bash
   npm run db:migrate:rollback
   npm run db:migrate
   ```

3. Check PostgreSQL logs for detailed errors

### Permission Issues

If you get permission errors:

```bash
# Grant privileges to your user
psql -U postgres
GRANT ALL PRIVILEGES ON DATABASE hotel_pms_dev TO your_user;
```

## Production Considerations

For production environments:

1. Use connection pooling (already configured in knexfile.ts)
2. Enable SSL connections (set `DB_SSL=true` in .env)
3. Use environment variables for all credentials
4. Implement proper backup strategies
5. Monitor connection pool usage
6. Set appropriate pool sizes based on load

## Additional Resources

- [Knex.js Documentation](https://knexjs.org/)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [Knex Migration Guide](https://knexjs.org/guide/migrations.html)
