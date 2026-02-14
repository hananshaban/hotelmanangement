import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('beds24_config', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    // Reference to hotel_settings (single property system)
    // If multi-property is needed later, this can reference a properties table
    table
      .uuid('property_id')
      .notNullable()
      .defaultTo(knex.raw("'00000000-0000-0000-0000-000000000000'::uuid"))
      .references('id')
      .inTable('hotel_settings')
      .onDelete('CASCADE');
    
    // OAuth tokens (encrypted at application level)
    table.text('refresh_token').notNullable(); // Encrypted
    table.text('access_token'); // Encrypted, cached
    table.timestamp('token_expires_at', { useTz: true });
    
    // Beds24 property mapping
    table.string('beds24_property_id', 255).notNullable();
    
    // Webhook configuration
    table.text('webhook_secret'); // For HMAC verification
    
    // Sync configuration flags
    table.boolean('sync_enabled').defaultTo(true);
    table.boolean('push_sync_enabled').defaultTo(true);
    table.boolean('pull_sync_enabled').defaultTo(true);
    table.boolean('webhook_enabled').defaultTo(true);
    
    // Sync status tracking
    table.timestamp('last_successful_sync', { useTz: true });
    
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());
  });

  // Ensure only one config per property
  await knex.schema.raw(`
    CREATE UNIQUE INDEX idx_beds24_config_property_id ON beds24_config(property_id);
  `);

  // Index for sync status queries
  await knex.schema.raw(`
    CREATE INDEX idx_beds24_config_sync_enabled ON beds24_config(sync_enabled);
    CREATE INDEX idx_beds24_config_last_sync ON beds24_config(last_successful_sync);
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('beds24_config');
}

