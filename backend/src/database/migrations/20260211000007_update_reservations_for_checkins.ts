import type { Knex } from 'knex';

/**
 * Migration: Update reservations table for check-in separation
 * 
 * Purpose: Add fields to link reservations to check-ins and track room preferences
 * 
 * Changes:
 * 1. Add checkin_id to link reservation to actual check-in record
 * 2. Add reserved_room_id to store original room preference at booking time
 * 
 * Note: Both fields are nullable:
 * - checkin_id: NULL until guest actually checks in
 * - reserved_room_id: NULL if only room_type was specified (no specific room requested)
 */

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('reservations', (table) => {
    // Link to check-in record (NULL until guest checks in)
    table
      .uuid('checkin_id')
      .nullable()
      .references('id')
      .inTable('check_ins')
      .onDelete('SET NULL')
      .comment('Reference to check-in record when guest actually checks in');
    
    // Store original room preference at booking time
    table
      .uuid('reserved_room_id')
      .nullable()
      .references('id')
      .inTable('rooms')
      .onDelete('SET NULL')
      .comment('Original room preference at booking time (if specific room requested)');
  });

  // Create index for checkin_id lookups
  await knex.schema.raw(`
    CREATE INDEX idx_reservations_checkin_id ON reservations(checkin_id);
  `);

  // Create index for reserved_room_id lookups
  await knex.schema.raw(`
    CREATE INDEX idx_reservations_reserved_room_id ON reservations(reserved_room_id);
  `);

  // Ensure one check-in per reservation (can't have duplicate checkin_id)
  await knex.schema.raw(`
    CREATE UNIQUE INDEX idx_reservations_unique_checkin 
    ON reservations(checkin_id) 
    WHERE checkin_id IS NOT NULL AND deleted_at IS NULL;
  `);

  // Update existing data: copy room_id to reserved_room_id for existing reservations
  // This preserves the original room preference for historical data
  await knex.raw(`
    UPDATE reservations 
    SET reserved_room_id = room_id 
    WHERE room_id IS NOT NULL 
      AND reserved_room_id IS NULL 
      AND deleted_at IS NULL;
  `);
}

export async function down(knex: Knex): Promise<void> {
  // Drop indexes first
  await knex.schema.raw(`
    DROP INDEX IF EXISTS idx_reservations_checkin_id;
    DROP INDEX IF EXISTS idx_reservations_reserved_room_id;
    DROP INDEX IF EXISTS idx_reservations_unique_checkin;
  `);

  // Drop columns
  await knex.schema.alterTable('reservations', (table) => {
    table.dropColumn('checkin_id');
    table.dropColumn('reserved_room_id');
  });
}



