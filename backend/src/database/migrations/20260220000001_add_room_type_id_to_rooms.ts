import type { Knex } from 'knex';

/**
 * Migration: Add room_type_id to rooms table
 *
 * Purpose:
 * - Link physical rooms back to their parent room_types record
 * - Enable syncing of generated rooms when room type qty/name changes
 * - Allow type-matching between reservations.room_type_id and rooms.room_type_id
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('rooms', (table) => {
    table
      .uuid('room_type_id')
      .nullable()
      .references('id')
      .inTable('room_types')
      .onDelete('SET NULL');
  });

  await knex.schema.raw(`
    CREATE INDEX IF NOT EXISTS idx_rooms_room_type_id ON rooms(room_type_id);
  `);
}

export async function down(knex: Knex): Promise<void> {
  // Drop index first (if it exists), then column
  await knex.schema.raw(`
    DROP INDEX IF EXISTS idx_rooms_room_type_id;
  `);

  await knex.schema.alterTable('rooms', (table) => {
    table.dropColumn('room_type_id');
  });
}


