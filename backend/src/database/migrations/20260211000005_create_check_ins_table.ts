import type { Knex } from 'knex';

/**
 * Migration: Create check_ins table
 * 
 * Purpose: Separate check-in entity from reservation to track actual room assignments
 * 
 * Key Features:
 * - Links reservation to actual room assignment
 * - Tracks check-in and checkout times
 * - Supports multi-hotel via hotel_id
 * - Audit trail with who checked in the guest
 */

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('check_ins', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    
    // Foreign keys
    table
      .uuid('hotel_id')
      .notNullable()
      .references('id')
      .inTable('hotels')
      .onDelete('CASCADE')
      .onUpdate('CASCADE');
    
    table
      .uuid('reservation_id')
      .notNullable()
      .references('id')
      .inTable('reservations')
      .onDelete('RESTRICT');
    
    table
      .uuid('actual_room_id')
      .notNullable()
      .references('id')
      .inTable('rooms')
      .onDelete('RESTRICT');
    
    table
      .uuid('checked_in_by')
      .nullable()
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');
    
    // Timestamps
    table.timestamp('check_in_time', { useTz: true }).notNullable();
    table.timestamp('expected_checkout_time', { useTz: true }).nullable();
    table.timestamp('actual_checkout_time', { useTz: true }).nullable();
    
    // Status and notes
    table
      .string('status', 50)
      .notNullable()
      .defaultTo('checked_in');
    table.text('notes').nullable();
    
    // Audit timestamps
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());
  });

  // Check constraint for status
  await knex.schema.raw(`
    ALTER TABLE check_ins 
    ADD CONSTRAINT check_check_ins_status 
    CHECK (status IN ('checked_in', 'checked_out'));
  `);

  // Check constraint: actual_checkout_time must be after check_in_time
  await knex.schema.raw(`
    ALTER TABLE check_ins 
    ADD CONSTRAINT check_check_ins_checkout_after_checkin 
    CHECK (actual_checkout_time IS NULL OR actual_checkout_time > check_in_time);
  `);

  // Ensure one active check-in per reservation (can't check in same reservation twice)
  await knex.schema.raw(`
    CREATE UNIQUE INDEX idx_check_ins_unique_active_reservation 
    ON check_ins(reservation_id) 
    WHERE status = 'checked_in';
  `);

  // Indexes for common queries
  await knex.schema.raw(`
    CREATE INDEX idx_check_ins_hotel_id ON check_ins(hotel_id);
    CREATE INDEX idx_check_ins_reservation_id ON check_ins(reservation_id);
    CREATE INDEX idx_check_ins_actual_room_id ON check_ins(actual_room_id);
    CREATE INDEX idx_check_ins_status ON check_ins(status);
    CREATE INDEX idx_check_ins_check_in_time ON check_ins(check_in_time);
    CREATE INDEX idx_check_ins_checked_in_by ON check_ins(checked_in_by);
  `);

  // Composite index for finding active check-ins by hotel and room
  await knex.schema.raw(`
    CREATE INDEX idx_check_ins_hotel_room_status 
    ON check_ins(hotel_id, actual_room_id, status);
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('check_ins');
}


