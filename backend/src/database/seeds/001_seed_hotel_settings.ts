import type { Knex } from 'knex';

export async function seed(knex: Knex): Promise<void> {
  // Check if default hotel already exists
  const existing = await knex('hotels')
    .where({ id: '00000000-0000-0000-0000-000000000001' })
    .first();

  if (existing) {
    console.log('✅ Default hotel already exists, skipping seed');
    return;
  }

  // Create default hotel
  await knex('hotels').insert({
    id: '00000000-0000-0000-0000-000000000001',
    hotel_name: 'Default Hotel',
    address: '123 Main Street',
    city: 'New York',
    country: 'USA',
    phone: '+1 (555) 123-4567',
    email: 'info@defaulthotel.com',
    tax_rate: 10.0,
    currency: 'USD',
    timezone: 'UTC',
    check_in_time: '15:00:00',
    check_out_time: '11:00:00',
    active_channel_manager: 'qloapps',
    settings: JSON.stringify({
      booking_policy: 'Free cancellation up to 24 hours before check-in',
      amenities: ['WiFi', 'Parking', 'Breakfast'],
    }),
    created_at: knex.fn.now(),
    updated_at: knex.fn.now(),
  });

  console.log('✅ Default hotel seeded successfully');
}

