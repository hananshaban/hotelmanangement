import { Beds24Client } from '../beds24_client.js';
import type {
  Beds24Booking,
  Beds24BookingCreateRequest,
  Beds24BookingUpdateRequest,
} from '../beds24_types.js';
import type { SyncResult, SyncOptions } from '../beds24_sync_types.js';
import {
  mapPmsReservationToBeds24,
  mapBeds24StatusToPms,
  convertBookingToBeds24ApiFormat,
} from '../mappers/reservation_mapper.js';
import db from '../../../config/database.js';
import { decrypt } from '../../../utils/encryption.js';

/**
 * Service for pushing reservations to Beds24
 */
export class ReservationPushService {
  private client: Beds24Client;

  constructor(clientOrRefreshToken: Beds24Client | string) {
    if (clientOrRefreshToken instanceof Beds24Client) {
      this.client = clientOrRefreshToken;
    } else {
      this.client = new Beds24Client(clientOrRefreshToken);
    }
  }

  /**
   * Push a new reservation to Beds24
   */
  async pushReservation(
    reservationId: string,
    options: SyncOptions = {}
  ): Promise<SyncResult> {
    let reservation: any = null;
    try {
      // Load reservation with related data
      reservation = await this.loadReservationData(reservationId);
      if (!reservation) {
        return {
          success: false,
          syncType: 'PUSH',
          entityType: 'reservation',
          entityId: reservationId,
          error: 'Reservation not found',
          syncedAt: new Date(),
        };
      }

      // Skip if source is Beds24 (already synced)
      if (reservation.source === 'Beds24') {
        return {
          success: true,
          syncType: 'PUSH',
          entityType: 'reservation',
          entityId: reservationId,
          beds24Id: reservation.beds24_booking_id || undefined,
          error: 'Skipped: Reservation from Beds24',
          syncedAt: new Date(),
        };
      }

      // Load Beds24 config
      const config = await this.loadBeds24Config();
      if (!config) {
        return {
          success: false,
          syncType: 'PUSH',
          entityType: 'reservation',
          entityId: reservationId,
          error: 'Beds24 configuration not found',
          syncedAt: new Date(),
        };
      }

      // Check if push sync is enabled
      if (!config.push_sync_enabled) {
        return {
          success: false,
          syncType: 'PUSH',
          entityType: 'reservation',
          entityId: reservationId,
          error: 'Push sync is disabled',
          syncedAt: new Date(),
        };
      }

      // Get Beds24 room ID - support both room_id (legacy) and room_type_id (new)
      let beds24RoomId: string | null = null;
      let entityType: 'room' | 'room_type' = 'room';

      if (reservation.room_id) {
        // Legacy: Individual room based reservation
        const room = await db('rooms').where({ id: reservation.room_id }).first();
        if (!room) {
          return {
            success: false,
            syncType: 'PUSH',
            entityType: 'reservation',
            entityId: reservationId,
            error: 'Room not found',
            syncedAt: new Date(),
          };
        }
        beds24RoomId = room.cm_room_id || null;
        entityType = 'room';
      } else if (reservation.room_type_id) {
        // New: Room type based reservation
        const roomType = await db('room_types')
          .where({ id: reservation.room_type_id })
          .whereNull('deleted_at')
          .first();

        if (!roomType) {
          return {
            success: false,
            syncType: 'PUSH',
            entityType: 'reservation',
            entityId: reservationId,
            error: 'Room type not found',
            syncedAt: new Date(),
          };
        }

        // Get cm_room_id from room_type (channel manager room ID)
        beds24RoomId = roomType.cm_room_id || null;

        // Note: If room_type doesn't have cm_room_id, we cannot sync
        // Room types must have cm_room_id configured for Beds24 sync to work

        entityType = 'room_type';
      } else {
        return {
          success: false,
          syncType: 'PUSH',
          entityType: 'reservation',
          entityId: reservationId,
          error: 'Reservation must have either room_id or room_type_id',
          syncedAt: new Date(),
        };
      }

      // Validate that we have a Beds24 room ID
      if (!beds24RoomId) {
        return {
          success: false,
          syncType: 'PUSH',
          entityType: 'reservation',
          entityId: reservationId,
          error: `${entityType === 'room' ? 'Room' : 'Room type'} not mapped to Beds24. Please configure cm_room_id.`,
          syncedAt: new Date(),
        };
      }

      // Get guest information
      const guest = await db('guests').where({ id: reservation.primary_guest_id }).first();
      if (!guest) {
        return {
          success: false,
          syncType: 'PUSH',
          entityType: 'reservation',
          entityId: reservationId,
          error: 'Guest not found',
          syncedAt: new Date(),
        };
      }

      // Map to Beds24 format
      const beds24Booking = mapPmsReservationToBeds24(
        reservation,
        config.beds24_hotel_id,
        beds24RoomId,
        {
          name: guest.name,
          email: guest.email || undefined,
          phone: guest.phone || undefined,
        },
        reservation.units_requested // Pass units_requested for room type reservations
      );

      // Convert to Beds24 API format (arrivalDate → arrival, departureDate → departure)
      const apiBooking = convertBookingToBeds24ApiFormat(beds24Booking);

      // Add roomQty if units_requested is present (for room type reservations)
      if (reservation.units_requested && reservation.units_requested > 1) {
        apiBooking.roomQty = reservation.units_requested;
      }

      // Extract unitId from assigned_unit_id if present (for room type reservations)
      // Format: ${roomTypeId}-unit-${unitIndex} where unitIndex is 0-based
      // Convert to Beds24's 1-based unitId
      if (reservation.assigned_unit_id && reservation.room_type_id) {
        const match = reservation.assigned_unit_id.match(/^(.+)-unit-(\d+)$/);
        if (match && match[1] === reservation.room_type_id) {
          const unitIndex = parseInt(match[2], 10);
          // Convert 0-based (PMS) to 1-based (Beds24)
          // unitIndex: 0 -> unitId: 1, unitIndex: 1 -> unitId: 2, etc.
          const unitId = unitIndex + 1;
          if (unitId >= 1) {
            apiBooking.unitId = unitId;
          }
        }
      }

      // Create or update booking in Beds24
      let beds24BookingId: number;
      if (reservation.beds24_booking_id) {
        // Update existing booking
        const updateOptions: { method: 'PUT'; body: any; idempotencyKey?: string } = {
          method: 'PUT',
          body: apiBooking,
        };
        if (options.idempotencyKey) {
          updateOptions.idempotencyKey = options.idempotencyKey;
        }
        const updated = await this.client.makeRequest<Beds24Booking>(
          `/bookings/${apiBooking.id}`,
          updateOptions
        );
        beds24BookingId = updated.id!;
      } else {
        // Create new booking
        // Beds24 API expects request body to be an array for POST requests
        const createOptions: { method: 'POST'; body: any; idempotencyKey?: string } = {
          method: 'POST',
          body: [apiBooking], // Wrap in array as Beds24 API requires
        };
        if (options.idempotencyKey) {
          createOptions.idempotencyKey = options.idempotencyKey;
        }

        const created = await this.client.makeRequest<any>('/bookings', createOptions);

        // DEBUG: Log the raw response from Beds24Client
        console.log('[ReservationPushService] Raw Beds24 response:', {
          reservationId,
          responseType: typeof created,
          isArray: Array.isArray(created),
          hasNew: created && typeof created === 'object' && 'new' in created,
          hasData: created && typeof created === 'object' && 'data' in created,
          hasId: created && typeof created === 'object' && 'id' in created,
          keys: created && typeof created === 'object' ? Object.keys(created) : [],
          responsePreview: JSON.stringify(created, null, 2).substring(0, 500),
        });

        // Handle different response formats from Beds24 API
        let bookingResult: any = null;

        // Case 1: Direct array response
        if (Array.isArray(created)) {
          if (created.length === 0) {
            throw new Error(
              `Beds24 API returned empty array for booking creation. ` +
              `This may indicate a validation error. Reservation ID: ${reservationId}`
            );
          }
          const firstElement = created[0];
          // If array element has Beds24 new booking format, extract from it
          if (firstElement && typeof firstElement === 'object' && firstElement.new && 
              typeof firstElement.new === 'object' && firstElement.new.id !== undefined && 
              firstElement.new.id !== null) {
            console.log('[ReservationPushService] Matched Case 1: Array with new booking format', {
              reservationId,
              newBookingId: firstElement.new.id,
            });
            bookingResult = firstElement.new;
          }
          // If array element has info array, try that
          else if (firstElement && typeof firstElement === 'object' && 
                   Array.isArray(firstElement.info) && firstElement.info.length > 0 && 
                   firstElement.info[0] && typeof firstElement.info[0] === 'object' &&
                   firstElement.info[0].id !== undefined && firstElement.info[0].id !== null) {
            console.log('[ReservationPushService] Matched Case 1: Array with info format', {
              reservationId,
              infoBookingId: firstElement.info[0].id,
            });
            bookingResult = firstElement.info[0];
          }
          // Otherwise, use the first element as-is
          else {
            bookingResult = firstElement;
          }
        }
        // Case 2: Wrapped response { data: [...] }
        else if (created && typeof created === 'object' && Array.isArray(created.data)) {
          if (created.data.length === 0) {
            throw new Error(
              `Beds24 API returned empty data array for booking creation. ` +
              `This may indicate a validation error. Reservation ID: ${reservationId}`
            );
          }
          bookingResult = created.data[0];
        }
        // Case 3: Beds24 new booking response { success: true, new: { id: ... } }
        // Check this FIRST for Beds24-specific format before generic cases
        else if (created && typeof created === 'object' && !Array.isArray(created) && 
                 created.new && 
                 typeof created.new === 'object' && 
                 created.new.id !== undefined && 
                 created.new.id !== null) {
          console.log('[ReservationPushService] Matched Case 3: Beds24 new booking format', {
            reservationId,
            newBookingId: created.new.id,
            newObjectKeys: Object.keys(created.new),
          });
          bookingResult = created.new;
        }
        // Case 4: Fallback to info array if new is not available { info: [{ id: ... }] }
        else if (created && typeof created === 'object' && !Array.isArray(created) &&
                 Array.isArray(created.info) && 
                 created.info.length > 0 && 
                 created.info[0] && 
                 typeof created.info[0] === 'object' &&
                 created.info[0].id !== undefined && 
                 created.info[0].id !== null) {
          console.log('[ReservationPushService] Matched Case 4: Beds24 info array format', {
            reservationId,
            infoBookingId: created.info[0].id,
          });
          bookingResult = created.info[0];
        }
        // Case 5: Wrapped single object { data: {...} }
        else if (created && typeof created === 'object' && created.data && created.data.id !== undefined) {
          bookingResult = created.data;
        }
        // Case 6: Single object response (generic fallback - only if NOT Beds24 wrapper)
        else if (created && typeof created === 'object' && !Array.isArray(created) && 
                 created.id !== undefined && 
                 created.id !== null &&
                 !('success' in created) && 
                 !('new' in created) && 
                 !('info' in created)) {
          bookingResult = created;
        }
        // Unknown format
        else {
          console.error('[ReservationPushService] Unexpected Beds24 response format:', {
            reservationId,
            responseType: typeof created,
            isArray: Array.isArray(created),
            response: JSON.stringify(created, null, 2).substring(0, 1000),
          });
          throw new Error(
            `Unexpected response format from Beds24 API. ` +
            `Expected array or object with id, got: ${typeof created}. ` +
            `Reservation ID: ${reservationId}`
          );
        }

        // DEBUG: Log what bookingResult is after parsing
        console.log('[ReservationPushService] After parsing, bookingResult:', {
          reservationId,
          bookingResultType: typeof bookingResult,
          bookingResultIsNull: bookingResult === null,
          hasId: bookingResult && 'id' in bookingResult,
          idValue: bookingResult?.id,
          bookingResultPreview: bookingResult ? JSON.stringify(bookingResult, null, 2).substring(0, 500) : 'null',
        });

        // Validate that booking result has an id
        if (!bookingResult || bookingResult.id === undefined || bookingResult.id === null) {
          console.error('[ReservationPushService] Beds24 booking response missing id:', {
            reservationId,
            bookingResult: JSON.stringify(bookingResult, null, 2).substring(0, 1000),
            createdResponse: JSON.stringify(created, null, 2).substring(0, 1000),
          });
          throw new Error(
            `Beds24 API response missing booking id. ` +
            `This may indicate the booking was not created successfully. ` +
            `Reservation ID: ${reservationId}`
          );
        }

        // Extract booking ID (handle both number and string)
        beds24BookingId = typeof bookingResult.id === 'number' 
          ? bookingResult.id 
          : parseInt(String(bookingResult.id), 10);

        if (isNaN(beds24BookingId)) {
          throw new Error(
            `Invalid booking id format from Beds24: ${bookingResult.id}. ` +
            `Reservation ID: ${reservationId}`
          );
        }

        // Update reservation with Beds24 booking ID
        await db('reservations')
          .where({ id: reservationId })
          .update({
            beds24_booking_id: beds24BookingId.toString(), // Now safe - beds24BookingId is guaranteed to be a number
            updated_at: new Date(),
          });
      }

      // Log successful sync
      console.log(
        `[ReservationPushService] Successfully synced reservation ${reservationId} to Beds24 booking ${beds24BookingId}`
      );

      return {
        success: true,
        syncType: 'PUSH',
        entityType: 'reservation',
        entityId: reservationId,
        beds24Id: beds24BookingId.toString(),
        syncedAt: new Date(),
      };
    } catch (error) {
      // Enhanced error logging with context
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      
      console.error(
        `[ReservationPushService] Failed to push reservation ${reservationId} to Beds24:`,
        {
          reservationId,
          roomId: reservation?.room_id || null,
          roomTypeId: reservation?.room_type_id || null,
          error: errorMessage,
          errorCode: error instanceof Error ? error.constructor.name : undefined,
          stack: errorStack,
        }
      );

      const result: SyncResult = {
        success: false,
        syncType: 'PUSH',
        entityType: 'reservation',
        entityId: reservationId,
        error: errorMessage,
        syncedAt: new Date(),
      };
      if (error instanceof Error) {
        result.errorCode = error.constructor.name;
      }
      return result;
    }
  }

  /**
   * Update an existing reservation in Beds24
   */
  async updateReservation(
    reservationId: string,
    options: SyncOptions = {}
  ): Promise<SyncResult> {
    // Same as pushReservation (it handles both create and update)
    return this.pushReservation(reservationId, options);
  }

  /**
   * Cancel a reservation in Beds24
   */
  async cancelReservation(
    reservationId: string,
    options: SyncOptions = {}
  ): Promise<SyncResult> {
    try {
      const reservation = await this.loadReservationData(reservationId);
      if (!reservation?.beds24_booking_id) {
        return {
          success: false,
          syncType: 'PUSH',
          entityType: 'reservation',
          entityId: reservationId,
          error: 'Reservation not synced to Beds24',
          syncedAt: new Date(),
        };
      }

      const config = await this.loadBeds24Config();
      if (!config?.push_sync_enabled) {
        return {
          success: false,
          syncType: 'PUSH',
          entityType: 'reservation',
          entityId: reservationId,
          error: 'Push sync is disabled',
          syncedAt: new Date(),
        };
      }

      // Update booking status to cancelled in Beds24
      const cancelOptions: { method: 'PUT'; body: { id: number; status: string }; idempotencyKey?: string } = {
        method: 'PUT',
        body: {
          id: parseInt(reservation.beds24_booking_id, 10),
          status: 'cancelled',
        },
      };
      if (options.idempotencyKey) {
        cancelOptions.idempotencyKey = options.idempotencyKey;
      }
      await this.client.makeRequest<Beds24Booking>(
        `/bookings/${reservation.beds24_booking_id}`,
        cancelOptions
      );

      return {
        success: true,
        syncType: 'PUSH',
        entityType: 'reservation',
        entityId: reservationId,
        beds24Id: reservation.beds24_booking_id,
        syncedAt: new Date(),
      };
    } catch (error) {
      const result: SyncResult = {
        success: false,
        syncType: 'PUSH',
        entityType: 'reservation',
        entityId: reservationId,
        error: error instanceof Error ? error.message : 'Unknown error',
        syncedAt: new Date(),
      };
      if (error instanceof Error) {
        result.errorCode = error.constructor.name;
      }
      return result;
    }
  }

  /**
   * Load reservation with all necessary data.
   * 
   * Note: With the pg-types DATE parser override in database.ts,
   * PostgreSQL DATE columns now return strings directly (e.g., "2025-12-31")
   * instead of Date objects, so no timezone conversion is needed here.
   */
  private async loadReservationData(reservationId: string) {
    const reservation = await db('reservations')
      .where({ id: reservationId })
      .whereNull('deleted_at')
      .first();
    
    return reservation || null;
  }

  /**
   * Load Beds24 configuration
   */
  private async loadBeds24Config() {
    const hotelId = '00000000-0000-0000-0000-000000000001'; // Default property
    const config = await db('beds24_config')
      .where({ hotel_id: hotelId })
      .first();

    if (!config) {
      return null;
    }

    // Decrypt refresh token
    const refreshToken = decrypt(config.refresh_token);
    this.client.setRefreshToken(refreshToken);

    return {
      ...config,
      refresh_token: refreshToken, // Decrypted
    };
  }
}

