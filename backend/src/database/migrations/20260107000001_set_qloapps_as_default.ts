import type { Knex } from 'knex';

/**
 * Update active_channel_manager default to 'qloapps'
 * 
 * This migration switches the default channel manager from Beds24 to QloApps.
 */
export async function up(knex: Knex): Promise<void> {
  // Update existing rows to use qloapps
  await knex('hotel_settings')
    .update({ active_channel_manager: 'qloapps' });

  // Note: SQLite doesn't support altering column defaults easily,
  // so we just update the existing data. New rows will get the default
  // from the application code.
}

export async function down(knex: Knex): Promise<void> {
  // Revert to beds24
  await knex('hotel_settings')
    .update({ active_channel_manager: 'beds24' });
}
