import type { Knex } from 'knex';

/**
 * Migration: Remove circuit breaker columns from qloapps_config
 * 
 * Purpose: Clean up circuit breaker pattern that has been removed.
 * This migration drops columns and constraints that are no longer needed.
 * 
 * Removes:
 * - consecutive_failures column
 * - circuit_state column (if exists)
 * - circuit_opened_at column (if exists)
 * - circuit_breaker_until column
 * - Related indexes and constraints
 */
export async function up(knex: Knex): Promise<void> {
  // Check if table exists
  const tableExists = await knex.schema.hasTable('qloapps_config');
  if (!tableExists) {
    console.log('[Migration] qloapps_config table does not exist, skipping...');
    return;
  }

  // Drop constraint if exists (consecutive_failures check)
  await knex.schema.raw(`
    ALTER TABLE qloapps_config 
    DROP CONSTRAINT IF EXISTS check_qloapps_config_failures;
  `);

  // Drop index if exists (circuit breaker ready for sync)
  await knex.schema.raw(`
    DROP INDEX IF EXISTS idx_qloapps_config_ready_for_sync;
  `);

  // Drop columns if they exist using raw SQL with conditional checks
  // This approach is transaction-safe and won't fail if columns don't exist
  await knex.schema.raw(`
    DO $$ 
    BEGIN
      -- Drop consecutive_failures column if exists
      IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'qloapps_config' 
        AND column_name = 'consecutive_failures'
      ) THEN
        ALTER TABLE qloapps_config DROP COLUMN consecutive_failures;
      END IF;

      -- Drop circuit_state column if exists
      IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'qloapps_config' 
        AND column_name = 'circuit_state'
      ) THEN
        ALTER TABLE qloapps_config DROP COLUMN circuit_state;
      END IF;

      -- Drop circuit_opened_at column if exists
      IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'qloapps_config' 
        AND column_name = 'circuit_opened_at'
      ) THEN
        ALTER TABLE qloapps_config DROP COLUMN circuit_opened_at;
      END IF;

      -- Drop circuit_breaker_until column if exists
      IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'qloapps_config' 
        AND column_name = 'circuit_breaker_until'
      ) THEN
        ALTER TABLE qloapps_config DROP COLUMN circuit_breaker_until;
      END IF;
    END $$;
  `);

  console.log('[Migration] Successfully removed circuit breaker columns from qloapps_config');
}

export async function down(knex: Knex): Promise<void> {
  // Re-add the columns if we need to rollback
  await knex.schema.table('qloapps_config', (table) => {
    table
      .integer('consecutive_failures')
      .notNullable()
      .defaultTo(0)
      .comment('Count of consecutive sync failures, reset on success');
    
    table
      .timestamp('circuit_breaker_until', { useTz: true })
      .comment('If set, sync is paused until this timestamp (circuit breaker)');
  });

  // Re-add constraint
  await knex.schema.raw(`
    ALTER TABLE qloapps_config 
    ADD CONSTRAINT check_qloapps_config_failures 
    CHECK (consecutive_failures >= 0);
  `);

  // Re-add index
  await knex.schema.raw(`
    CREATE INDEX idx_qloapps_config_ready_for_sync 
    ON qloapps_config(sync_enabled, circuit_breaker_until) 
    WHERE sync_enabled = true;
  `);

  console.log('[Migration] Rolled back circuit breaker column removal');
}

