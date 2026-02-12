import type { Knex } from 'knex';

/**
 * Migration to create room_types table
 * This replaces the individual rooms model with CM-style room types with quantity
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('room_types', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    
    // Basic information
    table.string('name', 255).notNullable().comment('Room type name (e.g., "Double Room", "Suite")');
    table.string('room_type', 50).notNullable().comment('Channel Manager room type enum');
    table.integer('qty').notNullable().defaultTo(1).comment('Number of units of this room type (1-99)');
    
    // Pricing
    table.decimal('price_per_night', 10, 2).notNullable();
    table.decimal('min_price', 10, 2).nullable();
    table.decimal('max_price', 10, 2).nullable();
    table.decimal('rack_rate', 10, 2).nullable();
    table.decimal('cleaning_fee', 10, 2).defaultTo(0);
    table.decimal('security_deposit', 10, 2).defaultTo(0);
    
    // Capacity
    table.integer('max_people').nullable();
    table.integer('max_adult').nullable();
    table.integer('max_children').nullable();
    
    // Stay restrictions
    table.integer('min_stay').nullable();
    table.integer('max_stay').nullable();
    
    // Tax
    table.decimal('tax_percentage', 5, 2).nullable();
    table.decimal('tax_per_person', 10, 2).nullable();
    
    // Additional fields
    table.integer('room_size').nullable().comment('Square meters');
    table.integer('floor').nullable();
    table.string('highlight_color', 20).nullable();
    table.integer('sell_priority').nullable();
    table.boolean('include_reports').defaultTo(true);
    table.string('restriction_strategy', 50).nullable();
    table.string('overbooking_protection', 50).nullable();
    table.integer('block_after_checkout_days').defaultTo(0);
    table.integer('control_priority').nullable();
    table.string('unit_allocation', 20).notNullable().defaultTo('perBooking').comment('How units are allocated: perBooking or perGuest');
    
    // Features and description
    table.jsonb('features').defaultTo('[]');
    table.text('description').nullable();
    table.jsonb('units').defaultTo('[]').comment('Array of unit objects for multi-unit rooms');
    
    // Channel Manager integration
    table.string('beds24_room_id', 255).nullable().comment('Channel Manager room ID (legacy: beds24_room_id)');
    
    // Metadata
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('deleted_at', { useTz: true }).nullable();
  });

  // Check constraints
  await knex.schema.raw(`
    ALTER TABLE room_types 
    ADD CONSTRAINT check_room_types_qty 
    CHECK (qty >= 1 AND qty <= 99);
  `);

  await knex.schema.raw(`
    ALTER TABLE room_types 
    ADD CONSTRAINT check_room_types_min_stay 
    CHECK (min_stay IS NULL OR (min_stay >= 1 AND min_stay <= 365));
  `);

  await knex.schema.raw(`
    ALTER TABLE room_types 
    ADD CONSTRAINT check_room_types_max_stay 
    CHECK (max_stay IS NULL OR (max_stay >= 1 AND max_stay <= 365));
  `);

  await knex.schema.raw(`
    ALTER TABLE room_types 
    ADD CONSTRAINT check_room_types_sell_priority 
    CHECK (sell_priority IS NULL OR (sell_priority >= 1 AND sell_priority <= 100));
  `);

  await knex.schema.raw(`
    ALTER TABLE room_types 
    ADD CONSTRAINT check_room_types_unit_allocation 
    CHECK (unit_allocation IN ('perBooking', 'perGuest'));
  `);

  // Indexes
  await knex.schema.raw(`
    CREATE INDEX idx_room_types_beds24_room_id ON room_types(beds24_room_id);
    CREATE INDEX idx_room_types_deleted_at ON room_types(deleted_at) WHERE deleted_at IS NULL;
    CREATE INDEX idx_room_types_room_type ON room_types(room_type);
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('room_types');
}



