import type { Knex } from 'knex';

/**
 * Migration to add room_type_id to reservations table
 * This allows reservations to reference room types instead of individual rooms
 * We keep room_id nullable for backward compatibility during transition
 */
export async function up(knex: Knex): Promise<void> {
  // Add new columns
  await knex.schema.alterTable('reservations', (table) => {
    table
      .uuid('room_type_id')
      .nullable()
      .references('id')
      .inTable('room_types')
      .onDelete('RESTRICT')
      .comment('Reference to room type (replaces room_id for Beds24-style system)');
    
    table
      .string('assigned_unit_id', 255)
      .nullable()
      .comment('Optional: specific unit ID if unit-level tracking is needed');
    
    table
      .integer('units_requested')
      .defaultTo(1)
      .comment('Number of units requested for this reservation');
  });

  // Create index for room_type_id
  await knex.schema.raw(`
    CREATE INDEX idx_reservations_room_type_id ON reservations(room_type_id);
  `);

  // Create index for date range queries with room_type_id
  await knex.schema.raw(`
    CREATE INDEX idx_reservations_room_type_dates 
    ON reservations(room_type_id, check_in, check_out) 
    WHERE deleted_at IS NULL AND status != 'Cancelled';
  `);

  // Make room_id nullable (it was NOT NULL before)
  // We'll do this carefully to avoid breaking existing constraints
  await knex.schema.raw(`
    ALTER TABLE reservations 
    ALTER COLUMN room_id DROP NOT NULL;
  `);

  // Remove the old unique constraint that prevented overlapping reservations on same room
  // This is no longer needed since we'll check availability by counting units
  await knex.schema.raw(`
    DROP INDEX IF EXISTS idx_reservations_no_overlap;
  `);
}

export async function down(knex: Knex): Promise<void> {
  // Restore room_id NOT NULL constraint
  await knex.schema.raw(`
    UPDATE reservations SET room_id = (
      SELECT id FROM rooms LIMIT 1
    ) WHERE room_id IS NULL;
  `);

  await knex.schema.raw(`
    ALTER TABLE reservations 
    ALTER COLUMN room_id SET NOT NULL;
  `);

  // Drop new columns
  await knex.schema.alterTable('reservations', (table) => {
    table.dropColumn('room_type_id');
    table.dropColumn('assigned_unit_id');
    table.dropColumn('units_requested');
  });

  // Recreate old constraint
  await knex.schema.raw(`
    CREATE UNIQUE INDEX idx_reservations_no_overlap 
    ON reservations(room_id, check_in, check_out) 
    WHERE status != 'Cancelled' AND deleted_at IS NULL;
  `);
}



