import type { Beds24Booking } from '../../beds24_types.js';
import { mapBeds24BookingToPms, mapBeds24StatusToPms } from '../../mappers/reservation_mapper.js';
import { GuestMatchingService } from '../../services/guest_matching_service.js';
import { normalizeBooking } from '../../utils/booking_normalizer.js';
import db from '../../../../config/database.js';

/**
 * Handle booking.modified webhook event
 */
export async function handleBookingModified(booking: Beds24Booking | any): Promise<{
  success: boolean;
  reservationId?: string;
  error?: string;
}> {
  try {
    // Normalize booking data (webhooks might send raw Beds24 format with guests array)
    const normalizedBooking = normalizeBooking(booking) || booking as Beds24Booking;
    
    if (!normalizedBooking) {
      return {
        success: false,
        error: 'Invalid booking data',
      };
    }
    
    if (!normalizedBooking.id) {
      return {
        success: false,
        error: 'Booking ID is required for modification',
      };
    }

    // Find existing reservation
    const existing = await db('reservations')
      .where({ beds24_booking_id: normalizedBooking.id.toString() })
      .whereNull('deleted_at')
      .first();

    if (!existing) {
      // Doesn't exist, treat as create
      const { handleBookingCreated } = await import('./booking_created_handler.js');
      return handleBookingCreated(normalizedBooking);
    }

    // Find or create guest - handle missing guest data gracefully
    const guestMatchingService = new GuestMatchingService();
    let guestId: string;
    if (!normalizedBooking.guest) {
      console.warn(`Booking ${normalizedBooking.id} has no guest data. Using Unknown Guest.`);
      guestId = await guestMatchingService.getUnknownGuestId();
    } else {
      guestId = await guestMatchingService.findOrCreateGuest(
        normalizedBooking.guest,
        normalizedBooking.id
      );
    }

    // Find room type by cm_room_id (preferred) or fallback to individual room
    let roomTypeId: string | null = null;
    let roomId: string | null = null;

    // Try to find room type first (new CM-style with unitId support)
    const roomType = await db('room_types')
      .where({ cm_room_id: normalizedBooking.roomId?.toString() })
      .whereNull('deleted_at')
      .first();

    if (roomType) {
      roomTypeId = roomType.id;
    } else {
      // Fallback to individual room (legacy)
      const room = await db('rooms')
        .where({ cm_room_id: normalizedBooking.roomId?.toString() })
        .first();

      if (!room) {
        return {
          success: false,
          error: `Room type or room not found for Beds24 room ID: ${normalizedBooking.roomId}`,
        };
      }

      roomId = room.id;
    }

    // Map booking to PMS format with correct entity type
    const reservationData = mapBeds24BookingToPms(
      normalizedBooking,
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

    // Update reservation
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

    // Update room status (only for individual rooms, not room types)
    if (roomId) {
      if (reservationData.status === 'Checked-in') {
        await db('rooms').where({ id: roomId }).update({ status: 'Occupied' });
      } else if (reservationData.status === 'Checked-out') {
        await db('rooms').where({ id: roomId }).update({ status: 'Cleaning' });
      } else if (reservationData.status === 'Cancelled') {
        // Only update if room was occupied by this reservation
        const roomStatus = await db('rooms').where({ id: roomId }).first();
        if (roomStatus?.status === 'Occupied') {
          // Check if this is the only active reservation
          const activeReservations = await db('reservations')
            .where({ room_id: roomId })
            .whereIn('status', ['Confirmed', 'Checked-in'])
            .whereNull('deleted_at')
            .where('id', '!=', existing.id)
            .count('* as count')
            .first();

          if (Number(activeReservations?.count || 0) === 0) {
            await db('rooms').where({ id: roomId }).update({ status: 'Available' });
          }
        }
      }
    }

    return {
      success: true,
      reservationId: existing.id,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

