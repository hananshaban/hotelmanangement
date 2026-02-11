import type { Knex } from 'knex';

/**
 * Migration 1: Rename hotel_settings to hotels (multi-row)
 * 
 * Purpose: Transform single-hotel system to multi-hotel system
 * 
 * Changes:
 * - Rename hotel_settings table to hotels
 * - Remove single-row constraint (idx_hotel_settings_single)
 * - Add deleted_at column for soft delete
 * - Keep existing row as the first hotel (backward-compatible)
 */
export async function up(knex: Knex): Promise<void> {
  // Drop the single-row constraint first
  await knex.schema.raw(`
    DROP INDEX IF EXISTS idx_hotel_settings_single;
  `);

  // Rename the table
  await knex.schema.renameTable('hotel_settings', 'hotels');

  // Add deleted_at column if it doesn't exist
  const hasDeletedAt = await knex.schema.hasColumn('hotels', 'deleted_at');
  if (!hasDeletedAt) {
    await knex.schema.alterTable('hotels', (table) => {
      table.timestamp('deleted_at', { useTz: true }).nullable();
    });

    // Add index for soft delete queries
    await knex.schema.raw(`
      CREATE INDEX idx_hotels_deleted_at ON hotels(deleted_at) WHERE deleted_at IS NULL;
    `);
  }

  // Update foreign key references from hotel_settings to hotels
  // This handles qloapps_config and any other tables that reference hotel_settings
  
  // First, find all foreign key constraints that reference hotel_settings
  const foreignKeys = await knex.raw(`
    SELECT
      tc.constraint_name,
      tc.table_name,
      kcu.column_name
    FROM information_schema.table_constraints AS tc
    JOIN information_schema.key_column_usage AS kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage AS ccu
      ON ccu.constraint_name = tc.constraint_name
      AND ccu.table_schema = tc.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND ccu.table_name = 'hotel_settings'
      AND tc.table_schema = 'public';
  `);

  // Drop and recreate foreign key constraints
  for (const fk of foreignKeys.rows) {
    await knex.schema.raw(`
      ALTER TABLE ${fk.table_name}
      DROP CONSTRAINT IF EXISTS ${fk.constraint_name};
    `);

    await knex.schema.raw(`
      ALTER TABLE ${fk.table_name}
      ADD CONSTRAINT ${fk.constraint_name.replace('hotel_settings', 'hotels')}
      FOREIGN KEY (${fk.column_name})
      REFERENCES hotels(id)
      ON DELETE CASCADE;
    `);
  }

  // Rename property_id to hotel_id in tables that reference it (for consistency)
  // This is optional but improves clarity
  const tablesWithPropertyId = await knex.raw(`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND column_name = 'property_id';
  `);

  for (const row of tablesWithPropertyId.rows) {
    await knex.schema.alterTable(row.table_name, (table) => {
      table.renameColumn('property_id', 'hotel_id');
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  // Reverse the property_id rename
  const tablesWithHotelId = await knex.raw(`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND column_name = 'hotel_id'
      AND table_name IN (SELECT DISTINCT table_name FROM information_schema.columns WHERE column_name = 'hotel_id');
  `);

  for (const row of tablesWithHotelId.rows) {
    // Only rename if the table originally had property_id
    const originalTableNames = ['qloapps_config', 'beds24_config']; // Add other tables as needed
    if (originalTableNames.includes(row.table_name)) {
      await knex.schema.alterTable(row.table_name, (table) => {
        table.renameColumn('hotel_id', 'property_id');
      });
    }
  }

  // Drop soft delete index
  await knex.schema.raw(`
    DROP INDEX IF EXISTS idx_hotels_deleted_at;
  `);

  // Remove deleted_at column
  const hasDeletedAt = await knex.schema.hasColumn('hotels', 'deleted_at');
  if (hasDeletedAt) {
    await knex.schema.alterTable('hotels', (table) => {
      table.dropColumn('deleted_at');
    });
  }

  // Rename back to hotel_settings
  await knex.schema.renameTable('hotels', 'hotel_settings');

  // Recreate single-row constraint
  await knex.schema.raw(`
    CREATE UNIQUE INDEX idx_hotel_settings_single ON hotel_settings((1));
  `);

  // Update foreign key references back to hotel_settings
  const foreignKeys = await knex.raw(`
    SELECT
      tc.constraint_name,
      tc.table_name,
      kcu.column_name
    FROM information_schema.table_constraints AS tc
    JOIN information_schema.key_column_usage AS kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage AS ccu
      ON ccu.constraint_name = tc.constraint_name
      AND ccu.table_schema = tc.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND ccu.table_name = 'hotels'
      AND tc.table_schema = 'public';
  `);

  for (const fk of foreignKeys.rows) {
    await knex.schema.raw(`
      ALTER TABLE ${fk.table_name}
      DROP CONSTRAINT IF EXISTS ${fk.constraint_name};
    `);

    await knex.schema.raw(`
      ALTER TABLE ${fk.table_name}
      ADD CONSTRAINT ${fk.constraint_name.replace('hotels', 'hotel_settings')}
      FOREIGN KEY (${fk.column_name})
      REFERENCES hotel_settings(id)
      ON DELETE CASCADE;
    `);
  }
}

