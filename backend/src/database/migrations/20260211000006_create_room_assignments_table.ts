import type { Knex } from 'knex';

/**
 * Migration: Create room_assignments table
 * 
 * Purpose: Audit trail for all room assignments and changes during a stay
 * 
 * Key Features:
 * - Tracks initial room assignment and all subsequent changes
 * - Records reason for room changes (upgrade, downgrade, maintenance, etc.)
 * - Links to check-in record for complete history
 * - Supports analysis and reporting on room operations
 */

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('room_assignments', (table) => {
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
      .uuid('checkin_id')
      .notNullable()
      .references('id')
      .inTable('check_ins')
      .onDelete('CASCADE');
    
    // Room references - from_room_id is NULL for initial assignment
    table
      .uuid('from_room_id')
      .nullable()
      .references('id')
      .inTable('rooms')
      .onDelete('SET NULL');
    
    table
      .uuid('to_room_id')
      .notNullable()
      .references('id')
      .inTable('rooms')
      .onDelete('RESTRICT');
    
    // Assignment metadata
    table
      .string('assignment_type', 50)
      .notNullable()
      .defaultTo('initial');
    
    table.string('change_reason', 100).nullable();
    table.text('notes').nullable();
    
    // Who made the assignment
    table
      .uuid('assigned_by')
      .nullable()
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');
    
    // When was the assignment made
    table.timestamp('assigned_at', { useTz: true }).defaultTo(knex.fn.now());
  });

  // Check constraint for assignment_type
  await knex.schema.raw(`
    ALTER TABLE room_assignments 
    ADD CONSTRAINT check_room_assignments_type 
    CHECK (assignment_type IN ('initial', 'change', 'upgrade', 'downgrade'));
  `);

  // Check constraint: from_room_id must be NULL for initial assignments
  await knex.schema.raw(`
    ALTER TABLE room_assignments 
    ADD CONSTRAINT check_room_assignments_initial_from_null 
    CHECK (
      (assignment_type = 'initial' AND from_room_id IS NULL) OR
      (assignment_type != 'initial' AND from_room_id IS NOT NULL)
    );
  `);

  // Check constraint: from_room_id and to_room_id must be different for changes
  await knex.schema.raw(`
    ALTER TABLE room_assignments 
    ADD CONSTRAINT check_room_assignments_different_rooms 
    CHECK (
      assignment_type = 'initial' OR
      from_room_id != to_room_id
    );
  `);

  // Indexes for common queries
  await knex.schema.raw(`
    CREATE INDEX idx_room_assignments_hotel_id ON room_assignments(hotel_id);
    CREATE INDEX idx_room_assignments_checkin_id ON room_assignments(checkin_id);
    CREATE INDEX idx_room_assignments_from_room_id ON room_assignments(from_room_id);
    CREATE INDEX idx_room_assignments_to_room_id ON room_assignments(to_room_id);
    CREATE INDEX idx_room_assignments_assignment_type ON room_assignments(assignment_type);
    CREATE INDEX idx_room_assignments_assigned_by ON room_assignments(assigned_by);
    CREATE INDEX idx_room_assignments_assigned_at ON room_assignments(assigned_at);
  `);

  // Composite index for finding assignment history by check-in
  await knex.schema.raw(`
    CREATE INDEX idx_room_assignments_checkin_history 
    ON room_assignments(checkin_id, assigned_at);
  `);

  // Composite index for tracking room usage patterns
  await knex.schema.raw(`
    CREATE INDEX idx_room_assignments_hotel_room_date 
    ON room_assignments(hotel_id, to_room_id, assigned_at);
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('room_assignments');
}




