import type { Knex } from 'knex';

/**
 * Migration: Remove base_url constraint from qloapps_config
 * 
 * Purpose: The PostgreSQL regex constraint is overly strict and rejects valid URLs.
 * Application-level validation is more robust and provides better error messages.
 * 
 * This migration removes the check constraint that was causing issues with valid URLs
 * like "http://localhost:8080/api"
 */
export async function up(knex: Knex): Promise<void> {
  // Check if table exists
  const tableExists = await knex.schema.hasTable('qloapps_config');
  if (!tableExists) {
    console.log('[Migration] qloapps_config table does not exist, skipping...');
    return;
  }

  // Remove the base_url check constraint
  await knex.schema.raw(`
    ALTER TABLE qloapps_config 
    DROP CONSTRAINT IF EXISTS check_qloapps_config_base_url;
  `);

  console.log('[Migration] Successfully removed check_qloapps_config_base_url constraint');
  console.log('[Migration] Base URL validation now handled by application layer');
}

export async function down(knex: Knex): Promise<void> {
  // Re-add the constraint if rolling back
  await knex.schema.raw(`
    ALTER TABLE qloapps_config 
    ADD CONSTRAINT check_qloapps_config_base_url 
    CHECK (base_url ~ '^https?://');
  `);

  console.log('[Migration] Rolled back: re-added check_qloapps_config_base_url constraint');
}

