import knexLib from 'knex';
import type { Knex } from 'knex';
import knexConfig from '../../knexfile.js';

const environment = process.env.NODE_ENV || 'development';
const config = knexConfig[environment];

if (!config) {
  throw new Error(`No database configuration found for environment: ${environment}`);
}

const db: Knex = knexLib(config);

// Test database connection
db.raw('SELECT 1')
  .then(() => {
    console.log('✅ PostgreSQL database connected successfully');
  })
  .catch((err) => {
    console.error('❌ PostgreSQL database connection failed:', err.message);
    process.exit(1);
  });

export default db;
