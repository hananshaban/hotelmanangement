import type { Knex } from 'knex';

/**
 * Migration: Create sync_state table
 * 
 * This table tracks the state of scheduled sync operations to:
 * - Prevent overlapping syncs (database lock mechanism)
 * - Store last successful sync timestamp for incremental syncs
 * - Implement exponential backoff on failures
 * - Provide audit trail of sync history
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('sync_state', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    
    // Type of sync operation
    table.string('sync_type', 50).notNullable(); // 'beds24_pull', 'beds24_push', etc.
    
    // Current status
    table.string('status', 20).notNullable(); // 'running', 'completed', 'failed'
    
    // Timing
    table.timestamp('started_at', { useTz: true }).notNullable();
    table.timestamp('completed_at', { useTz: true });
    
    // Last successful sync timestamp (used for incremental syncs)
    table.timestamp('last_successful_sync', { useTz: true });
    
    // Statistics
    table.integer('bookings_processed').defaultTo(0);
    table.integer('bookings_created').defaultTo(0);
    table.integer('bookings_updated').defaultTo(0);
    table.integer('bookings_failed').defaultTo(0);
    table.integer('duration_ms').defaultTo(0);
    
    // Error handling
    table.text('error_message');
    table.timestamp('next_retry_at', { useTz: true });
    table.integer('retry_count').defaultTo(0);
    
    // Metadata
    table.jsonb('metadata'); // Additional sync details
    
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
  });

  // Index for finding running syncs (lock mechanism)
  await knex.schema.raw(`
    CREATE INDEX idx_sync_state_running 
    ON sync_state(sync_type, status, started_at) 
    WHERE status = 'running';
  `);

  // Index for finding last successful sync
  await knex.schema.raw(`
    CREATE INDEX idx_sync_state_last_successful 
    ON sync_state(sync_type, status, completed_at DESC) 
    WHERE status = 'completed';
  `);

  // Index for cleanup of old records
  await knex.schema.raw(`
    CREATE INDEX idx_sync_state_created_at 
    ON sync_state(created_at);
  `);

  // Add check constraint for status
  await knex.schema.raw(`
    ALTER TABLE sync_state 
    ADD CONSTRAINT check_sync_state_status 
    CHECK (status IN ('running', 'completed', 'failed'));
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('sync_state');
}
