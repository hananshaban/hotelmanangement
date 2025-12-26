import type { Knex } from 'knex';

/**
 * Enable UUID extension for PostgreSQL
 */
export async function up(knex: Knex): Promise<void> {
  await knex.raw('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
  console.log('✅ UUID extension enabled');
}

/**
 * Disable UUID extension
 */
export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP EXTENSION IF EXISTS "uuid-ossp"');
}
