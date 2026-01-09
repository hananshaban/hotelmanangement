import type { Knex } from 'knex';

/**
 * Migration: Create qloapps_config table
 * 
 * Purpose: Store QloApps channel manager integration configuration.
 * 
 * This table stores:
 * - Connection settings (base URL, encrypted API key)
 * - QloApps hotel ID for API calls
 * - Sync configuration flags (enable/disable different sync types)
 * - Status tracking (last sync, errors)
 * 
 * Design decisions:
 * - Single config per property (enforced by unique constraint)
 * - API key encrypted at application level (not database level)
 * - Separate flags for inbound/outbound reservation sync
 * - Default property_id matches hotel_settings fixed UUID
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('qloapps_config', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    
    // Reference to hotel_settings (single property system)
    table
      .uuid('property_id')
      .notNullable()
      .defaultTo(knex.raw("'00000000-0000-0000-0000-000000000001'::uuid"))
      .references('id')
      .inTable('hotel_settings')
      .onDelete('CASCADE');
    
    // =========================================
    // Connection Settings
    // =========================================
    
    // QloApps instance base URL (e.g., https://hotel.qloapps.com)
    table
      .string('base_url', 500)
      .notNullable()
      .comment('QloApps instance base URL (e.g., https://hotel.qloapps.com)');
    
    // API key encrypted at application level using utils/encryption.ts
    table
      .text('api_key_encrypted')
      .notNullable()
      .comment('QloApps WebService API key, encrypted at application level');
    
    // QloApps hotel ID (id_hotel in QloApps database)
    table
      .integer('qloapps_hotel_id')
      .notNullable()
      .comment('Hotel ID in QloApps system (from HotelBranchInformation)');
    
    // =========================================
    // Sync Configuration
    // =========================================
    
    // Sync interval in minutes (how often to poll QloApps)
    table
      .integer('sync_interval_minutes')
      .notNullable()
      .defaultTo(5)
      .comment('Interval for scheduled sync operations (5-60 minutes)');
    
    // Master sync switch
    table
      .boolean('sync_enabled')
      .notNullable()
      .defaultTo(true)
      .comment('Master switch to enable/disable all sync operations');
    
    // Granular sync controls
    table
      .boolean('sync_reservations_inbound')
      .notNullable()
      .defaultTo(true)
      .comment('Sync reservations from QloApps to PMS');
    
    table
      .boolean('sync_reservations_outbound')
      .notNullable()
      .defaultTo(true)
      .comment('Sync reservations from PMS to QloApps');
    
    table
      .boolean('sync_availability')
      .notNullable()
      .defaultTo(true)
      .comment('Push availability updates to QloApps');
    
    table
      .boolean('sync_rates')
      .notNullable()
      .defaultTo(true)
      .comment('Push rate updates to QloApps');
    
    // =========================================
    // Status Tracking
    // =========================================
    
    // Last successful sync timestamp (for incremental syncs)
    table
      .timestamp('last_successful_sync', { useTz: true })
      .comment('Timestamp of last successful sync operation');
    
    // Last sync error message (for diagnostics)
    table
      .text('last_sync_error')
      .comment('Error message from last failed sync attempt');
    
    // =========================================
    // Timestamps
    // =========================================
    
    table
      .timestamp('created_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
    
    table
      .timestamp('updated_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
  });

  // =========================================
  // Indexes
  // =========================================
  
  // Ensure only one config per property
  await knex.schema.raw(`
    CREATE UNIQUE INDEX idx_qloapps_config_property_id 
    ON qloapps_config(property_id);
  `);

  // Index for finding enabled configs (for sync scheduler)
  await knex.schema.raw(`
    CREATE INDEX idx_qloapps_config_sync_enabled 
    ON qloapps_config(sync_enabled) 
    WHERE sync_enabled = true;
  `);

  // =========================================
  // Check Constraints
  // =========================================
  
  // Validate sync interval is within acceptable range
  await knex.schema.raw(`
    ALTER TABLE qloapps_config 
    ADD CONSTRAINT check_qloapps_config_sync_interval 
    CHECK (sync_interval_minutes >= 5 AND sync_interval_minutes <= 60);
  `);

  // Note: base_url validation is handled at application level for better error messages
  // PostgreSQL regex constraints are too strict and reject valid URLs
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('qloapps_config');
}
