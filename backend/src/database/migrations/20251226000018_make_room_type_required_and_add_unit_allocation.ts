import type { Knex } from 'knex';

/**
 * Migration to make room_type required and add unit_allocation field
 * Phase 1: Critical fields for Beds24 sync
 */
export async function up(knex: Knex): Promise<void> {
  // First, ensure all rooms have a room_type set (should already be done by previous migration)
  await knex.schema.raw(`
    UPDATE rooms 
    SET room_type = CASE 
      WHEN type = 'Single' THEN 'single'
      WHEN type = 'Double' THEN 'double'
      WHEN type = 'Suite' THEN 'suite'
      ELSE 'double'
    END
    WHERE room_type IS NULL;
  `);

  // Add unit_allocation field
  await knex.schema.alterTable('rooms', (table) => {
    table.string('unit_allocation', 20).defaultTo('perBooking').comment('How units are allocated: perBooking or perGuest');
  });

  // Make room_type NOT NULL
  await knex.schema.raw(`
    ALTER TABLE rooms 
    ALTER COLUMN room_type SET NOT NULL;
  `);

  // Add check constraint for unit_allocation enum
  await knex.schema.raw(`
    ALTER TABLE rooms 
    ADD CONSTRAINT check_rooms_unit_allocation 
    CHECK (unit_allocation IN ('perBooking', 'perGuest'));
  `);
}

export async function down(knex: Knex): Promise<void> {
  // Remove check constraint
  await knex.schema.raw(`
    ALTER TABLE rooms 
    DROP CONSTRAINT IF EXISTS check_rooms_unit_allocation;
  `);

  // Make room_type nullable again
  await knex.schema.raw(`
    ALTER TABLE rooms 
    ALTER COLUMN room_type DROP NOT NULL;
  `);

  // Remove unit_allocation column
  await knex.schema.alterTable('rooms', (table) => {
    table.dropColumn('unit_allocation');
  });
}



