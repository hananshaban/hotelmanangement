import type { Knex } from 'knex';

/**
 * Migration to add sync status tracking fields to beds24_config table
 * Phase 2: Initial Sync Execution & Tracking
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('beds24_config', (table) => {
    // Sync status tracking
    table.string('sync_status', 20).defaultTo('idle').comment('Sync status: idle, running, completed, failed');
    table.jsonb('sync_progress').defaultTo('{}').comment('Sync progress: { rooms: { total, synced, errors }, reservations: { total, synced, errors } }');
    table.jsonb('sync_errors').defaultTo('[]').comment('Array of sync errors');
    table.timestamp('sync_started_at', { useTz: true }).nullable().comment('When sync started');
    table.timestamp('sync_completed_at', { useTz: true }).nullable().comment('When sync completed');
  });

  // Add check constraint for sync_status
  await knex.schema.raw(`
    ALTER TABLE beds24_config 
    ADD CONSTRAINT check_beds24_config_sync_status 
    CHECK (sync_status IN ('idle', 'running', 'completed', 'failed'));
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.raw(`
    ALTER TABLE beds24_config 
    DROP CONSTRAINT IF EXISTS check_beds24_config_sync_status;
  `);

  await knex.schema.alterTable('beds24_config', (table) => {
    table.dropColumn('sync_status');
    table.dropColumn('sync_progress');
    table.dropColumn('sync_errors');
    table.dropColumn('sync_started_at');
    table.dropColumn('sync_completed_at');
  });
}



