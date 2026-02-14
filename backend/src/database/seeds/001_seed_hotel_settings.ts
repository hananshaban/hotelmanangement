import type { Knex } from 'knex';

const DEFAULT_HOTEL_ID = '00000000-0000-0000-0000-000000000000';

export async function seed(knex: Knex): Promise<void> {
  // Check if default hotel already exists
  const existing = await knex('hotels')
    .where({ id: DEFAULT_HOTEL_ID })
    .first();

  if (existing) {
    console.log('✅ Default hotel already exists, skipping seed');
    return;
  }

  // Create default hotel with updated schema
  await knex('hotels').insert({
    id: DEFAULT_HOTEL_ID,
    hotel_name: 'Default Hotel',
    hotel_address: '123 Main Street',
    hotel_city: 'New York',
    hotel_state: 'NY',
    hotel_country: 'USA',
    hotel_postal_code: '10001',
    hotel_phone: '+1 (555) 123-4567',
    hotel_email: 'info@defaulthotel.com',
    hotel_website: 'https://www.defaulthotel.com',
    hotel_logo_url: null,
    currency: 'USD',
    timezone: 'UTC',
    date_format: 'YYYY-MM-DD',
    time_format: 'HH:mm',
    check_in_time: '15:00:00',
    check_out_time: '11:00:00',
    tax_percentage: 10.0,
    active_channel_manager: 'qloapps',
    beds24_property_id: null,
    created_at: knex.fn.now(),
    updated_at: knex.fn.now(),
  });

  console.log('✅ Default hotel seeded successfully');
}

