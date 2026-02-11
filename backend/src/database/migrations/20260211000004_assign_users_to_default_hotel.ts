import type { Knex } from 'knex';

/**
 * Migration 4: Assign all existing users to default hotel
 * 
 * Purpose: Ensure all existing users have access to the default hotel
 * 
 * Process:
 * 1. Find all existing users
 * 2. Create user_hotels entries linking them to the default hotel
 * 3. Skip users who already have an assignment (idempotent)
 * 
 * Note: SUPER_ADMIN users technically don't need this (they have implicit access),
 * but we assign them anyway for consistency and explicit tracking.
 */

const DEFAULT_HOTEL_ID = '00000000-0000-0000-0000-000000000001';

export async function up(knex: Knex): Promise<void> {
  console.log('Assigning all existing users to default hotel...');

  // Resolve which hotel will be treated as the \"default\" for existing users.
  // Priority:
  // 1) Hotel with the well-known DEFAULT_HOTEL_ID
  // 2) First existing hotel row
  // 3) If none exist, create a new default hotel row
  let defaultHotel = await knex('hotels')
    .where('id', DEFAULT_HOTEL_ID)
    .first();

  if (!defaultHotel) {
    console.warn(
      `Hotel with id ${DEFAULT_HOTEL_ID} not found. Falling back to first existing hotel row if available.`,
    );

    defaultHotel = await knex('hotels').first();

    if (!defaultHotel) {
      console.warn(
        'No hotels found in database. Creating a new default hotel record.',
      );

      const inserted = await knex('hotels')
        .insert(
          {
            id: DEFAULT_HOTEL_ID,
            hotel_name: 'Default Hotel',
            created_at: knex.fn.now(),
            updated_at: knex.fn.now(),
          },
          ['id', 'hotel_name'],
        )
        .then((rows) => rows[0]);

      defaultHotel = inserted;
    }
  }

  const defaultHotelId = defaultHotel.id as string;

  console.log(`✓ Using default hotel: ${defaultHotel.hotel_name} (${defaultHotelId})`);

  // Get all users
  const users = await knex('users')
    .select('id', 'email', 'role')
    .whereNull('deleted_at'); // Only active users

  console.log(`Found ${users.length} users to assign`);

  if (users.length === 0) {
    console.log('No users to assign. Skipping...');
    return;
  }

  // Create user_hotels entries for all users
  // Use INSERT ... ON CONFLICT DO NOTHING for idempotency
  const userHotelEntries = users.map((user) => ({
    id: knex.raw('gen_random_uuid()'),
    user_id: user.id,
    hotel_id: defaultHotelId,
    created_at: knex.fn.now(),
    updated_at: knex.fn.now(),
  }));

  // Insert in batches to avoid memory issues with large datasets
  const batchSize = 100;
  let insertedCount = 0;
  
  for (let i = 0; i < userHotelEntries.length; i += batchSize) {
    const batch = userHotelEntries.slice(i, i + batchSize);
    
    // PostgreSQL-specific upsert syntax
    await knex.raw(`
      INSERT INTO user_hotels (id, user_id, hotel_id, created_at, updated_at)
      VALUES ${batch.map(() => '(gen_random_uuid(), ?, ?::uuid, NOW(), NOW())').join(', ')}
      ON CONFLICT (user_id, hotel_id) DO NOTHING
    `, batch.flatMap(entry => [entry.user_id, defaultHotelId]));
    
    insertedCount += batch.length;
    console.log(`Processed ${Math.min(insertedCount, users.length)} / ${users.length} users`);
  }

  // Verify the assignments
  const assignedCount = await knex('user_hotels')
    .where('hotel_id', defaultHotelId)
    .count('* as count')
    .first();

  console.log(`✓ Successfully assigned ${assignedCount?.count || 0} users to default hotel`);

  // Log breakdown by role for visibility
  const roleBreakdown = await knex('user_hotels')
    .join('users', 'users.id', 'user_hotels.user_id')
    .where('user_hotels.hotel_id', defaultHotelId)
    .select('users.role')
    .count('* as count')
    .groupBy('users.role');

  console.log('Assignment breakdown by role:');
  roleBreakdown.forEach((row) => {
    console.log(`  - ${row.role}: ${row.count}`);
  });
}

export async function down(knex: Knex): Promise<void> {
  console.log('Removing user assignments from default hotel...');

  // Delete all user_hotels entries for the default hotel
  const deletedCount = await knex('user_hotels')
    .where('hotel_id', DEFAULT_HOTEL_ID)
    .delete();

  console.log(`✓ Removed ${deletedCount} user assignments from default hotel`);
}

