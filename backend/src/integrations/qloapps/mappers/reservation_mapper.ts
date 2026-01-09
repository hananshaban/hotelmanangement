/**
 * QloApps Reservation Mapper
 *
 * Maps between PMS reservation format and QloApps booking format.
 * Handles status codes, dates, pricing, room types, and guest details.
 */

import { QLOAPPS_CONFIG } from '../qloapps_config.js';
import type {
  QloAppsBooking,
  QloAppsBookingCreateRequest,
  QloAppsBookingUpdateRequest,
  QloAppsBookingRoomType,
  QloAppsBookingRoomTypeRequest,
  QloAppsBookingCustomer,
  QloAppsOccupancy,
  QloAppsBookingStatusCode,
  QloAppsPaymentStatusCode,
} from '../qloapps_types.js';
import type { ReservationResponse, LegacyReservationStatus } from '../../../services/reservations/reservations_types.js';
import type { GuestResponse } from '../../../services/guests/guests_types.js';
import { mapPmsGuestToQloAppsBookingCustomer, extractGuestName } from './guest_mapper.js';

// ============================================================================
// Status Mapping Constants (derived from config)
// ============================================================================

/**
 * Map QloApps booking status codes to PMS status strings
 */
const BOOKING_STATUS_TO_PMS: Record<QloAppsBookingStatusCode, LegacyReservationStatus> = {
  1: 'Confirmed',    // NEW
  2: 'Checked-out',  // COMPLETED
  3: 'Cancelled',    // CANCELLED
  4: 'Cancelled',    // REFUNDED
};

/**
 * Map PMS status strings to QloApps booking status codes
 */
const PMS_STATUS_TO_BOOKING: Record<LegacyReservationStatus, QloAppsBookingStatusCode> = {
  'Confirmed': 1,
  'Checked-in': 2,  // Map to COMPLETED (QloApps doesn't have checked-in)
  'Checked-out': 2,
  'Cancelled': 3,
};

/**
 * Map QloApps payment status codes to PMS payment status strings
 */
const PAYMENT_STATUS_TO_PMS: Record<QloAppsPaymentStatusCode, string> = {
  1: 'completed',
  2: 'partial',
  3: 'awaiting',
};

/**
 * Map PMS payment status strings to QloApps payment status codes
 */
const PMS_STATUS_TO_PAYMENT: Record<string, QloAppsPaymentStatusCode> = {
  'completed': 1,
  'paid': 1,
  'partial': 2,
  'awaiting': 3,
  'pending': 3,
  'unpaid': 3,
};

// ============================================================================
// Status Mapping
// ============================================================================

/**
 * Map QloApps booking status code to PMS status
 */
export function mapQloAppsStatusToPms(bookingStatus: QloAppsBookingStatusCode): LegacyReservationStatus {
  return BOOKING_STATUS_TO_PMS[bookingStatus] || 'Confirmed';
}

/**
 * Map PMS status to QloApps booking status code
 */
export function mapPmsStatusToQloApps(status: LegacyReservationStatus): QloAppsBookingStatusCode {
  return PMS_STATUS_TO_BOOKING[status] || 1;
}

/**
 * Map QloApps payment status code to PMS-friendly string
 */
export function mapQloAppsPaymentStatusToPms(paymentStatus: QloAppsPaymentStatusCode): string {
  return PAYMENT_STATUS_TO_PMS[paymentStatus] || 'awaiting';
}

/**
 * Map PMS payment status string to QloApps payment status code
 */
export function mapPmsPaymentStatusToQloApps(paymentStatus: string): QloAppsPaymentStatusCode {
  const statusLower = paymentStatus.toLowerCase();
  return PMS_STATUS_TO_PAYMENT[statusLower] || 3;
}

// ============================================================================
// Source Mapping
// ============================================================================

/**
 * Map QloApps booking source to PMS source
 */
export function mapQloAppsSourceToPms(source?: string, channel?: string): string {
  // If source indicates OTA, use channel name if available
  if (source === 'ota' || source === 'channel') {
    if (channel) {
      // Normalize channel names
      const channelLower = channel.toLowerCase();
      if (channelLower.includes('booking')) return 'Booking.com';
      if (channelLower.includes('expedia')) return 'Expedia';
      // For other channels not in the constraint, use 'Other'
      if (channelLower.includes('airbnb')) return 'Other';
      if (channelLower.includes('agoda')) return 'Other';
      // Default OTA to 'Other' for unknown channels
      return 'Other';
    }
    return 'Other'; // OTA without specific channel
  }

  // Direct bookings
  if (source === 'website' || source === 'webservice' || source === 'direct') {
    return 'Direct';
  }

  // Default to 'Other' for QloApps bookings
  // Database constraint only allows: 'Direct', 'Beds24', 'Booking.com', 'Expedia', 'Other'
  return 'Other';
}

/**
 * Map PMS source to QloApps booking source
 */
export function mapPmsSourceToQloApps(source: string): { source: string; channel?: string } {
  const sourceLower = source.toLowerCase();

  if (sourceLower === 'direct') {
    return { source: 'webservice' };
  }

  if (sourceLower === 'booking.com') {
    return { source: 'ota', channel: 'Booking.com' };
  }

  if (sourceLower === 'expedia') {
    return { source: 'ota', channel: 'Expedia' };
  }

  if (sourceLower === 'airbnb') {
    return { source: 'ota', channel: 'Airbnb' };
  }

  // Default to webservice (API source)
  return { source: 'webservice' };
}

// ============================================================================
// PMS → QloApps Mapping
// ============================================================================

/**
 * Map PMS reservation to QloApps booking create request
 */
export function mapPmsReservationToQloApps(
  reservation: ReservationResponse,
  guest: GuestResponse,
  qloAppsRoomTypeId: number,
  currency: string = 'USD'
): QloAppsBookingCreateRequest {
  // Determine number of rooms/units
  const numberOfRooms = reservation.units_requested || 1;

  // Build occupancy (default to 1 adult if not specified)
  const adults = reservation.num_adult || 1;
  const children = reservation.num_child || 0;

  const occupancy: QloAppsOccupancy[] = [{
    adults,
    children,
    child_ages: [], // We don't track child ages in PMS
  }];

  // Build room type request
  const roomType: QloAppsBookingRoomTypeRequest = {
    id_room_type: qloAppsRoomTypeId,
    date_from: formatDateForQloApps(reservation.check_in),
    date_to: formatDateForQloApps(reservation.check_out),
    number_of_rooms: numberOfRooms,
    occupancy,
  };

  // Build customer details
  const customerDetail = mapPmsGuestToQloAppsBookingCustomer(guest);

  // Build the booking request
  const bookingRequest: QloAppsBookingCreateRequest = {
    currency,
    booking_status: mapPmsStatusToQloApps(reservation.status as LegacyReservationStatus),
    payment_status: 3, // Default to awaiting payment
    source: 'webservice', // Mark as API-created
    customer_detail: customerDetail,
    room_types: [roomType],
  };

  // Add special requests if present
  if (reservation.special_requests) {
    bookingRequest.remarks = reservation.special_requests;
  }

  return bookingRequest;
}

/**
 * Map PMS reservation to QloApps booking update request
 */
export function mapPmsReservationToQloAppsUpdate(
  reservation: ReservationResponse,
  qloAppsBookingId: number
): QloAppsBookingUpdateRequest {
  const updateRequest: QloAppsBookingUpdateRequest = {
    id: qloAppsBookingId,
  };

  // Map status
  updateRequest.booking_status = mapPmsStatusToQloApps(reservation.status as LegacyReservationStatus);

  // Add remarks if present
  if (reservation.special_requests) {
    updateRequest.remarks = reservation.special_requests;
  }

  return updateRequest;
}

// ============================================================================
// QloApps → PMS Mapping
// ============================================================================

/**
 * Map QloApps booking to PMS reservation data for creation/update
 */
export function mapQloAppsBookingToPms(
  booking: QloAppsBooking,
  pmsRoomTypeId: string,
  pmsGuestId: string
): {
  room_type_id: string;
  room_id: null;
  primary_guest_id: string;
  check_in: string;
  check_out: string;
  status: LegacyReservationStatus;
  total_amount: number;
  source: string;
  special_requests: string | null;
  units_requested: number;
  num_adult: number | null;
  num_child: number | null;
  channel: string | null;
} {
  // Get dates from the first room type (assuming single room type per booking for now)
  const firstRoomType = booking.room_types[0];
  if (!firstRoomType) {
    throw new Error(`Booking ${booking.id} has no room types`);
  }

  // Calculate total occupancy
  let totalAdults = 0;
  let totalChildren = 0;
  let totalRooms = 0;

  for (const roomType of booking.room_types) {
    totalRooms += roomType.number_of_rooms || 1;
    for (const occ of roomType.occupancy || []) {
      totalAdults += occ.adults || 0;
      totalChildren += occ.children || 0;
    }
  }

  return {
    room_type_id: pmsRoomTypeId,
    room_id: null, // QloApps uses room types, not individual rooms
    primary_guest_id: pmsGuestId,
    check_in: formatDateForPms(firstRoomType.date_from),
    check_out: formatDateForPms(firstRoomType.date_to),
    status: mapQloAppsStatusToPms(booking.booking_status),
    total_amount: booking.total_price || 0,
    source: mapQloAppsSourceToPms(booking.source, booking.channel),
    special_requests: booking.remarks || null,
    units_requested: totalRooms || 1,
    num_adult: totalAdults > 0 ? totalAdults : null,
    num_child: totalChildren > 0 ? totalChildren : null,
    channel: booking.channel || null,
  };
}

/**
 * Extract check-in and check-out dates from QloApps booking
 * Returns the earliest check-in and latest check-out across all room types
 */
export function extractBookingDates(booking: QloAppsBooking): {
  checkIn: string;
  checkOut: string;
} {
  if (!booking.room_types || booking.room_types.length === 0) {
    throw new Error(`Booking ${booking.id} has no room types`);
  }

  let earliestCheckIn: string | null = null;
  let latestCheckOut: string | null = null;

  for (const roomType of booking.room_types) {
    if (!earliestCheckIn || roomType.date_from < earliestCheckIn) {
      earliestCheckIn = roomType.date_from;
    }
    if (!latestCheckOut || roomType.date_to > latestCheckOut) {
      latestCheckOut = roomType.date_to;
    }
  }

  return {
    checkIn: earliestCheckIn!,
    checkOut: latestCheckOut!,
  };
}

// ============================================================================
// Date Formatting Utilities
// ============================================================================

/**
 * Format date for QloApps API (YYYY-MM-DD)
 * Handles both Date objects and ISO strings
 */
export function formatDateForQloApps(date: string | Date): string {
  // If already in YYYY-MM-DD format, return as-is
  if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return date;
  }

  // If Date object, format using local time
  if (date instanceof Date) {
    if (isNaN(date.getTime())) {
      throw new Error('Invalid Date object');
    }
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  // If ISO string with time, extract date part
  if (typeof date === 'string') {
    const match = date.match(/^(\d{4}-\d{2}-\d{2})/);
    if (match && match[1]) {
      return match[1];
    }
    throw new Error(`Invalid date format: ${date}`);
  }

  throw new Error(`Unsupported date type: ${typeof date}`);
}

/**
 * Format date for PMS (YYYY-MM-DD)
 * Ensures consistent date format for database storage
 */
export function formatDateForPms(date: string): string {
  // QloApps should provide YYYY-MM-DD, but validate
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return date;
  }

  // Try to parse if in different format
  const parsed = new Date(date);
  if (!isNaN(parsed.getTime())) {
    const year = parsed.getFullYear();
    const month = String(parsed.getMonth() + 1).padStart(2, '0');
    const day = String(parsed.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  throw new Error(`Invalid date format from QloApps: ${date}`);
}

// ============================================================================
// Comparison Utilities
// ============================================================================

/**
 * Check if a QloApps booking has changed compared to PMS reservation
 * Used for conflict detection
 */
export function hasBookingChanged(
  qloAppsBooking: QloAppsBooking,
  pmsReservation: ReservationResponse
): {
  changed: boolean;
  changes: string[];
} {
  const changes: string[] = [];

  // Compare status
  const pmsStatusFromQloApps = mapQloAppsStatusToPms(qloAppsBooking.booking_status);
  if (pmsStatusFromQloApps !== pmsReservation.status) {
    changes.push(`status: ${pmsReservation.status} → ${pmsStatusFromQloApps}`);
  }

  // Compare dates
  const { checkIn, checkOut } = extractBookingDates(qloAppsBooking);
  if (checkIn !== pmsReservation.check_in) {
    changes.push(`check_in: ${pmsReservation.check_in} → ${checkIn}`);
  }
  if (checkOut !== pmsReservation.check_out) {
    changes.push(`check_out: ${pmsReservation.check_out} → ${checkOut}`);
  }

  // Compare total amount (with tolerance for floating point)
  const amountDiff = Math.abs(qloAppsBooking.total_price - pmsReservation.total_amount);
  if (amountDiff > 0.01) {
    changes.push(`total_amount: ${pmsReservation.total_amount} → ${qloAppsBooking.total_price}`);
  }

  return {
    changed: changes.length > 0,
    changes,
  };
}

/**
 * Validate that a QloApps booking has all required fields
 */
export function validateQloAppsBooking(booking: QloAppsBooking): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!booking.id) {
    errors.push('Missing booking ID');
  }

  // Log the actual data structure for debugging
  if (!booking.room_types || booking.room_types.length === 0) {
    errors.push('Missing room types');
    console.warn(`[Validation] Booking ${booking.id} has no room_types. Available keys: ${Object.keys(booking).join(', ')}`);
    if (booking.room_types === undefined) {
      console.warn(`[Validation] Booking ${booking.id} room_types is undefined (not an empty array)`);
    }
  } else {
    for (let i = 0; i < booking.room_types.length; i++) {
      const rt = booking.room_types[i];
      if (!rt) {
        errors.push(`Room type ${i}: undefined`);
        continue;
      }
      if (!rt.id_room_type) {
        errors.push(`Room type ${i}: missing id_room_type`);
      }
      if (!rt.date_from) {
        errors.push(`Room type ${i}: missing date_from`);
      }
      if (!rt.date_to) {
        errors.push(`Room type ${i}: missing date_to`);
      }
    }
  }

  if (!booking.customer_detail) {
    errors.push('Missing customer details');
    console.warn(`[Validation] Booking ${booking.id} has no customer_detail. Available keys: ${Object.keys(booking).join(', ')}`);
    console.warn(`[Validation] Booking ${booking.id} customer_detail value:`, booking.customer_detail);
  } else {
    if (!booking.customer_detail.firstname && !booking.customer_detail.lastname) {
      errors.push('Customer has no name');
    }
    if (!booking.customer_detail.email) {
      errors.push('Customer has no email');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Calculate the number of nights for a booking
 */
export function calculateNights(checkIn: string, checkOut: string): number {
  const checkInDate = new Date(checkIn);
  const checkOutDate = new Date(checkOut);
  const diffTime = checkOutDate.getTime() - checkInDate.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}
