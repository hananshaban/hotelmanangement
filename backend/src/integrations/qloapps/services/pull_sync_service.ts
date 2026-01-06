/**
 * QloApps Pull Sync Service
 *
 * Pulls bookings from QloApps and syncs them to PMS.
 * Handles incremental sync based on last modified date.
 */

import { QloAppsClient } from '../qloapps_client.js';
import { QLOAPPS_CONFIG } from '../qloapps_config.js';
import type {
  QloAppsBooking,
  QloAppsSyncResult,
  QloAppsStoredConfig,
} from '../qloapps_types.js';
import { QloAppsGuestMatchingService } from './guest_matching_service.js';
import {
  mapQloAppsBookingToPms,
  validateQloAppsBooking,
  extractBookingDates,
} from '../mappers/reservation_mapper.js';
import db from '../../../config/database.js';
import { decrypt } from '../../../utils/encryption.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Result of syncing a single booking
 */
export interface BookingSyncResult {
  success: boolean;
  qloAppsBookingId: number;
  pmsReservationId?: string;
  action: 'created' | 'updated' | 'skipped' | 'failed';
  error?: string;
}

/**
 * Options for pull sync operation
 */
export interface PullSyncOptions {
  /** Only sync bookings modified after this date */
  modifiedSince?: Date;
  /** Filter by booking status */
  bookingStatus?: number;
  /** Maximum bookings to process */
  limit?: number;
  /** Whether to do a full sync (ignore lastModified) */
  fullSync?: boolean;
}

// ============================================================================
// Pull Sync Service
// ============================================================================

/**
 * Service for pulling bookings from QloApps to PMS
 */
export class QloAppsPullSyncService {
  private client: QloAppsClient;
  private configId: string;
  private guestMatchingService: QloAppsGuestMatchingService;

  constructor(client: QloAppsClient, configId: string) {
    this.client = client;
    this.configId = configId;
    this.guestMatchingService = new QloAppsGuestMatchingService();
  }

  /**
   * Create a new PullSyncService instance from stored config
   */
  static async fromConfigId(configId: string): Promise<QloAppsPullSyncService> {
    const config = await db('qloapps_config')
      .where({ id: configId })
      .first();

    if (!config) {
      throw new Error(`QloApps config not found: ${configId}`);
    }

    const apiKey = decrypt(config.api_key_encrypted);
    const client = new QloAppsClient({
      baseUrl: config.base_url,
      apiKey,
      hotelId: parseInt(config.qloapps_hotel_id, 10),
    });

    return new QloAppsPullSyncService(client, configId);
  }

  /**
   * Pull bookings from QloApps
   */
  async pullBookings(options: PullSyncOptions = {}): Promise<QloAppsBooking[]> {
    const params: Record<string, any> = {};

    // Add date filters
    if (options.modifiedSince && !options.fullSync) {
      params.modifiedSince = options.modifiedSince.toISOString();
    }

    if (options.bookingStatus) {
      params.bookingStatus = options.bookingStatus;
    }

    if (options.limit) {
      params.limit = options.limit;
    }

    console.log(`[QloApps Pull] Fetching bookings with params:`, params);

    const bookings = await this.client.getBookings(params);

    console.log(`[QloApps Pull] Received ${bookings.length} bookings`);

    return bookings;
  }

  /**
   * Sync bookings from QloApps to PMS
   */
  async syncBookingsToPms(bookings: QloAppsBooking[]): Promise<BookingSyncResult[]> {
    const results: BookingSyncResult[] = [];

    console.log(`[QloApps Pull] Syncing ${bookings.length} bookings to PMS...`);

    for (const booking of bookings) {
      try {
        const result = await this.syncSingleBooking(booking);
        results.push(result);
      } catch (error) {
        console.error(`[QloApps Pull] Error syncing booking ${booking.id}:`, error);
        results.push({
          success: false,
          qloAppsBookingId: booking.id,
          action: 'failed',
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return results;
  }

  /**
   * Sync a single booking to PMS
   */
  private async syncSingleBooking(booking: QloAppsBooking): Promise<BookingSyncResult> {
    // Validate booking
    const validation = validateQloAppsBooking(booking);
    if (!validation.valid) {
      console.warn(`[QloApps Pull] Booking ${booking.id} validation failed:`, validation.errors);
      return {
        success: false,
        qloAppsBookingId: booking.id,
        action: 'skipped',
        error: `Validation failed: ${validation.errors.join(', ')}`,
      };
    }

    // Check if booking already exists in PMS
    const existingMapping = await db('qloapps_reservation_mappings')
      .where({
        qloapps_config_id: this.configId,
        qloapps_booking_id: booking.id.toString(),
      })
      .first();

    // Find room type mapping
    const firstRoomType = booking.room_types[0];
    if (!firstRoomType) {
      return {
        success: false,
        qloAppsBookingId: booking.id,
        action: 'skipped',
        error: 'No room types in booking',
      };
    }

    const roomTypeMapping = await db('qloapps_room_type_mappings')
      .where({
        qloapps_config_id: this.configId,
        qloapps_room_type_id: firstRoomType.id_room_type.toString(),
        is_active: true,
      })
      .first();

    if (!roomTypeMapping) {
      console.warn(`[QloApps Pull] No room type mapping for QloApps room type ${firstRoomType.id_room_type}`);
      return {
        success: false,
        qloAppsBookingId: booking.id,
        action: 'skipped',
        error: `No room type mapping for QloApps room type ${firstRoomType.id_room_type}`,
      };
    }

    // Find or create guest
    const guestResult = await this.guestMatchingService.findOrCreateGuestFromBooking(
      booking.customer_detail
    );

    console.log(`[QloApps Pull] Booking ${booking.id}: Guest ${guestResult.guestId} (${guestResult.matchSource})`);

    // Map booking to PMS reservation format
    const reservationData = mapQloAppsBookingToPms(
      booking,
      roomTypeMapping.pms_room_type_id,
      guestResult.guestId
    );

    if (existingMapping) {
      // Update existing reservation
      return await this.updateExistingReservation(
        booking,
        existingMapping.pms_reservation_id,
        reservationData
      );
    } else {
      // Create new reservation
      return await this.createNewReservation(
        booking,
        reservationData,
        guestResult.guestId
      );
    }
  }

  /**
   * Create a new reservation in PMS
   */
  private async createNewReservation(
    booking: QloAppsBooking,
    reservationData: ReturnType<typeof mapQloAppsBookingToPms>,
    guestId: string
  ): Promise<BookingSyncResult> {
    console.log(`[QloApps Pull] Creating new reservation for booking ${booking.id}`);

    // Insert reservation
    const [reservation] = await db('reservations')
      .insert({
        room_type_id: reservationData.room_type_id,
        room_id: null,
        primary_guest_id: guestId,
        check_in: reservationData.check_in,
        check_out: reservationData.check_out,
        status: reservationData.status,
        total_amount: reservationData.total_amount,
        source: reservationData.source,
        special_requests: reservationData.special_requests,
        units_requested: reservationData.units_requested,
        num_adult: reservationData.num_adult,
        num_child: reservationData.num_child,
        channel: reservationData.channel,
        qloapps_booking_id: booking.id.toString(),
      })
      .returning(['id']);

    // Create primary guest link
    await db('reservation_guests').insert({
      reservation_id: reservation.id,
      guest_id: guestId,
      guest_type: 'Primary',
    });

    // Create mapping record
    await db('qloapps_reservation_mappings').insert({
      qloapps_config_id: this.configId,
      pms_reservation_id: reservation.id,
      qloapps_booking_id: booking.id.toString(),
      sync_direction: 'pull',
      last_sync_at: new Date(),
    });

    console.log(`[QloApps Pull] Created reservation ${reservation.id} for booking ${booking.id}`);

    return {
      success: true,
      qloAppsBookingId: booking.id,
      pmsReservationId: reservation.id,
      action: 'created',
    };
  }

  /**
   * Update an existing reservation in PMS
   */
  private async updateExistingReservation(
    booking: QloAppsBooking,
    reservationId: string,
    reservationData: ReturnType<typeof mapQloAppsBookingToPms>
  ): Promise<BookingSyncResult> {
    console.log(`[QloApps Pull] Updating reservation ${reservationId} from booking ${booking.id}`);

    // Check if reservation still exists
    const existing = await db('reservations')
      .where({ id: reservationId })
      .whereNull('deleted_at')
      .first();

    if (!existing) {
      // Reservation was deleted in PMS, skip update
      return {
        success: false,
        qloAppsBookingId: booking.id,
        pmsReservationId: reservationId,
        action: 'skipped',
        error: 'Reservation was deleted in PMS',
      };
    }

    // Update reservation
    await db('reservations')
      .where({ id: reservationId })
      .update({
        check_in: reservationData.check_in,
        check_out: reservationData.check_out,
        status: reservationData.status,
        total_amount: reservationData.total_amount,
        special_requests: reservationData.special_requests,
        num_adult: reservationData.num_adult,
        num_child: reservationData.num_child,
        updated_at: new Date(),
      });

    // Update mapping record
    await db('qloapps_reservation_mappings')
      .where({
        qloapps_config_id: this.configId,
        qloapps_booking_id: booking.id.toString(),
      })
      .update({
        last_sync_at: new Date(),
        sync_direction: 'pull',
      });

    console.log(`[QloApps Pull] Updated reservation ${reservationId}`);

    return {
      success: true,
      qloAppsBookingId: booking.id,
      pmsReservationId: reservationId,
      action: 'updated',
    };
  }

  /**
   * Run a full pull sync operation
   */
  async runPullSync(options: PullSyncOptions = {}): Promise<QloAppsSyncResult> {
    const startedAt = new Date();
    const errors: string[] = [];

    let processedCount = 0;
    let createdCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;
    let failedCount = 0;

    try {
      // Determine modified since date
      let modifiedSince = options.modifiedSince;
      if (!modifiedSince && !options.fullSync) {
        // Get last successful sync time
        const syncState = await db('qloapps_sync_state')
          .where({
            qloapps_config_id: this.configId,
            entity_type: 'reservation',
          })
          .first();

        if (syncState?.last_sync_at) {
          modifiedSince = new Date(syncState.last_sync_at);
        }
      }

      // Pull bookings - build options without undefined values
      const pullOptions: PullSyncOptions = {};
      if (modifiedSince) {
        pullOptions.modifiedSince = modifiedSince;
      }
      if (options.bookingStatus !== undefined) {
        pullOptions.bookingStatus = options.bookingStatus;
      }
      if (options.limit !== undefined) {
        pullOptions.limit = options.limit;
      }
      if (options.fullSync !== undefined) {
        pullOptions.fullSync = options.fullSync;
      }

      const bookings = await this.pullBookings(pullOptions);

      // Sync to PMS
      const results = await this.syncBookingsToPms(bookings);

      // Aggregate results
      processedCount = results.length;
      for (const result of results) {
        switch (result.action) {
          case 'created':
            createdCount++;
            break;
          case 'updated':
            updatedCount++;
            break;
          case 'skipped':
            skippedCount++;
            if (result.error) {
              errors.push(`Booking ${result.qloAppsBookingId}: ${result.error}`);
            }
            break;
          case 'failed':
            failedCount++;
            if (result.error) {
              errors.push(`Booking ${result.qloAppsBookingId}: ${result.error}`);
            }
            break;
        }
      }

      // Update sync state
      await this.updateSyncState('reservation', true);

      // Log sync results
      await this.logSyncResult({
        syncType: QLOAPPS_CONFIG.SYNC_TYPES.RESERVATIONS_PULL,
        success: failedCount === 0,
        processedCount,
        createdCount,
        updatedCount,
        skippedCount,
        failedCount,
        errors,
        startedAt,
        completedAt: new Date(),
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      errors.push(errorMessage);
      failedCount++;

      // Update sync state with failure
      await this.updateSyncState('reservation', false, errorMessage);
    }

    const completedAt = new Date();

    return {
      success: failedCount === 0,
      syncType: QLOAPPS_CONFIG.SYNC_TYPES.RESERVATIONS_PULL,
      processedCount,
      createdCount,
      updatedCount,
      skippedCount,
      failedCount,
      errors,
      durationMs: completedAt.getTime() - startedAt.getTime(),
      startedAt,
      completedAt,
    };
  }

  /**
   * Update sync state in database
   */
  private async updateSyncState(
    entityType: string,
    success: boolean,
    errorMessage?: string
  ): Promise<void> {
    const existing = await db('qloapps_sync_state')
      .where({
        qloapps_config_id: this.configId,
        entity_type: entityType,
      })
      .first();

    const now = new Date();
    const updates = {
      last_sync_at: now,
      last_sync_success: success,
      last_sync_error: success ? null : errorMessage,
      consecutive_failures: success ? 0 : (existing?.consecutive_failures || 0) + 1,
      updated_at: now,
    };

    if (existing) {
      await db('qloapps_sync_state')
        .where({ id: existing.id })
        .update(updates);
    } else {
      await db('qloapps_sync_state').insert({
        qloapps_config_id: this.configId,
        entity_type: entityType,
        ...updates,
      });
    }
  }

  /**
   * Log sync result to database
   */
  private async logSyncResult(result: {
    syncType: string;
    success: boolean;
    processedCount: number;
    createdCount: number;
    updatedCount: number;
    skippedCount: number;
    failedCount: number;
    errors: string[];
    startedAt: Date;
    completedAt: Date;
  }): Promise<void> {
    await db('qloapps_sync_logs').insert({
      qloapps_config_id: this.configId,
      sync_type: result.syncType,
      direction: 'pull',
      status: result.success ? 'success' : 'failed',
      started_at: result.startedAt,
      completed_at: result.completedAt,
      records_processed: result.processedCount,
      records_created: result.createdCount,
      records_updated: result.updatedCount,
      records_failed: result.failedCount,
      error_details: result.errors.length > 0 ? JSON.stringify(result.errors) : null,
    });
  }
}
