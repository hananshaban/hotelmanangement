import db from '../src/config/database.js';

/**
 * One-off data fix script:
 * - Finds rooms that still point at the DEFAULT hotel_id
 * - Reassigns them to a target hotel_id that you provide via env or CLI
 *
 * Usage (example):
 *   TARGET_HOTEL_ID=your-hotel-uuid npx tsx backend/scripts/fix_orphaned_rooms_hotel_id.ts
 *
 * Safety:
 * - Only updates rooms whose hotel_id is the DEFAULT_HOTEL_ID
 * - Logs counts before and after
 */

const DEFAULT_HOTEL_ID = '00000000-0000-0000-0000-000000000000';

async function main() {
  const targetHotelId = process.env.TARGET_HOTEL_ID;

  if (!targetHotelId) {
    console.error(
      '[fix_orphaned_rooms_hotel_id] TARGET_HOTEL_ID env var is required (the hotel to move rooms to).',
    );
    process.exit(1);
  }

  console.log('[fix_orphaned_rooms_hotel_id] Starting data fix...');
  console.log(`  Default hotel id: ${DEFAULT_HOTEL_ID}`);
  console.log(`  Target hotel id : ${targetHotelId}`);

  try {
    // Count rooms per hotel before
    const beforePerHotel = await db('rooms')
      .select('hotel_id')
      .count<{ count: string }>('id as count')
      .groupBy('hotel_id');

    console.log('[fix_orphaned_rooms_hotel_id] Room counts BEFORE:');
    beforePerHotel.forEach((row) => {
      console.log(`  hotel_id=${row.hotel_id}: ${row.count} rooms`);
    });

    const orphaned = await db('rooms')
      .where('hotel_id', DEFAULT_HOTEL_ID)
      .count<{ count: string }>('id as count')
      .first();

    const orphanCount = orphaned ? parseInt(orphaned.count, 10) : 0;
    console.log(
      `[fix_orphaned_rooms_hotel_id] Found ${orphanCount} rooms with hotel_id=${DEFAULT_HOTEL_ID}`,
    );

    if (orphanCount === 0) {
      console.log('[fix_orphaned_rooms_hotel_id] Nothing to do. Exiting.');
      process.exit(0);
    }

    // Reassign orphaned rooms
    const updated = await db('rooms')
      .where('hotel_id', DEFAULT_HOTEL_ID)
      .update({
        hotel_id: targetHotelId,
        updated_at: db.fn.now(),
      });

    console.log(
      `[fix_orphaned_rooms_hotel_id] Updated ${updated} rooms from ${DEFAULT_HOTEL_ID} to ${targetHotelId}`,
    );

    const afterPerHotel = await db('rooms')
      .select('hotel_id')
      .count<{ count: string }>('id as count')
      .groupBy('hotel_id');

    console.log('[fix_orphaned_rooms_hotel_id] Room counts AFTER:');
    afterPerHotel.forEach((row) => {
      console.log(`  hotel_id=${row.hotel_id}: ${row.count} rooms`);
    });

    console.log('[fix_orphaned_rooms_hotel_id] Data fix completed successfully.');
    process.exit(0);
  } catch (error) {
    console.error('[fix_orphaned_rooms_hotel_id] Error during data fix:', error);
    process.exit(1);
  }
}

main();


