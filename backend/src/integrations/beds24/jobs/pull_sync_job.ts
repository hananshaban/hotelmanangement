import { PullSyncService } from '../services/pull_sync_service.js';
import db from '../../../config/database.js';
import { decrypt } from '../../../utils/encryption.js';

/**
 * Pull sync job - runs periodically to sync bookings from Beds24
 */
export async function runPullSyncJob(): Promise<{
  success: boolean;
  bookingsPulled: number;
  bookingsSynced: number;
  errors: number;
  error?: string;
}> {
  try {
    // Load Beds24 config
    const hotelId = '00000000-0000-0000-0000-000000000000';
    const config = await db('beds24_config')
      .where({ hotel_id: hotelId })
      .first();

    if (!config) {
      return {
        success: false,
        bookingsPulled: 0,
        bookingsSynced: 0,
        errors: 0,
        error: 'Beds24 configuration not found',
      };
    }

    if (!config.sync_enabled || !config.pull_sync_enabled) {
      return {
        success: true,
        bookingsPulled: 0,
        bookingsSynced: 0,
        errors: 0,
        error: 'Pull sync is disabled',
      };
    }

    const refreshToken = decrypt(config.refresh_token);
    const service = new PullSyncService(refreshToken);

    // Get last sync timestamp
    const lastSync = config.last_successful_sync
      ? new Date(config.last_successful_sync)
      : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // Default to 7 days ago

    // Pull bookings modified since last sync
    const bookings = await service.pullBookings(config.beds24_hotel_id, lastSync);

    // Sync bookings to PMS
    const results = await service.syncBookingsToPms(bookings);

    const successful = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    // Update last sync timestamp
    await db('beds24_config')
      .where({ hotel_id: hotelId })
      .update({
        last_successful_sync: new Date(),
        updated_at: new Date(),
      });

    return {
      success: true,
      bookingsPulled: bookings.length,
      bookingsSynced: successful,
      errors: failed,
    };
  } catch (error) {
    return {
      success: false,
      bookingsPulled: 0,
      bookingsSynced: 0,
      errors: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Full sync job - syncs all bookings (runs daily)
 */
export async function runFullSyncJob(): Promise<{
  success: boolean;
  bookingsPulled: number;
  bookingsSynced: number;
  errors: number;
  error?: string;
}> {
  try {
    const hotelId = '00000000-0000-0000-0000-000000000000';
    const config = await db('beds24_config')
      .where({ hotel_id: hotelId })
      .first();

    if (!config) {
      return {
        success: false,
        bookingsPulled: 0,
        bookingsSynced: 0,
        errors: 0,
        error: 'Beds24 configuration not found',
      };
    }

    if (!config.sync_enabled || !config.pull_sync_enabled) {
      return {
        success: true,
        bookingsPulled: 0,
        bookingsSynced: 0,
        errors: 0,
        error: 'Pull sync is disabled',
      };
    }

    const refreshToken = decrypt(config.refresh_token);
    const service = new PullSyncService(refreshToken);

    // Pull all bookings (no lastModified filter)
    const bookings = await service.pullBookings(config.beds24_hotel_id);

    // Sync bookings to PMS
    const results = await service.syncBookingsToPms(bookings);

    const successful = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    // Update last sync timestamp
    await db('beds24_config')
      .where({ hotel_id: hotelId })
      .update({
        last_successful_sync: new Date(),
        updated_at: new Date(),
      });

    return {
      success: true,
      bookingsPulled: bookings.length,
      bookingsSynced: successful,
      errors: failed,
    };
  } catch (error) {
    return {
      success: false,
      bookingsPulled: 0,
      bookingsSynced: 0,
      errors: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

