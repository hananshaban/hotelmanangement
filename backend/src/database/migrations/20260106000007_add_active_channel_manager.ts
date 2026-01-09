import type { Knex } from 'knex';

/**
 * Add active_channel_manager column to hotel_settings table
 * 
 * This column tracks which channel manager is currently active:
 * - 'beds24' (default): Beds24 channel manager
 * - 'qloapps': QloApps channel manager
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('hotel_settings', (table) => {
    table
      .string('active_channel_manager', 50)
      .defaultTo('beds24')
      .comment('Currently active channel manager: beds24 or qloapps');
  });

  // Set default value for existing rows
  await knex('hotel_settings')
    .whereNull('active_channel_manager')
    .update({ active_channel_manager: 'beds24' });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('hotel_settings', (table) => {
    table.dropColumn('active_channel_manager');
  });
}
