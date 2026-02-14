import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('hotel_settings', (table) => {
    table
      .uuid('id')
      .primary()
      .defaultTo(knex.raw("'00000000-0000-0000-0000-000000000000'::uuid"));
    table.string('hotel_name', 255).notNullable();
    table.text('address');
    table.string('city', 100);
    table.string('country', 100);
    table.string('phone', 50);
    table.string('email', 255);
    table.decimal('tax_rate', 5, 2).defaultTo(0.0);
    table.string('currency', 10).defaultTo('USD');
    table.string('timezone', 50).defaultTo('UTC');
    table.time('check_in_time').defaultTo('15:00:00');
    table.time('check_out_time').defaultTo('11:00:00');
    table.jsonb('settings').defaultTo('{}');
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());
  });

  // Ensure only one record exists
  await knex.raw(`
    CREATE UNIQUE INDEX idx_hotel_settings_single ON hotel_settings((1));
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('hotel_settings');
}

