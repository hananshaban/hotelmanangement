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
        beds24RoomId = room.beds24_room_id || null;
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

        // Get beds24_room_id from room_type
        beds24RoomId = roomType.beds24_room_id || null;

        // Note: If room_type doesn't have beds24_room_id, we cannot sync
        // Room types must have beds24_room_id configured for Beds24 sync to work

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
          error: `${entityType === 'room' ? 'Room' : 'Room type'} not mapped to Beds24. Please configure beds24_room_id.`,
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
        config.beds24_property_id,
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
        const createOptions: { method: 'POST'; body: any; idempotencyKey?: string } = {
          method: 'POST',
          body: apiBooking,
        };
        if (options.idempotencyKey) {
          createOptions.idempotencyKey = options.idempotencyKey;
        }
        const created = await this.client.makeRequest<Beds24Booking>('/bookings', createOptions);
        beds24BookingId = created.id!;

        // Update reservation with Beds24 booking ID
        await db('reservations')
          .where({ id: reservationId })
          .update({
            beds24_booking_id: beds24BookingId.toString(),
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
   * Load reservation with all necessary data
   */
  private async loadReservationData(reservationId: string) {
    return db('reservations')
      .where({ id: reservationId })
      .whereNull('deleted_at')
      .first();
  }

  /**
   * Load Beds24 configuration
   */
  private async loadBeds24Config() {
    const propertyId = '00000000-0000-0000-0000-000000000001'; // Default property
    const config = await db('beds24_config')
      .where({ property_id: propertyId })
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

