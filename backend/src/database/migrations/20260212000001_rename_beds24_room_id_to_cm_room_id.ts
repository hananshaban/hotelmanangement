import type { Knex } from 'knex';

/**
 * Migration to rename beds24_room_id to cm_room_id for channel manager agnostic naming
 * Makes the system work with any channel manager, not just Beds24
 */
export async function up(knex: Knex): Promise<void> {
  // Rename column in room_types table
  await knex.schema.alterTable('room_types', (table) => {
    table.renameColumn('beds24_room_id', 'cm_room_id');
  });

  // Rename column in rooms table (legacy)
  await knex.schema.alterTable('rooms', (table) => {
    table.renameColumn('beds24_room_id', 'cm_room_id');
  });

  // Drop old index and create new one for room_types
  await knex.schema.raw('DROP INDEX IF EXISTS idx_room_types_beds24_room_id');
  await knex.schema.raw('CREATE INDEX idx_room_types_cm_room_id ON room_types(cm_room_id)');
}

export async function down(knex: Knex): Promise<void> {
  // Rename back to original names
  await knex.schema.alterTable('room_types', (table) => {
    table.renameColumn('cm_room_id', 'beds24_room_id');
  });

  await knex.schema.alterTable('rooms', (table) => {
    table.renameColumn('cm_room_id', 'beds24_room_id');
  });

  // Recreate original index
  await knex.schema.raw('DROP INDEX IF EXISTS idx_room_types_cm_room_id');
  await knex.schema.raw('CREATE INDEX idx_room_types_beds24_room_id ON room_types(beds24_room_id)');
}

