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
} from '../mappers/reservation_mapper.js';
import db from '../../../config/database.js';
import { decrypt } from '../../../utils/encryption.js';

/**
 * Service for pushing reservations to Beds24
 */
export class ReservationPushService {
  private client: Beds24Client;

  constructor(refreshToken: string) {
    this.client = new Beds24Client(refreshToken);
  }

  /**
   * Push a new reservation to Beds24
   */
  async pushReservation(
    reservationId: string,
    options: SyncOptions = {}
  ): Promise<SyncResult> {
    try {
      // Load reservation with related data
      const reservation = await this.loadReservationData(reservationId);
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

      // Get room's Beds24 room ID
      const room = await db('rooms').where({ id: reservation.room_id }).first();
      if (!room?.beds24_room_id) {
        return {
          success: false,
          syncType: 'PUSH',
          entityType: 'reservation',
          entityId: reservationId,
          error: 'Room not mapped to Beds24',
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
        room.beds24_room_id,
        {
          name: guest.name,
          email: guest.email || undefined,
          phone: guest.phone || undefined,
        }
      );

      // Create or update booking in Beds24
      let beds24BookingId: number;
      if (reservation.beds24_booking_id) {
        // Update existing booking
        const updateRequest = beds24Booking as Beds24BookingUpdateRequest;
        const updated = await this.client.makeRequest<Beds24Booking>(
          `/bookings/${updateRequest.id}`,
          {
            method: 'PUT',
            body: updateRequest,
            idempotencyKey: options.idempotencyKey,
          }
        );
        beds24BookingId = updated.id!;
      } else {
        // Create new booking
        const createRequest = beds24Booking as Beds24BookingCreateRequest;
        const created = await this.client.makeRequest<Beds24Booking>('/bookings', {
          method: 'POST',
          body: createRequest,
          idempotencyKey: options.idempotencyKey,
        });
        beds24BookingId = created.id!;

        // Update reservation with Beds24 booking ID
        await db('reservations')
          .where({ id: reservationId })
          .update({
            beds24_booking_id: beds24BookingId.toString(),
            updated_at: new Date(),
          });
      }

      return {
        success: true,
        syncType: 'PUSH',
        entityType: 'reservation',
        entityId: reservationId,
        beds24Id: beds24BookingId.toString(),
        syncedAt: new Date(),
      };
    } catch (error) {
      return {
        success: false,
        syncType: 'PUSH',
        entityType: 'reservation',
        entityId: reservationId,
        error: error instanceof Error ? error.message : 'Unknown error',
        errorCode: error instanceof Error ? error.constructor.name : undefined,
        syncedAt: new Date(),
      };
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
      await this.client.makeRequest<Beds24Booking>(
        `/bookings/${reservation.beds24_booking_id}`,
        {
          method: 'PUT',
          body: {
            id: parseInt(reservation.beds24_booking_id, 10),
            status: 'cancelled',
          },
          idempotencyKey: options.idempotencyKey,
        }
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
      return {
        success: false,
        syncType: 'PUSH',
        entityType: 'reservation',
        entityId: reservationId,
        error: error instanceof Error ? error.message : 'Unknown error',
        errorCode: error instanceof Error ? error.constructor.name : undefined,
        syncedAt: new Date(),
      };
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

