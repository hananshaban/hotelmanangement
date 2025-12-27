import { RoomSyncService } from './room_sync_service.js';
import { PullSyncService } from './pull_sync_service.js';
import db from '../../../config/database.js';
import { decrypt } from '../../../utils/encryption.js';

/**
 * Service for performing initial sync when Beds24 is first integrated
 * This syncs all rooms and reservations from Beds24 to PMS
 */
export class InitialSyncService {
  private refreshToken: string;
  private beds24PropertyId: string;
  private propertyId: string;

  constructor(refreshToken: string, beds24PropertyId: string, propertyId: string) {
    this.refreshToken = refreshToken;
    this.beds24PropertyId = beds24PropertyId;
    this.propertyId = propertyId;
  }

  /**
   * Perform initial sync: rooms + reservations
   * Phase 2 & 5: Tracks sync status, progress, and errors
   */
  async performInitialSync(): Promise<{
    success: boolean;
    rooms: {
      created: number;
      mapped: number;
      errors: Array<{ roomId: number; error: string }>;
    };
    reservations: {
      synced: number;
      errors: number;
      errorDetails: Array<{ bookingId?: string; error: string }>;
    };
    error?: string;
  }> {
    const syncStartedAt = new Date();
    const syncErrors: Array<{ type: string; message: string; details?: any }> = [];

    try {
      console.log('Starting initial Beds24 sync...');

      // Phase 2: Set sync status to running
      await db('beds24_config')
        .where({ property_id: this.propertyId })
        .update({
          sync_status: 'running',
          sync_started_at: syncStartedAt,
          sync_progress: JSON.stringify({
            rooms: { total: 0, synced: 0, errors: 0 },
            reservations: { total: 0, synced: 0, errors: 0 },
          }),
          sync_errors: JSON.stringify([]),
          updated_at: new Date(),
        });

      // Step 1: Sync rooms
      const roomSyncService = new RoomSyncService(this.refreshToken);
      const roomResult = await this.syncRooms(roomSyncService);

      // Update progress after room sync
      await db('beds24_config')
        .where({ property_id: this.propertyId })
        .update({
          sync_progress: JSON.stringify({
            rooms: {
              total: roomResult.created + roomResult.mapped,
              synced: roomResult.created + roomResult.mapped,
              errors: roomResult.errors.length,
            },
            reservations: { total: 0, synced: 0, errors: 0 },
          }),
          sync_errors: JSON.stringify(
            roomResult.errors.map((e) => ({
              type: 'room',
              message: e.error,
              details: { roomId: e.roomId },
            }))
          ),
        });

      // Step 2: Sync reservations
      const pullSyncService = new PullSyncService(this.refreshToken);
      const reservationResult = await this.syncReservations(pullSyncService);

      // Phase 5: Aggregate all errors with detailed information
      const allErrors = [
        ...roomResult.errors.map((e) => ({
          type: 'room',
          message: e.error,
          details: { roomId: e.roomId },
        })),
        // Add detailed reservation errors
        ...reservationResult.errorDetails.map((e) => ({
          type: 'reservation',
          message: e.error,
          details: { 
            bookingId: e.bookingId,
          },
        })),
      ];

      const syncCompletedAt = new Date();

      // Update sync status and results
      await db('beds24_config')
        .where({ property_id: this.propertyId })
        .update({
          sync_status: 'completed',
          sync_completed_at: syncCompletedAt,
          sync_progress: JSON.stringify({
            rooms: {
              total: roomResult.created + roomResult.mapped,
              synced: roomResult.created + roomResult.mapped,
              errors: roomResult.errors.length,
            },
            reservations: {
              total: reservationResult.synced + reservationResult.errors,
              synced: reservationResult.synced,
              errors: reservationResult.errors,
            },
          }),
          sync_errors: JSON.stringify(allErrors),
          last_successful_sync: syncCompletedAt,
          updated_at: new Date(),
        });

      console.log('Initial Beds24 sync completed:', {
        rooms: roomResult,
        reservations: reservationResult,
      });

      return {
        success: true,
        rooms: roomResult,
        reservations: reservationResult,
      };
    } catch (error) {
      console.error('Initial sync failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      syncErrors.push({
        type: 'system',
        message: errorMessage,
      });

      // Phase 2 & 5: Mark sync as failed and record error
      await db('beds24_config')
        .where({ property_id: this.propertyId })
        .update({
          sync_status: 'failed',
          sync_completed_at: new Date(),
          sync_errors: JSON.stringify(syncErrors),
          updated_at: new Date(),
        });

      return {
        success: false,
        rooms: { created: 0, mapped: 0, errors: [] },
        reservations: { synced: 0, errors: 0, errorDetails: [] },
        error: errorMessage,
      };
    }
  }

  /**
   * Sync all rooms from Beds24
   */
  private async syncRooms(roomSyncService: RoomSyncService): Promise<{
    created: number;
    mapped: number;
    errors: Array<{ roomId: number; error: string }>;
  }> {
    try {
      // Get all Beds24 rooms
      const beds24Rooms = await roomSyncService.pullRooms(this.beds24PropertyId);
      
      if (beds24Rooms.length === 0) {
        console.warn('No rooms found in Beds24');
        return { created: 0, mapped: 0, errors: [] };
      }

      console.log(`Found ${beds24Rooms.length} rooms in Beds24`);

      // Get existing PMS room types (new Beds24-style)
      const pmsRoomTypes = await db('room_types')
        .select('id', 'name', 'beds24_room_id', 'room_type', 'price_per_night', 'floor')
        .whereNull('deleted_at');

      // Auto-create/update room types from Beds24 rooms
      // The sync service will handle grouping and checking for existing room types
      console.log(`Syncing room types from ${beds24Rooms.length} Beds24 rooms...`);
      const createResult = await roomSyncService.autoCreateRoomsFromBeds24(
        this.beds24PropertyId,
        {
          defaultPrice: 100,
          defaultFloor: 1,
        }
      );
      
      const created = createResult.created;
      const skipped = createResult.skipped;
      const errors = createResult.errors;

      // Count total room types after sync
      const totalRoomTypes = await db('room_types')
        .whereNull('deleted_at')
        .count('* as count')
        .first();
      
      const mapped = parseInt(totalRoomTypes?.count?.toString() || '0');

      return { created, mapped, errors };
    } catch (error) {
      console.error('Room sync failed:', error);
      return {
        created: 0,
        mapped: 0,
        errors: [
          {
            roomId: 0,
            error: error instanceof Error ? error.message : 'Unknown error',
          },
        ],
      };
    }
  }

  /**
   * Sync all reservations from Beds24
   */
  private async syncReservations(pullSyncService: PullSyncService): Promise<{
    synced: number;
    errors: number;
    errorDetails: Array<{ bookingId?: string; error: string }>;
  }> {
    try {
      // Pull all bookings from Beds24 (no date filter for initial sync)
      console.log('Pulling all bookings from Beds24...');
      const bookings = await pullSyncService.pullBookings(this.beds24PropertyId);

      if (bookings.length === 0) {
        console.log('No bookings found in Beds24');
        return { synced: 0, errors: 0, errorDetails: [] };
      }

      console.log(`Found ${bookings.length} bookings in Beds24`);
      if (bookings.length > 0) {
        console.log('Sample booking:', JSON.stringify(bookings[0], null, 2).substring(0, 500));
      }

      // Sync bookings to PMS
      const results = await pullSyncService.syncBookingsToPms(bookings);

      const synced = results.filter((r) => r.success).length;
      const errors = results.filter((r) => !r.success).length;
      const errorDetails = results
        .filter((r) => !r.success)
        .map((r) => {
          const detail: { bookingId?: string; error: string } = {
            error: r.error || 'Unknown error',
          };
          if (r.beds24Id) {
            detail.bookingId = r.beds24Id;
          }
          return detail;
        });

      console.log(`Synced ${synced} reservations, ${errors} errors`);
      
      // Log errors for debugging
      if (errors > 0) {
        console.error('Reservation sync errors:', errorDetails);
      }

      return { synced, errors, errorDetails };
    } catch (error) {
      console.error('Reservation sync failed:', error);
      return { 
        synced: 0, 
        errors: 1, 
        errorDetails: [{ error: error instanceof Error ? error.message : 'Unknown error' }] 
      };
    }
  }
}

