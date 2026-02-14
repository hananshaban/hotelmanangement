import type { Knex } from 'knex';

/**
 * Migration 3: Add hotel_id to all tenant-scoped tables
 * 
 * Purpose: Enable multi-hotel data isolation
 * 
 * Process:
 * 1. Add nullable hotel_id column
 * 2. Backfill with default hotel UUID
 * 3. Make column NOT NULL
 * 4. Add foreign key constraint
 * 5. Add index for queries
 * 
 * Note: Tables with property_id were already renamed in migration 1
 */

const DEFAULT_HOTEL_ID = '00000000-0000-0000-0000-000000000000';

// List of tables that need hotel_id added
const TABLES_TO_UPDATE = [
  'rooms',
  'room_types',
  'reservations',
  'guests',
  'invoices',
  'expenses',
  'housekeeping',
  'maintenance_requests',
  'audit_logs',
  'sync_conflicts',
  'reservation_guests',
  'webhook_events',
];

export async function up(knex: Knex): Promise<void> {
  for (const tableName of TABLES_TO_UPDATE) {
    // Check if table exists
    const tableExists = await knex.schema.hasTable(tableName);
    if (!tableExists) {
      console.log(`Skipping ${tableName} - table does not exist`);
      continue;
    }

    // Check if column already exists
    const hasHotelId = await knex.schema.hasColumn(tableName, 'hotel_id');
    if (hasHotelId) {
      console.log(`Skipping ${tableName} - hotel_id column already exists`);
      continue;
    }

    console.log(`Adding hotel_id to ${tableName}...`);

    // Step 1: Add nullable hotel_id column
    await knex.schema.alterTable(tableName, (table) => {
      table.uuid('hotel_id').nullable();
    });

    // Step 2: Backfill existing rows with default hotel ID
    await knex.raw(`
      UPDATE ${tableName}
      SET hotel_id = ?::uuid
      WHERE hotel_id IS NULL;
    `, [DEFAULT_HOTEL_ID]);

    // Step 3: Make column NOT NULL
    await knex.schema.alterTable(tableName, (table) => {
      table.uuid('hotel_id').notNullable().alter();
    });

    // Step 4: Add foreign key constraint
    await knex.schema.alterTable(tableName, (table) => {
      table
        .foreign('hotel_id')
        .references('id')
        .inTable('hotels')
        .onDelete('CASCADE')
        .onUpdate('CASCADE');
    });

    // Step 5: Add index for queries
    await knex.schema.raw(`
      CREATE INDEX idx_${tableName}_hotel_id 
      ON ${tableName}(hotel_id);
    `);

    // Step 6: For tables with unique constraints on business keys, 
    // we need to make them hotel-scoped
    await updateUniqueConstraints(knex, tableName);

    console.log(`✓ Added hotel_id to ${tableName}`);
  }

  // Special handling for beds24_config and qloapps_config 
  // (already have hotel_id from property_id rename, but need to update constraints)
  await updateConfigTableConstraints(knex);
}

export async function down(knex: Knex): Promise<void> {
  // Reverse the migration by removing hotel_id from all tables
  for (const tableName of TABLES_TO_UPDATE) {
    const tableExists = await knex.schema.hasTable(tableName);
    if (!tableExists) {
      continue;
    }

    const hasHotelId = await knex.schema.hasColumn(tableName, 'hotel_id');
    if (!hasHotelId) {
      continue;
    }

    console.log(`Removing hotel_id from ${tableName}...`);

    // Drop index
    await knex.schema.raw(`
      DROP INDEX IF EXISTS idx_${tableName}_hotel_id;
    `);

    // Drop foreign key constraint
    await knex.schema.alterTable(tableName, (table) => {
      table.dropForeign(['hotel_id']);
    });

    // Restore original unique constraints before dropping hotel_id
    await restoreUniqueConstraints(knex, tableName);

    // Drop column
    await knex.schema.alterTable(tableName, (table) => {
      table.dropColumn('hotel_id');
    });

    console.log(`✓ Removed hotel_id from ${tableName}`);
  }

  // Restore config table constraints
  await restoreConfigTableConstraints(knex);
}

/**
 * Update unique constraints to be hotel-scoped
 */
async function updateUniqueConstraints(knex: Knex, tableName: string): Promise<void> {
  switch (tableName) {
    case 'rooms':
      // room_number should be unique per hotel (not globally)
      await knex.schema.raw(`
        ALTER TABLE rooms
        DROP CONSTRAINT IF EXISTS rooms_room_number_unique;

        CREATE UNIQUE INDEX idx_rooms_hotel_room_number 
        ON rooms(hotel_id, room_number);
      `);
      break;

    case 'housekeeping':
      // room_id should be unique per hotel
      await knex.schema.raw(`
        ALTER TABLE housekeeping
        DROP CONSTRAINT IF EXISTS housekeeping_room_id_unique;

        CREATE UNIQUE INDEX idx_housekeeping_hotel_room 
        ON housekeeping(hotel_id, room_id);
      `);
      break;

    // Add other tables with unique constraints as needed
  }
}

/**
 * Restore original unique constraints (for rollback)
 */
async function restoreUniqueConstraints(knex: Knex, tableName: string): Promise<void> {
  switch (tableName) {
    case 'rooms':
      await knex.schema.raw(`
        DROP INDEX IF EXISTS idx_rooms_hotel_room_number;

        ALTER TABLE rooms
        ADD CONSTRAINT rooms_room_number_unique 
        UNIQUE (room_number);
      `);
      break;

    case 'housekeeping':
      await knex.schema.raw(`
        DROP INDEX IF EXISTS idx_housekeeping_hotel_room;

        ALTER TABLE housekeeping
        ADD CONSTRAINT housekeeping_room_id_unique 
        UNIQUE (room_id);
      `);
      break;
  }
}

/**
 * Update config table constraints to use hotel_id
 */
async function updateConfigTableConstraints(knex: Knex): Promise<void> {
  // beds24_config - ensure one config per hotel
  const hasBeds24Config = await knex.schema.hasTable('beds24_config');
  if (hasBeds24Config) {
    await knex.schema.raw(`
      DROP INDEX IF EXISTS idx_beds24_config_property_id;
      CREATE UNIQUE INDEX idx_beds24_config_hotel_id 
      ON beds24_config(hotel_id);
    `);
  }

  // qloapps_config - ensure one config per hotel
  const hasQloAppsConfig = await knex.schema.hasTable('qloapps_config');
  if (hasQloAppsConfig) {
    await knex.schema.raw(`
      DROP INDEX IF EXISTS idx_qloapps_config_property_id;
      CREATE UNIQUE INDEX idx_qloapps_config_hotel_id 
      ON qloapps_config(hotel_id);
    `);
  }

  // Update mapping table unique constraints to use hotel_id
  const hasRoomTypeMappings = await knex.schema.hasTable('qloapps_room_type_mappings');
  if (hasRoomTypeMappings) {
    await knex.schema.raw(`
      DROP INDEX IF EXISTS idx_qloapps_room_type_mappings_local_unique;
      DROP INDEX IF EXISTS idx_qloapps_room_type_mappings_qloapps_unique;
      
      CREATE UNIQUE INDEX idx_qloapps_room_type_mappings_local_unique 
      ON qloapps_room_type_mappings (hotel_id, local_room_type_id);
      
      CREATE UNIQUE INDEX idx_qloapps_room_type_mappings_qloapps_unique 
      ON qloapps_room_type_mappings (hotel_id, qloapps_product_id, qloapps_hotel_id);
    `);
  }

  // Update sync state unique constraints
  const hasSyncState = await knex.schema.hasTable('qloapps_sync_state');
  if (hasSyncState) {
    await knex.schema.raw(`
      DROP INDEX IF EXISTS idx_qloapps_sync_state_running_lock;
      
      CREATE UNIQUE INDEX idx_qloapps_sync_state_running_lock 
      ON qloapps_sync_state (hotel_id, sync_type) 
      WHERE status = 'running';
    `);
  }
}

/**
 * Restore config table constraints (for rollback)
 */
async function restoreConfigTableConstraints(knex: Knex): Promise<void> {
  const hasBeds24Config = await knex.schema.hasTable('beds24_config');
  if (hasBeds24Config) {
    await knex.schema.raw(`
      DROP INDEX IF EXISTS idx_beds24_config_hotel_id;
      CREATE UNIQUE INDEX idx_beds24_config_property_id 
      ON beds24_config(property_id);
    `);
  }

  const hasQloAppsConfig = await knex.schema.hasTable('qloapps_config');
  if (hasQloAppsConfig) {
    await knex.schema.raw(`
      DROP INDEX IF EXISTS idx_qloapps_config_hotel_id;
      CREATE UNIQUE INDEX idx_qloapps_config_property_id 
      ON qloapps_config(property_id);
    `);
  }

  const hasRoomTypeMappings = await knex.schema.hasTable('qloapps_room_type_mappings');
  if (hasRoomTypeMappings) {
    await knex.schema.raw(`
      DROP INDEX IF EXISTS idx_qloapps_room_type_mappings_local_unique;
      DROP INDEX IF EXISTS idx_qloapps_room_type_mappings_qloapps_unique;
      
      CREATE UNIQUE INDEX idx_qloapps_room_type_mappings_local_unique 
      ON qloapps_room_type_mappings (property_id, local_room_type_id);
      
      CREATE UNIQUE INDEX idx_qloapps_room_type_mappings_qloapps_unique 
      ON qloapps_room_type_mappings (property_id, qloapps_product_id, qloapps_hotel_id);
    `);
  }

  const hasSyncState = await knex.schema.hasTable('qloapps_sync_state');
  if (hasSyncState) {
    await knex.schema.raw(`
      DROP INDEX IF EXISTS idx_qloapps_sync_state_running_lock;
      
      CREATE UNIQUE INDEX idx_qloapps_sync_state_running_lock 
      ON qloapps_sync_state (property_id, sync_type) 
      WHERE status = 'running';
    `);
  }
}

