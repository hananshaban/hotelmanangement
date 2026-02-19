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
import { QloAppsRoomTypeSyncService } from './room_type_sync_service.js';
import { QloAppsRoomSyncService } from './room_sync_service.js';
import { QloAppsCustomerSyncService } from './customer_sync_service.js';
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
  /** Start date for date range filtering (ISO string or Date) */
  dateFrom?: string | Date | undefined;
  /** End date for date range filtering (ISO string or Date) */
  dateTo?: string | Date | undefined;
}

/**
 * Result of a full 4-phase sync
 */
export interface FullSyncResult {
  success: boolean;
  roomTypes: {
    processed: number;
    synced: number;
    failed: number;
  };
  rooms: {
    processed: number;
    synced: number;
    failed: number;
  };
  customers: {
    processed: number;
    synced: number;
    failed: number;
  };
  reservations: {
    processed: number;
    created: number;
    updated: number;
    failed: number;
  };
  durationMs: number;
  error?: string;
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
  private hotelId: string;
  private qloAppsHotelId: number;
  private guestMatchingService: QloAppsGuestMatchingService;
  private roomTypeSyncService: QloAppsRoomTypeSyncService;
  private roomSyncService: QloAppsRoomSyncService;
  private customerSyncService: QloAppsCustomerSyncService;

  constructor(client: QloAppsClient, configId: string, hotelId: string, qloAppsHotelId: number) {
    this.client = client;
    this.configId = configId;
    this.hotelId = hotelId;
    this.qloAppsHotelId = qloAppsHotelId;
    this.guestMatchingService = new QloAppsGuestMatchingService();
    this.roomTypeSyncService = new QloAppsRoomTypeSyncService(client, configId, hotelId, qloAppsHotelId);
    this.roomSyncService = new QloAppsRoomSyncService(client, configId, hotelId, qloAppsHotelId);
    this.customerSyncService = new QloAppsCustomerSyncService(client, configId, hotelId, qloAppsHotelId);
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
    const hotelId = parseInt(config.qloapps_hotel_id, 10);
    const client = new QloAppsClient({
      baseUrl: config.base_url,
      apiKey,
      hotelId,
    });

    return new QloAppsPullSyncService(client, configId, config.hotel_id, hotelId);
  }

  /**
   * Pull bookings from QloApps
   * Bookings are automatically normalized from PrestaShop associations structure
   */
  async pullBookings(options: PullSyncOptions = {}): Promise<QloAppsBooking[]> {
    const params: Record<string, any> = {};

    // Add date filters - use dateFrom/dateTo for broader ranges, modifiedSince as fallback
    if (options.dateFrom) {
      params.dateFrom = options.dateFrom;
    }
    if (options.dateTo) {
      params.dateTo = options.dateTo;
    }
    if (options.modifiedSince && !options.dateFrom && !options.dateTo) {
      // Only use modifiedSince if no explicit date range is set
      params.modifiedSince = options.modifiedSince.toISOString();
    }

    if (options.bookingStatus) {
      params.bookingStatus = options.bookingStatus;
    }

    if (options.limit) {
      params.limit = options.limit;
    }

    console.log(`[QloApps Pull] Fetching bookings with params:`, params);
    if (params.dateFrom || params.dateTo) {
      console.log(`[QloApps Pull] 📅 Date Range: ${params.dateFrom || 'All'} to ${params.dateTo || 'All'}`);
    }
    if (params.modifiedSince) {
      console.log(`[QloApps Pull] ⏰ Modified Since: ${params.modifiedSince}`);
    }

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
   * Run full 3-phase sync: Room Types -> Customers -> Reservations
   * This ensures all dependencies exist before syncing reservations
   */
  async pullFullSync(options: PullSyncOptions = {}): Promise<FullSyncResult> {
    const startTime = Date.now();
    console.log('[QloApps Pull] ========================================');
    console.log('[QloApps Pull] Starting 4-phase full sync...');

    // Set broader date range for full sync: from last month to coming year
    const now = new Date();
    const lastMonth = new Date(now);
    lastMonth.setMonth(now.getMonth() - 1);
    const comingYear = new Date(now);
    comingYear.setFullYear(now.getFullYear() + 1);

    // Override or set date filters for broader sync range
    if (!options.dateFrom) {
      options.dateFrom = lastMonth.toISOString().split('T')[0];
    }
    if (!options.dateTo) {
      options.dateTo = comingYear.toISOString().split('T')[0];
    }

    console.log('[QloApps Pull] 📅 Full Sync Date Range:');
    console.log(`[QloApps Pull]   From: ${options.dateFrom} (last month)`);
    console.log(`[QloApps Pull]   To: ${options.dateTo} (coming year)`);
    console.log('[QloApps Pull] ========================================');

    try {
      // Phase 1: Room Types
      console.log('[QloApps Pull] 📋 PHASE 1: Syncing Room Types...');
      const roomTypeResults = await this.roomTypeSyncService.pullRoomTypes();
      const roomTypesProcessed = roomTypeResults.length;
      const roomTypesSynced = roomTypeResults.filter(r => r.success && (r.action === 'created' || r.action === 'mapped')).length;
      const roomTypesFailed = roomTypeResults.filter(r => !r.success).length;
      
      console.log('[QloApps Pull] ✓ Room Types Phase Complete:');
      console.log(`[QloApps Pull]   Processed: ${roomTypesProcessed}`);
      console.log(`[QloApps Pull]   Synced: ${roomTypesSynced}`);
      console.log(`[QloApps Pull]   Failed: ${roomTypesFailed}`);

      // Phase 2: Individual Rooms
      console.log('[QloApps Pull] 🚪 PHASE 2: Syncing Individual Rooms...');
      const roomResults = await this.roomSyncService.pullRooms({
        createIfMissing: true,
        updateExisting: false,
      });
      const roomsProcessed = roomResults.length;
      const roomsSynced = roomResults.filter(r => r.success && (r.action === 'created' || r.action === 'mapped')).length;
      const roomsFailed = roomResults.filter(r => !r.success).length;
      
      console.log('[QloApps Pull] ✓ Rooms Phase Complete:');
      console.log(`[QloApps Pull]   Processed: ${roomsProcessed}`);
      console.log(`[QloApps Pull]   Synced: ${roomsSynced}`);
      console.log(`[QloApps Pull]   Failed: ${roomsFailed}`);

      // Phase 3: Customers
      console.log('[QloApps Pull] 👥 PHASE 3: Syncing Customers...');
      const customerResults = await this.customerSyncService.pullCustomers({
        updateExisting: false,
      });
      const customersProcessed = customerResults.length;
      const customersSynced = customerResults.filter(r => r.success && (r.action === 'created' || r.action === 'matched')).length;
      const customersFailed = customerResults.filter(r => !r.success).length;
      
      console.log('[QloApps Pull] ✓ Customers Phase Complete:');
      console.log(`[QloApps Pull]   Processed: ${customersProcessed}`);
      console.log(`[QloApps Pull]   Synced: ${customersSynced}`);
      console.log(`[QloApps Pull]   Failed: ${customersFailed}`);

      // Phase 4: Reservations/Bookings
      console.log('[QloApps Pull] 📅 PHASE 4: Syncing Reservations...');
      const bookings = await this.pullBookings(options);
      const bookingResults = await this.syncBookingsToPms(bookings);
      
      const reservationsProcessed = bookingResults.length;
      const reservationsCreated = bookingResults.filter(r => r.action === 'created').length;
      const reservationsUpdated = bookingResults.filter(r => r.action === 'updated').length;
      const reservationsFailed = bookingResults.filter(r => !r.success).length;
      
      console.log('[QloApps Pull] ✓ Reservations Phase Complete:');
      console.log(`[QloApps Pull]   Processed: ${reservationsProcessed}`);
      console.log(`[QloApps Pull]   Created: ${reservationsCreated}`);
      console.log(`[QloApps Pull]   Updated: ${reservationsUpdated}`);
      console.log(`[QloApps Pull]   Failed: ${reservationsFailed}`);

      const durationMs = Date.now() - startTime;
      const success = roomTypesFailed === 0 && roomsFailed === 0 && customersFailed === 0 && reservationsFailed === 0;

      console.log('[QloApps Pull] ========================================');
      console.log(`[QloApps Pull] 4-Phase Sync ${success ? 'COMPLETED' : 'COMPLETED WITH ERRORS'}`);
      console.log(`[QloApps Pull] Duration: ${(durationMs / 1000).toFixed(2)}s`);
      console.log('[QloApps Pull] ========================================');

      return {
        success,
        roomTypes: {
          processed: roomTypesProcessed,
          synced: roomTypesSynced,
          failed: roomTypesFailed,
        },
        rooms: {
          processed: roomsProcessed,
          synced: roomsSynced,
          failed: roomsFailed,
        },
        customers: {
          processed: customersProcessed,
          synced: customersSynced,
          failed: customersFailed,
        },
        reservations: {
          processed: reservationsProcessed,
          created: reservationsCreated,
          updated: reservationsUpdated,
          failed: reservationsFailed,
        },
        durationMs,
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      console.error('[QloApps Pull] ❌ 4-Phase Sync Failed:', errorMessage);
      console.log('[QloApps Pull] ========================================');

      return {
        success: false,
        roomTypes: { processed: 0, synced: 0, failed: 0 },
        rooms: { processed: 0, synced: 0, failed: 0 },
        customers: { processed: 0, synced: 0, failed: 0 },
        reservations: { processed: 0, created: 0, updated: 0, failed: 0 },
        durationMs,
        error: errorMessage,
      };
    }
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
        hotel_id: this.hotelId,
        qloapps_order_id: booking.id.toString(),
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
        hotel_id: this.hotelId,
        qloapps_product_id: firstRoomType.id_room_type.toString(),
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

    // Try to find existing customer mapping first
    let guestId: string | undefined;
    let matchSource: string = 'unknown';

    // Check if we have a customer mapping for this booking's customer
    if (booking.id_customer > 0) {
      const customerMapping = await db('qloapps_customer_mappings')
        .where({
          hotel_id: this.hotelId,
          qloapps_customer_id: booking.id_customer.toString(),
          is_active: true,
        })
        .first();

      if (customerMapping) {
        guestId = customerMapping.local_guest_id;
        matchSource = 'customer_mapping';
        console.log(`[QloApps Pull] Booking ${booking.id}: Found mapped customer ${booking.id_customer} -> Guest ${guestId}`);
      }
    }

    // If no customer mapping found, create guest from booking data
    if (!guestId) {
      // Handle missing names in booking data by creating a guest name from email or other available info
      const customerDetail = { ...booking.customer_detail };

      // If no first/last name, create a name from email prefix or use "Booking Guest"
      if (!customerDetail.firstname && !customerDetail.lastname) {
        if (customerDetail.email) {
          // Use email prefix as first name
          const emailPrefix = customerDetail.email.split('@')[0];
          customerDetail.firstname = emailPrefix || 'Guest';
          customerDetail.lastname = 'Guest';
        } else {
          // Fallback for cases with no email
          customerDetail.firstname = 'Booking';
          customerDetail.lastname = 'Guest';
        }
      }

      const guestResult = await this.guestMatchingService.findOrCreateGuestFromBooking(
        customerDetail
      );

      guestId = guestResult.guestId;
      matchSource = guestResult.matchSource || 'new';
      console.log(`[QloApps Pull] Booking ${booking.id}: Created guest ${guestId} (${matchSource})`);

      // Create customer mapping for future bookings from this customer
      if (booking.id_customer > 0) {
        try {
          await this.customerSyncService.createMapping(
            booking.id_customer,
            guestId,
            'new' // matchType: 'new' will be converted to 'booking' in the service
          );
          console.log(`[QloApps Pull] Booking ${booking.id}: Created customer mapping ${booking.id_customer} -> ${guestId}`);
        } catch (mappingError) {
          // Log but don't fail the booking sync if mapping creation fails
          console.warn(`[QloApps Pull] Booking ${booking.id}: Failed to create customer mapping:`, mappingError);
        }
      }
    }

    // Map booking to PMS reservation format
    const reservationData = mapQloAppsBookingToPms(
      booking,
      roomTypeMapping.local_room_type_id,
      guestId
    );

    if (existingMapping) {
      // Update existing reservation
      return await this.updateExistingReservation(
        booking,
        existingMapping.local_reservation_id,
        reservationData
      );
    } else {
      // Create new reservation
      return await this.createNewReservation(
        booking,
        reservationData,
        guestId
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
        hotel_id: this.hotelId,
      })
      .returning(['id']);

    // Create primary guest link
    await db('reservation_guests').insert({
      reservation_id: reservation.id,
      guest_id: guestId,
      guest_type: 'Primary',
      hotel_id: this.hotelId,
    });

    // Create mapping record
    await db('qloapps_reservation_mappings').insert({
      hotel_id: this.hotelId,
      local_reservation_id: reservation.id,
      qloapps_order_id: booking.id.toString(),
      qloapps_hotel_id: this.hotelId.toString(),
      source: 'qloapps',
      last_synced_at: new Date(),
      last_sync_status: 'success',
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

    // Timestamp-based conflict resolution: Only update if QloApps data is newer
    const qloAppsUpdatedAt = new Date(booking.date_upd || booking.date_add || 0);
    const pmsUpdatedAt = new Date(existing.updated_at || existing.created_at || 0);

    if (pmsUpdatedAt > qloAppsUpdatedAt) {
      console.log(
        `[QloApps Pull] Skipping update for reservation ${reservationId}: ` +
        `PMS data (${pmsUpdatedAt.toISOString()}) is newer than QloApps data (${qloAppsUpdatedAt.toISOString()})`
      );
      return {
        success: false,
        qloAppsBookingId: booking.id,
        pmsReservationId: reservationId,
        action: 'skipped',
        error: 'PMS data is newer (conflict resolution)',
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
        hotel_id: this.hotelId,
        qloapps_order_id: booking.id.toString(),
      })
      .update({
        last_synced_at: new Date(),
        last_sync_status: 'success',
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
            hotel_id: this.hotelId,
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
        hotel_id: this.hotelId,
        entity_type: entityType,
      })
      .first();

    const now = new Date();
    const updates = {
      last_successful_sync: success ? now : undefined,
      last_sync_success: success,
      last_sync_error: success ? null : errorMessage,
      updated_at: now,
    };

    if (existing) {
      await db('qloapps_sync_state')
        .where({ id: existing.id })
        .update(updates);
    } else {
      await db('qloapps_sync_state').insert({
        hotel_id: this.hotelId,
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
      hotel_id: this.hotelId,
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
