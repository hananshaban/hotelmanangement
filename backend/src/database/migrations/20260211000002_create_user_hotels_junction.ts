import type { Knex } from 'knex';

/**
 * Migration 2: Create user_hotels junction table
 * 
 * Purpose: Enable many-to-many relationship between users and hotels
 * 
 * Design:
 * - Links users to hotels they have access to
 * - SUPER_ADMIN can bypass this (implicit access to all hotels)
 * - UNIQUE constraint prevents duplicate assignments
 * - CASCADE delete removes access when user/hotel is deleted
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('user_hotels', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    
    // Foreign keys
    table
      .uuid('user_id')
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE')
      .comment('Reference to the user');
    
    table
      .uuid('hotel_id')
      .notNullable()
      .references('id')
      .inTable('hotels')
      .onDelete('CASCADE')
      .comment('Reference to the hotel');
    
    // Timestamps
    table
      .timestamp('created_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
    
    table
      .timestamp('updated_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
  });

  // Ensure unique user-hotel pairs (no duplicate assignments)
  await knex.schema.raw(`
    CREATE UNIQUE INDEX idx_user_hotels_user_hotel 
    ON user_hotels(user_id, hotel_id);
  `);

  // Index for looking up all users for a hotel
  await knex.schema.raw(`
    CREATE INDEX idx_user_hotels_hotel_id 
    ON user_hotels(hotel_id);
  `);

  // Index for looking up all hotels for a user (most common query)
  await knex.schema.raw(`
    CREATE INDEX idx_user_hotels_user_id 
    ON user_hotels(user_id);
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('user_hotels');
}

