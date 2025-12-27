import { Beds24Client } from '../beds24_client.js';
import type { Beds24Booking } from '../beds24_types.js';
import type { SyncResult, BatchSyncResult } from '../beds24_sync_types.js';
import { mapBeds24BookingToPms } from '../mappers/reservation_mapper.js';
import { GuestMatchingService } from './guest_matching_service.js';
import { normalizeBooking as normalizeBookingData } from '../utils/booking_normalizer.js';
import db from '../../../config/database.js';
import { decrypt } from '../../../utils/encryption.js';

/**
 * Service for pulling bookings from Beds24 and syncing to PMS
 */
export class PullSyncService {
  private client: Beds24Client;

  constructor(refreshToken: string) {
    this.client = new Beds24Client(refreshToken);
  }

  /**
   * Pull bookings from Beds24
   * @param beds24PropertyId - Beds24 property ID
   * @param lastModified - Optional: only get bookings modified after this date (for incremental sync)
   * @param dateRange - Optional: date range for initial sync (all bookings if not provided)
   */
  async pullBookings(
    beds24PropertyId: string,
    lastModified?: Date,
    dateRange?: { from?: Date; to?: Date }
  ): Promise<Beds24Booking[]> {
    const query: Record<string, any> = {
      propertyId: [parseInt(beds24PropertyId, 10)],
      includeGuests: true,
    };

    // Add modifiedFrom filter for incremental sync
    if (lastModified) {
      query.modifiedFrom = lastModified.toISOString();
    }

    // Add date range for initial sync (if provided)
    if (dateRange?.from) {
      query.arrivalFrom = dateRange.from.toISOString().split('T')[0];
    }
    if (dateRange?.to) {
      query.arrivalTo = dateRange.to.toISOString().split('T')[0];
    }

    // For initial sync without date range, get bookings from a wide range
    if (!lastModified && !dateRange) {
      // Get bookings from last 2 years to future 2 years for initial sync
      const twoYearsAgo = new Date(Date.now() - 2 * 365 * 24 * 60 * 60 * 1000);
      const twoYearsFromNow = new Date(Date.now() + 2 * 365 * 24 * 60 * 60 * 1000);
      query.arrivalFrom = twoYearsAgo.toISOString().split('T')[0];
      query.arrivalTo = twoYearsFromNow.toISOString().split('T')[0];
    }

    const response = await this.client.makeRequest<Beds24Booking[]>('/bookings', {
      method: 'GET',
      query,
    });

    console.log(`Beds24 bookings API response type: ${typeof response}, isArray: ${Array.isArray(response)}`);

    // Handle both array and paginated response
    if (Array.isArray(response)) {
      console.log(`Received ${response.length} bookings as array`);
      if (response.length > 0) {
        console.log('Sample booking structure:', JSON.stringify(response[0], null, 2).substring(0, 500));
      }
      return response;
    }

    // If response has data property (paginated)
    if ((response as any).data && Array.isArray((response as any).data)) {
      console.log(`Received ${(response as any).data.length} bookings from paginated response`);
      if ((response as any).data.length > 0) {
        console.log('Sample booking structure:', JSON.stringify((response as any).data[0], null, 2).substring(0, 500));
      }
      return (response as any).data;
    }

    // Log unexpected response structure
    console.warn('Unexpected bookings response structure:', {
      type: typeof response,
      keys: response ? Object.keys(response) : 'null',
      sample: JSON.stringify(response).substring(0, 500),
    });

    return [];
  }

  /**
   * Normalize Beds24 booking object to ensure consistent field names
   * Handles different possible field name variations from the API
   */
  private normalizeBooking(booking: any): Beds24Booking | null {
    // Use shared normalization utility
    return normalizeBookingData(booking);
  }

  /**
   * Sync bookings from Beds24 to PMS
   */
  async syncBookingsToPms(bookings: Beds24Booking[]): Promise<SyncResult[]> {
    const results: SyncResult[] = [];
    const guestMatchingService = new GuestMatchingService();

    console.log(`Syncing ${bookings.length} bookings to PMS...`);
    
    for (const rawBooking of bookings) {
      try {
        // Normalize booking to handle different field name variations
        const booking = this.normalizeBooking(rawBooking);

        if (!booking) {
          console.error('Invalid booking object:', rawBooking);
          results.push({
            success: false,
            syncType: 'PULL',
            entityType: 'reservation',
            entityId: 'unknown',
            error: 'Invalid booking object',
            syncedAt: new Date(),
          });
          continue;
        }

        // Skip if booking doesn't have required fields
        if (!booking.id || !booking.roomId || !booking.arrivalDate || !booking.departureDate) {
          console.warn(`Skipping booking: Missing required fields`, {
            bookingId: booking.id,
            roomId: booking.roomId,
            arrivalDate: booking.arrivalDate,
            departureDate: booking.departureDate,
            rawBookingKeys: Object.keys(rawBooking),
            normalizedBookingKeys: Object.keys(booking),
            rawBookingSample: JSON.stringify(rawBooking).substring(0, 500),
          });
          results.push({
            success: false,
            syncType: 'PULL',
            entityType: 'reservation',
            entityId: booking.id?.toString() || 'unknown',
            error: `Missing required booking fields: id=${!!booking.id}, roomId=${!!booking.roomId}, arrivalDate=${!!booking.arrivalDate}, departureDate=${!!booking.departureDate}`,
            syncedAt: new Date(),
          });
          continue;
        }

        console.log(`Processing booking ${booking.id} for room ${booking.roomId}`);

        // Find or create guest - handle missing guest data gracefully
        let guestId: string;
        if (!booking.guest) {
          console.warn(`Booking ${booking.id} has no guest data. Using Unknown Guest.`);
          guestId = await guestMatchingService.getUnknownGuestId();
        } else {
          guestId = await guestMatchingService.findOrCreateGuest(
            booking.guest,
            booking.id
          );
        }
        console.log(`Guest ID: ${guestId}`);

        // Find room type by beds24_room_id (preferred) or fallback to individual room
        let roomTypeId: string | null = null;
        let roomId: string | null = null;

        // Try to find room type first (new Beds24-style)
        const roomType = await db('room_types')
          .where({ beds24_room_id: booking.roomId.toString() })
          .whereNull('deleted_at')
          .first();

        if (roomType) {
          roomTypeId = roomType.id;
          console.log(`Found room type: ${roomType.name} (PMS ID: ${roomType.id})`);
        } else {
          // Fallback to individual room (legacy)
          const room = await db('rooms')
            .where({ beds24_room_id: booking.roomId.toString() })
            .first();

          if (!room) {
            console.error(`Room type or room not found for Beds24 room ID: ${booking.roomId}`);
            results.push({
              success: false,
              syncType: 'PULL',
              entityType: 'reservation',
              entityId: booking.id.toString(),
              beds24Id: booking.id.toString(),
              error: `Room type or room not found for Beds24 room ID: ${booking.roomId}`,
              syncedAt: new Date(),
            });
            continue;
          }

          roomId = room.id;
          console.log(`Found room: ${room.room_number} (PMS ID: ${room.id})`);
        }

        // Map booking to PMS format
        const reservationData = mapBeds24BookingToPms(
          booking, 
          roomTypeId || roomId!, 
          guestId,
          roomTypeId ? 'room_type' : 'room'
        );

        // Ensure we have the right ID set
        if (roomTypeId) {
          reservationData.room_type_id = roomTypeId;
          reservationData.room_id = null;
        } else if (roomId) {
          reservationData.room_id = roomId;
          reservationData.room_type_id = null;
        }

        // Check if reservation already exists
        const existing = await db('reservations')
          .where({ beds24_booking_id: booking.id.toString() })
          .whereNull('deleted_at')
          .first();

        if (existing) {
          console.log(`Reservation ${existing.id} already exists, updating...`);
          // Update existing reservation
          await db('reservations')
            .where({ id: existing.id })
            .update({
              ...reservationData,
              updated_at: new Date(),
            });

          // Update primary guest if changed
          if (existing.primary_guest_id !== guestId) {
            await db('reservation_guests')
              .where({ reservation_id: existing.id, guest_type: 'Primary' })
              .update({ guest_id: guestId });
          }

          results.push({
            success: true,
            syncType: 'PULL',
            entityType: 'reservation',
            entityId: existing.id,
            beds24Id: booking.id.toString(),
            syncedAt: new Date(),
          });
          console.log(`Updated reservation ${existing.id}`);
        } else {
          console.log(`Creating new reservation for booking ${booking.id}...`);
          // Create new reservation
          const [reservation] = await db('reservations')
            .insert({
              ...reservationData,
              source: 'Beds24',
            })
            .returning('id');

          console.log(`Created reservation ${reservation.id}`);

          // Create primary guest link
          await db('reservation_guests').insert({
            reservation_id: reservation.id,
            guest_id: guestId,
            guest_type: 'Primary',
          });

          results.push({
            success: true,
            syncType: 'PULL',
            entityType: 'reservation',
            entityId: reservation.id,
            beds24Id: booking.id.toString(),
            syncedAt: new Date(),
          });
          console.log(`Successfully synced booking ${booking.id} -> reservation ${reservation.id}`);
        }
      } catch (error) {
        const bookingId = rawBooking.id?.toString() || 'unknown';
        const result: SyncResult = {
          success: false,
          syncType: 'PULL',
          entityType: 'reservation',
          entityId: bookingId,
          error: error instanceof Error ? error.message : 'Unknown error',
          syncedAt: new Date(),
        };
        if (bookingId !== 'unknown') {
          result.beds24Id = bookingId;
        }
        results.push(result);
      }
    }

    return results;
  }

  /**
   * Reconcile bookings between PMS and Beds24
   * Returns report of discrepancies
   */
  async reconcileBookings(
    beds24PropertyId: string
  ): Promise<{
    totalBeds24: number;
    totalPms: number;
    matched: number;
    missingInPms: number;
    missingInBeds24: number;
    discrepancies: Array<{
      reservationId: string;
      beds24BookingId: string;
      issue: string;
    }>;
  }> {
    // Pull all bookings from Beds24
    const beds24Bookings = await this.pullBookings(beds24PropertyId);

    // Get all Beds24-originated reservations from PMS
    const pmsReservations = await db('reservations')
      .where({ source: 'Beds24' })
      .whereNotNull('beds24_booking_id')
      .whereNull('deleted_at')
      .select('id', 'beds24_booking_id', 'check_in', 'check_out', 'status', 'total_amount');

    const beds24BookingMap = new Map(
      beds24Bookings.map((b) => [b.id?.toString() || '', b])
    );
    const pmsReservationMap = new Map(
      pmsReservations.map((r) => [r.beds24_booking_id || '', r])
    );

    const matched: string[] = [];
    const missingInPms: string[] = [];
    const missingInBeds24: string[] = [];
    const discrepancies: Array<{
      reservationId: string;
      beds24BookingId: string;
      issue: string;
    }> = [];

    // Check Beds24 bookings
    for (const booking of beds24Bookings) {
      const bookingId = booking.id?.toString() || '';
      const pmsReservation = pmsReservationMap.get(bookingId);

      if (!pmsReservation) {
        missingInPms.push(bookingId);
      } else {
        matched.push(bookingId);

        // Check for discrepancies
        const issues: string[] = [];

        if (pmsReservation.check_in !== booking.arrivalDate) {
          issues.push(`Check-in date mismatch: PMS=${pmsReservation.check_in}, Beds24=${booking.arrivalDate}`);
        }

        if (pmsReservation.check_out !== booking.departureDate) {
          issues.push(`Check-out date mismatch: PMS=${pmsReservation.check_out}, Beds24=${booking.departureDate}`);
        }

        const beds24Status = booking.status || 'confirmed';
        const pmsStatus = pmsReservation.status;
        if (pmsStatus !== 'Cancelled' && beds24Status === 'cancelled') {
          issues.push('Status mismatch: Beds24 cancelled but PMS not');
        }

        if (issues.length > 0) {
          discrepancies.push({
            reservationId: pmsReservation.id,
            beds24BookingId: bookingId,
            issue: issues.join('; '),
          });
        }
      }
    }

    // Check PMS reservations
    for (const reservation of pmsReservations) {
      const bookingId = reservation.beds24_booking_id || '';
      if (!beds24BookingMap.has(bookingId)) {
        missingInBeds24.push(bookingId);
      }
    }

    return {
      totalBeds24: beds24Bookings.length,
      totalPms: pmsReservations.length,
      matched: matched.length,
      missingInPms: missingInPms.length,
      missingInBeds24: missingInBeds24.length,
      discrepancies,
    };
  }

  /**
   * Load Beds24 configuration
   */
  private async loadBeds24Config() {
    const propertyId = '00000000-0000-0000-0000-000000000001';
    const config = await db('beds24_config')
      .where({ property_id: propertyId })
      .first();

    if (!config) {
      return null;
    }

    const refreshToken = decrypt(config.refresh_token);
    this.client.setRefreshToken(refreshToken);

    return {
      ...config,
      refresh_token: refreshToken,
    };
  }
}

