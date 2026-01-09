import type { Knex } from 'knex';

/**
 * Migration to add beds24_property_id to hotel_settings table
 * This stores the Beds24 property ID for the entire PMS (single property system)
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('hotel_settings', (table) => {
    table.integer('beds24_property_id').nullable().comment('Beds24 property ID for this hotel');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('hotel_settings', (table) => {
    table.dropColumn('beds24_property_id');
  });
}



