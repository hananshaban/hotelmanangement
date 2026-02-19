/**
 * QloApps Push Sync Service
 *
 * Pushes reservations from PMS to QloApps.
 * Handles creating and updating bookings in QloApps.
 */

import { QloAppsClient } from '../qloapps_client.js';
import { QLOAPPS_CONFIG } from '../qloapps_config.js';
import type {
  QloAppsBookingCreateRequest,
  QloAppsBookingUpdateRequest,
  QloAppsSyncResult,
} from '../qloapps_types.js';
import {
  mapPmsReservationToQloApps,
  mapPmsReservationToQloAppsUpdate,
} from '../mappers/reservation_mapper.js';
import db from '../../../config/database.js';
import { decrypt } from '../../../utils/encryption.js';
import type { ReservationResponse } from '../../../services/reservations/reservations_types.js';
import type { GuestResponse } from '../../../services/guests/guests_types.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Result of pushing a single reservation
 */
export interface ReservationPushResult {
  success: boolean;
  pmsReservationId: string;
  qloAppsBookingId?: number;
  action: 'created' | 'updated' | 'skipped' | 'failed';
  error?: string;
}

/**
 * Options for push sync operation
 */
export interface PushSyncOptions {
  /** Only push reservations modified after this date */
  modifiedSince?: Date;
  /** Specific reservation IDs to push */
  reservationIds?: string[];
  /** Maximum reservations to process */
  limit?: number;
  /** Push all reservations regardless of last sync */
  fullSync?: boolean;
}

// ============================================================================
// Push Sync Service
// ============================================================================

/**
 * Service for pushing reservations from PMS to QloApps
 */
export class QloAppsPushSyncService {
  private client: QloAppsClient;
  private configId: string;
  private hotelId: string;
  private qloAppsHotelId: number;
  private currency: string;

  constructor(
    client: QloAppsClient, 
    configId: string, 
    hotelId: string,
    qloAppsHotelId: number,
    currency?: string
  ) {
    this.client = client;
    this.configId = configId;
    this.hotelId = hotelId;
    this.qloAppsHotelId = qloAppsHotelId;
    // Use explicit currency if provided, otherwise fall back to env or USD
    const defaultCurrency = process.env.QLOAPPS_DEFAULT_CURRENCY ?? 'USD';
    this.currency = (currency ?? defaultCurrency).toUpperCase();
  }

  /**
   * Create a new PushSyncService instance from stored config
   */
  static async fromConfigId(configId: string): Promise<QloAppsPushSyncService> {
    const config = await db('qloapps_config')
      .where({ id: configId })
      .first();

    if (!config) {
      throw new Error(`QloApps config not found: ${configId}`);
    }

    const apiKey = decrypt(config.api_key_encrypted);
    const hotelId = parseInt(config.qloapps_hotel_id, 10);
    
    const client = new QloAppsClient({
      baseUrl: config.base_url,
      apiKey,
      hotelId,
    });

    return new QloAppsPushSyncService(
      client, 
      configId,
      config.hotel_id,
      hotelId
    );
  }

  /**
   * Get reservations that need to be pushed to QloApps
   */
  async getReservationsToSync(options: PushSyncOptions = {}): Promise<ReservationResponse[]> {
    let query = db('reservations')
      .whereNull('deleted_at')
      // Only push reservations that did NOT originate from QloApps.
      // QloApps-originated reservations are handled by the inbound pull sync and
      // are explicitly marked with source='QloApps' (see mapQloAppsSourceToPms).
      // Using an exclusion keeps the query compatible with the check constraint:
      // CHECK (source IN ('Direct', 'Beds24', 'Booking.com', 'Expedia', 'QloApps', 'Other'))
      .whereNot('source', 'QloApps')
      .orderBy('updated_at', 'desc');

    // Filter by specific IDs
    if (options.reservationIds && options.reservationIds.length > 0) {
      query = query.whereIn('id', options.reservationIds);
    }

    // Filter by modified date
    if (options.modifiedSince && !options.fullSync) {
      query = query.where('updated_at', '>=', options.modifiedSince);
    }

    // Limit results
    if (options.limit) {
      query = query.limit(options.limit);
    }

    const reservations = await query;

    // Get primary guests for each reservation
    const reservationsWithGuests: ReservationResponse[] = [];

    for (const res of reservations) {
      // Get primary guest
      const guestLink = await db('reservation_guests')
        .where({ reservation_id: res.id, guest_type: 'Primary' })
        .first();

      let primaryGuest = null;
      if (guestLink) {
        primaryGuest = await db('guests')
          .where({ id: guestLink.guest_id })
          .first();
      }

      // Build response object
      reservationsWithGuests.push({
        ...res,
        primary_guest_name: primaryGuest?.name || 'Unknown Guest',
        primary_guest_email: primaryGuest?.email || '',
        primary_guest_phone: primaryGuest?.phone || '',
      });
    }

    return reservationsWithGuests;
  }

  /**
   * Push reservations to QloApps
   */
  async pushReservations(reservations: ReservationResponse[]): Promise<ReservationPushResult[]> {
    const results: ReservationPushResult[] = [];

    console.log(`[QloApps Push] Pushing ${reservations.length} reservations...`);

    for (const reservation of reservations) {
      try {
        const result = await this.pushSingleReservation(reservation);
        results.push(result);
      } catch (error) {
        console.error(`[QloApps Push] Error pushing reservation ${reservation.id}:`, error);
        results.push({
          success: false,
          pmsReservationId: reservation.id,
          action: 'failed',
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return results;
  }

  /**
   * Push a single reservation to QloApps
   */
  private async pushSingleReservation(reservation: ReservationResponse): Promise<ReservationPushResult> {
    // Check if reservation is already mapped
    const existingMapping = await db('qloapps_reservation_mappings')
      .where({
        hotel_id: this.hotelId,
        local_reservation_id: reservation.id,
      })
      .first();

    // Get room type mapping
    const roomTypeId = reservation.room_type_id || reservation.room_id;
    if (!roomTypeId) {
      return {
        success: false,
        pmsReservationId: reservation.id,
        action: 'skipped',
        error: 'No room type or room ID',
      };
    }

    const roomTypeMapping = await db('qloapps_room_type_mappings')
      .where({
        hotel_id: this.hotelId,
        local_room_type_id: roomTypeId,
        is_active: true,
      })
      .first();

    if (!roomTypeMapping) {
      console.warn(`[QloApps Push] No room type mapping for PMS room type ${roomTypeId}`);
      return {
        success: false,
        pmsReservationId: reservation.id,
        action: 'skipped',
        error: `No room type mapping for ${roomTypeId}`,
      };
    }

    // Get guest data
    const guestLink = await db('reservation_guests')
      .where({ reservation_id: reservation.id, guest_type: 'Primary' })
      .first();

    let guest: GuestResponse | null = null;
    if (guestLink) {
      guest = await db('guests')
        .where({ id: guestLink.guest_id })
        .first();
    }

    if (!guest) {
      return {
        success: false,
        pmsReservationId: reservation.id,
        action: 'skipped',
        error: 'No primary guest found',
      };
    }

    if (existingMapping) {
      // Update existing booking
      return await this.updateBooking(
        reservation,
        existingMapping.qloapps_order_id,
        parseInt(roomTypeMapping.qloapps_product_id, 10),
        guest
      );
    } else {
      // Create new booking
      return await this.createBooking(
        reservation,
        parseInt(roomTypeMapping.qloapps_product_id, 10),
        guest
      );
    }
  }

  /**
   * Create a new booking in QloApps
   */
  private async createBooking(
    reservation: ReservationResponse,
    qloAppsRoomTypeId: number,
    guest: GuestResponse
  ): Promise<ReservationPushResult> {
    console.log(`[QloApps Push] Creating booking for reservation ${reservation.id}`);

    // Map reservation to QloApps format
    const bookingRequest = mapPmsReservationToQloApps(
      reservation,
      guest,
      qloAppsRoomTypeId,
      this.currency
    );

    // Ensure id_property is set from QloApps config (hotelId)
    // This helps QloApps associate the booking with the correct property
    (bookingRequest as QloAppsBookingCreateRequest).id_property = this.qloAppsHotelId;

    // Log the outbound booking payload (trimmed if very large)
    try {
      const payloadJson = JSON.stringify(bookingRequest);
      const maxLength = 4000; // prevent log flooding
      const trimmed =
        payloadJson.length > maxLength
          ? payloadJson.slice(0, maxLength) + '...<truncated>'
          : payloadJson;
      console.log(`[QloApps Push] Booking payload for reservation ${reservation.id}: ${trimmed}`);
    } catch (err) {
      console.warn(
        `[QloApps Push] Failed to serialize booking payload for reservation ${reservation.id}:`,
        err
      );
    }

    try {
      // Create booking in QloApps - returns the booking ID directly
      const qloAppsBookingId = await this.client.createBooking(bookingRequest);

      // Create mapping record
      await db('qloapps_reservation_mappings').insert({
        hotel_id: this.hotelId,
        local_reservation_id: reservation.id,
        qloapps_order_id: qloAppsBookingId.toString(),
        qloapps_hotel_id: this.qloAppsHotelId.toString(),
        source: 'pms',
        last_synced_at: new Date(),
        last_sync_status: 'success',
      });

      console.log(`[QloApps Push] Created booking ${qloAppsBookingId} for reservation ${reservation.id}`);

      return {
        success: true,
        pmsReservationId: reservation.id,
        qloAppsBookingId,
        action: 'created',
      };
    } catch (error) {
      console.error(`[QloApps Push] Failed to create booking:`, error);
      return {
        success: false,
        pmsReservationId: reservation.id,
        action: 'failed',
        error: error instanceof Error ? error.message : 'Failed to create booking',
      };
    }
  }

  /**
   * Update an existing booking in QloApps
   */
  private async updateBooking(
    reservation: ReservationResponse,
    qloAppsBookingId: string,
    qloAppsRoomTypeId: number,
    guest: GuestResponse
  ): Promise<ReservationPushResult> {
    console.log(`[QloApps Push] Updating booking ${qloAppsBookingId} from reservation ${reservation.id}`);

    const bookingId = parseInt(qloAppsBookingId, 10);

    // Map reservation to QloApps update format
    const updateRequest = mapPmsReservationToQloAppsUpdate(reservation, bookingId);

    try {
      // Update booking in QloApps
      await this.client.updateBooking(updateRequest);

      // Update mapping record (sync_direction column does not exist — removed)
      await db('qloapps_reservation_mappings')
        .where({
          hotel_id: this.hotelId,
          local_reservation_id: reservation.id,
        })
        .update({
          last_synced_at: new Date(),
          last_sync_status: 'success',
        });

      console.log(`[QloApps Push] Updated booking ${qloAppsBookingId}`);

      return {
        success: true,
        pmsReservationId: reservation.id,
        qloAppsBookingId: bookingId,
        action: 'updated',
      };
    } catch (error) {
      console.error(`[QloApps Push] Failed to update booking:`, error);
      return {
        success: false,
        pmsReservationId: reservation.id,
        qloAppsBookingId: bookingId,
        action: 'failed',
        error: error instanceof Error ? error.message : 'Failed to update booking',
      };
    }
  }

  /**
   * Run a full push sync operation
   */
  async runPushSync(options: PushSyncOptions = {}): Promise<QloAppsSyncResult> {
    const startedAt = new Date();
    const errors: string[] = [];

    let processedCount = 0;
    let createdCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;
    let failedCount = 0;

    // Create a sync-state row before processing with correct column names
    const [syncStateRow] = await db('qloapps_sync_state')
      .insert({
        hotel_id: this.hotelId,
        sync_type: QLOAPPS_CONFIG.SYNC_TYPES.RESERVATIONS_PUSH,
        status: 'running',
        started_at: startedAt,
      })
      .returning(['id']);

    try {
      // Determine modified since date using correct column names
      let modifiedSince = options.modifiedSince;
      if (!modifiedSince && !options.fullSync) {
        const lastSync = await db('qloapps_sync_state')
          .where({
            hotel_id: this.hotelId,
            sync_type: QLOAPPS_CONFIG.SYNC_TYPES.RESERVATIONS_PUSH,
            status: 'completed',
          })
          .orderBy('completed_at', 'desc')
          .first();

        if (lastSync?.last_successful_sync) {
          modifiedSince = new Date(lastSync.last_successful_sync);
        }
      }

      // Get reservations - build options without undefined values
      const getOptions: PushSyncOptions = {};
      if (modifiedSince) {
        getOptions.modifiedSince = modifiedSince;
      }
      if (options.reservationIds !== undefined) {
        getOptions.reservationIds = options.reservationIds;
      }
      if (options.limit !== undefined) {
        getOptions.limit = options.limit;
      }
      if (options.fullSync !== undefined) {
        getOptions.fullSync = options.fullSync;
      }

      const reservations = await this.getReservationsToSync(getOptions);

      // Push to QloApps
      const results = await this.pushReservations(reservations);

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
              errors.push(`Reservation ${result.pmsReservationId}: ${result.error}`);
            }
            break;
          case 'failed':
            failedCount++;
            if (result.error) {
              errors.push(`Reservation ${result.pmsReservationId}: ${result.error}`);
            }
            break;
        }
      }

      const completedAt = new Date();

      // Mark sync state as completed with correct column names
      await db('qloapps_sync_state')
        .where({ id: syncStateRow.id })
        .update({
          status: 'completed',
          completed_at: completedAt,
          last_successful_sync: completedAt,
          reservations_processed: processedCount,
          reservations_created: createdCount,
          reservations_updated: updatedCount,
          reservations_failed: failedCount,
        });

      // Log sync results with correct schema columns
      await this.logSyncResult({
        syncType: QLOAPPS_CONFIG.SYNC_TYPES.RESERVATIONS_PUSH,
        success: failedCount === 0,
        processedCount,
        createdCount,
        updatedCount,
        skippedCount,
        failedCount,
        errors,
        startedAt,
        completedAt,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      errors.push(errorMessage);
      failedCount++;

      await db('qloapps_sync_state')
        .where({ id: syncStateRow.id })
        .update({
          status: 'failed',
          completed_at: new Date(),
          error_message: errorMessage,
        });
    }

    const completedAt = new Date();

    return {
      success: failedCount === 0,
      syncType: QLOAPPS_CONFIG.SYNC_TYPES.RESERVATIONS_PUSH,
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
   * Log a batch-level sync result to qloapps_sync_logs using the correct schema columns.
   *
   * Column mapping vs the old broken version:
   *  - direction: 'outbound' (was 'push' — violates check constraint)
   *  - operation: 'push'     (required NOT NULL — was missing)
   *  - entity_type: 'reservation' (required NOT NULL — was missing)
   *  - started_at            (required NOT NULL — was missing)
   *  - error_message         (was 'error_details' — column does not exist)
   *  - metadata              (stores aggregated counts; schema has no records_* columns)
   *  - removed: sync_type, records_processed/created/updated/failed (columns do not exist)
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
      hotel_id: this.hotelId,
      operation: 'push',
      entity_type: 'reservation',
      direction: 'outbound',
      status: result.success ? 'success' : 'failed',
      started_at: result.startedAt,
      completed_at: result.completedAt,
      duration_ms: result.completedAt.getTime() - result.startedAt.getTime(),
      error_message: result.errors.length > 0 ? result.errors.slice(0, 5).join('; ') : null,
      metadata: JSON.stringify({
        sync_type: result.syncType,
        records_processed: result.processedCount,
        records_created: result.createdCount,
        records_updated: result.updatedCount,
        records_skipped: result.skippedCount,
        records_failed: result.failedCount,
      }),
    });
  }
}
