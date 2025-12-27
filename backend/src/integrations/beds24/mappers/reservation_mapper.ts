import type {
  Beds24Booking,
  Beds24BookingCreateRequest,
  Beds24BookingUpdateRequest,
  Beds24Guest,
} from '../beds24_types.js';
import type { ReservationResponse } from '../../../services/reservations/reservations_types.js';
import { mapPmsGuestToBeds24 } from './guest_mapper.js';

/**
 * Map PMS reservation status to Beds24 status
 */
function mapPmsStatusToBeds24(status: string): Beds24Booking['status'] {
  const statusMap: Record<string, Beds24Booking['status']> = {
    Confirmed: 'confirmed',
    'Checked-in': 'checkedin',
    'Checked-out': 'checkedout',
    Cancelled: 'cancelled',
  };

  return statusMap[status] || 'confirmed';
}

/**
 * Map Beds24 status to PMS reservation status
 */
export function mapBeds24StatusToPms(status: Beds24Booking['status']): string {
  const statusMap: Record<Beds24Booking['status'], string> = {
    confirmed: 'Confirmed',
    checkedin: 'Checked-in',
    checkedout: 'Checked-out',
    cancelled: 'Cancelled',
    request: 'Confirmed', // Treat request as confirmed
    new: 'Confirmed', // Treat new as confirmed
    inquiry: 'Confirmed', // Treat inquiry as confirmed
  };

  return statusMap[status] || 'Confirmed';
}

/**
 * Map PMS source to Beds24 source
 */
function mapPmsSourceToBeds24(source: string): string {
  if (source === 'Direct') {
    return 'direct';
  }
  // All other sources are considered channels
  return 'channel';
}

/**
 * Map Beds24 source to PMS source
 */
export function mapBeds24SourceToPms(source?: string): string {
  if (source === 'direct') {
    return 'Direct';
  }
  // Default to Beds24 for channel bookings
  return 'Beds24';
}

/**
 * Convert Beds24Booking to Beds24 API format
 * Beds24 API expects: arrival, departure (not arrivalDate, departureDate)
 * Also converts camelCase to the format Beds24 expects
 */
export function convertBookingToBeds24ApiFormat(
  booking: Beds24BookingCreateRequest | Beds24BookingUpdateRequest
): any {
  const apiBooking: any = {
    propertyId: booking.propertyId,
    roomId: booking.roomId,
    arrival: booking.arrivalDate, // Convert arrivalDate → arrival
    departure: booking.departureDate, // Convert departureDate → departure
    status: booking.status,
    price: booking.price,
  };

  // Add optional fields if present
  if (booking.currency) apiBooking.currency = booking.currency;
  if (booking.source) apiBooking.source = booking.source;
  if (booking.externalId) apiBooking.externalId = booking.externalId;
  if (booking.specialRequests) apiBooking.specialRequests = booking.specialRequests;
  if (booking.numberOfGuests) apiBooking.numberOfGuests = booking.numberOfGuests;
  if (booking.guest) {
    apiBooking.firstName = booking.guest.firstName;
    apiBooking.lastName = booking.guest.lastName;
    if (booking.guest.email) apiBooking.email = booking.guest.email;
    if (booking.guest.phone) apiBooking.phone = booking.guest.phone;
    if (booking.guest.address) apiBooking.address = booking.guest.address;
    if (booking.guest.city) apiBooking.city = booking.guest.city;
    if (booking.guest.zip) apiBooking.zip = booking.guest.zip;
  }
  if (booking.channel) apiBooking.channel = booking.channel;
  if (booking.apiReference) apiBooking.apiReference = booking.apiReference;

  // For updates, include the id
  if ('id' in booking && booking.id) {
    apiBooking.id = booking.id;
  }

  return apiBooking;
}

/**
 * Map PMS reservation to Beds24 booking (for create/update)
 */
export function mapPmsReservationToBeds24(
  reservation: ReservationResponse,
  beds24PropertyId: string,
  beds24RoomId: string,
  guest: { name: string; email?: string; phone?: string },
  unitsRequested?: number // Optional: number of units for room type reservations
): Beds24BookingCreateRequest | Beds24BookingUpdateRequest {
  const baseBooking: Beds24Booking = {
    propertyId: parseInt(beds24PropertyId, 10),
    roomId: parseInt(beds24RoomId, 10),
    arrivalDate: reservation.check_in, // Already in YYYY-MM-DD format
    departureDate: reservation.check_out, // Already in YYYY-MM-DD format
    status: mapPmsStatusToBeds24(reservation.status),
    price: Number(reservation.total_amount),
    currency: 'USD', // TODO: Get from property settings
    source: mapPmsSourceToBeds24(reservation.source),
    externalId: `PMS-${reservation.id}`, // PMS reservation ID for idempotency
    numberOfGuests: 1, // TODO: Get from reservation_guests table if available
  };

  if (reservation.special_requests) {
    baseBooking.specialRequests = reservation.special_requests;
  }

  // Add guest information
  if (guest) {
    const nameParts = guest.name.trim().split(/\s+/);
    const guestData: Beds24Guest = {
      firstName: nameParts[0] || '',
      lastName: nameParts.slice(1).join(' ') || '',
    };
    if (guest.email) {
      guestData.email = guest.email;
    }
    if (guest.phone) {
      guestData.phone = guest.phone;
    }
    baseBooking.guest = guestData;
  }

  // If beds24_booking_id exists, this is an update
  if (reservation.beds24_booking_id) {
    return {
      ...baseBooking,
      id: parseInt(reservation.beds24_booking_id, 10),
    } as Beds24BookingUpdateRequest;
  }

  return baseBooking as Beds24BookingCreateRequest;
}

/**
 * Map Beds24 booking to PMS reservation data
 */
export function mapBeds24BookingToPms(
  booking: Beds24Booking,
  entityId: string, // PMS room ID or room type ID
  guestId: string, // PMS guest ID (created or matched)
  entityType: 'room' | 'room_type' = 'room' // Type of entity
): {
  room_id?: string | null;
  room_type_id?: string | null;
  primary_guest_id: string;
  check_in: string;
  check_out: string;
  status: string;
  total_amount: number;
  source: string;
  beds24_booking_id: string;
  special_requests?: string;
  units_requested?: number;
} {
  const baseData: {
    primary_guest_id: string;
    check_in: string;
    check_out: string;
    status: string;
    total_amount: number;
    source: string;
    beds24_booking_id: string;
    special_requests?: string;
    units_requested?: number;
  } = {
    primary_guest_id: guestId,
    check_in: booking.arrivalDate,
    check_out: booking.departureDate,
    status: mapBeds24StatusToPms(booking.status),
    total_amount: booking.price || 0,
    source: mapBeds24SourceToPms(booking.source),
    beds24_booking_id: booking.id?.toString() || '',
    units_requested: 1, // Default to 1 unit per booking
  };

  if (booking.specialRequests) {
    baseData.special_requests = booking.specialRequests;
  }

  if (entityType === 'room_type') {
    return {
      ...baseData,
      room_type_id: entityId,
      room_id: null,
    };
  } else {
    return {
      ...baseData,
      room_id: entityId,
      room_type_id: null,
    };
  }
}

