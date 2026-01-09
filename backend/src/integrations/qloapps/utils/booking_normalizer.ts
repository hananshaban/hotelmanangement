/**
 * QloApps Booking Normalizer
 *
 * Normalizes raw QloApps API responses to our standard booking format.
 * Handles different response formats from various QloApps endpoints.
 */

import type { QloAppsBooking, QloAppsBookingRaw, QloAppsBookingRoomType, QloAppsBookingCustomer } from '../qloapps_types.js';

/**
 * Normalize a raw QloApps booking response to our standard format
 *
 * The room_bookings endpoint returns flattened data, while other endpoints
 * may return nested associations structure.
 *
 * @param raw Raw booking from QloApps API
 * @returns Normalized booking in our standard format
 */
export function normalizeQloAppsBooking(raw: QloAppsBookingRaw): QloAppsBooking {
  // For room_bookings endpoint (flat structure), create room_types and customer_detail
  let room_types: QloAppsBookingRoomType[] = [];
  let customer_detail: QloAppsBookingCustomer | undefined;

  // Check if this is the flat structure from room_bookings endpoint
  if (raw.id_product && raw.room_type_name) {
    // This is from room_bookings endpoint - create room type from flat data
    const roomType: QloAppsBookingRoomType = {
      id_room_type: raw.id_product,
      date_from: raw.date_from || '',
      date_to: raw.date_to || '',
      number_of_rooms: 1, // Assume 1 room per booking in this endpoint
      id_room: raw.id_room,
      room_name: raw.room_num,
      room_type_name: raw.room_type_name,
      occupancy: [{
        adults: raw.adults || 1,
        children: raw.children || 0,
        child_ages: raw.child_ages ? JSON.parse(raw.child_ages) : []
      }]
    };
    room_types = [roomType];

    // Create customer detail from flat data
    // Generate names from email if not available directly
    let firstname = '';
    let lastname = '';
    
    if (raw.email) {
      // Extract name from email prefix (before @)
      const emailPrefix = raw.email.split('@')[0];
      // Clean up common email patterns (dots, underscores, numbers)
      const cleanedName = emailPrefix.replace(/[._-]/g, ' ').replace(/\d+/g, '').trim();
      
      if (cleanedName) {
        const nameParts = cleanedName.split(/\s+/);
        if (nameParts.length > 1) {
          firstname = nameParts[0];
          lastname = nameParts.slice(1).join(' ');
        } else {
          firstname = cleanedName;
          lastname = 'Guest';
        }
      } else {
        // Email prefix is all numbers/special chars
        firstname = 'Booking';
        lastname = 'Guest';
      }
    } else {
      // No email available
      firstname = 'Booking';
      lastname = 'Guest';
    }

    customer_detail = {
      firstname: firstname,
      lastname: lastname,
      email: raw.email || '',
      phone: raw.phone || '',
      address: '', // Not available in room_bookings
      city: raw.city,
      country_code: raw.country,
      state_code: raw.state,
      zip: raw.zipcode
    };
  }
  // Fallback to associations structure (for other endpoints)
  else {
    // Try direct field first
    if (raw.room_types && Array.isArray(raw.room_types) && raw.room_types.length > 0) {
      room_types = raw.room_types;
    }
    // Try associations structure
    else if ((raw as any).associations?.room_types) {
      const assocRoomTypes = (raw as any).associations.room_types;

      // Check if it's a direct array
      if (Array.isArray(assocRoomTypes)) {
        room_types = assocRoomTypes;
      }
      // Check if it's wrapped in { room_type: [...] } or { room_type: {...} }
      else if (typeof assocRoomTypes === 'object' && 'room_type' in assocRoomTypes) {
        const roomType = assocRoomTypes.room_type;
        if (Array.isArray(roomType)) {
          room_types = roomType;
        } else if (roomType) {
          // Single room type object
          room_types = [roomType];
        }
      }
    }

    // Extract customer_detail from associations or root level
    customer_detail = (raw as any).customer_detail;
    if (!customer_detail && (raw as any).associations?.customer_detail) {
      customer_detail = (raw as any).associations.customer_detail;
    }
  }

  // Ensure customer_detail has names (generate from email if missing)
  if (customer_detail) {
    if (!customer_detail.firstname && !customer_detail.lastname) {
      if (customer_detail.email) {
        // Extract name from email prefix
        const emailPrefix = customer_detail.email.split('@')[0];
        const cleanedName = emailPrefix.replace(/[._-]/g, ' ').replace(/\d+/g, '').trim();
        
        if (cleanedName) {
          const nameParts = cleanedName.split(/\s+/);
          if (nameParts.length > 1) {
            customer_detail.firstname = nameParts[0];
            customer_detail.lastname = nameParts.slice(1).join(' ');
          } else {
            customer_detail.firstname = cleanedName;
            customer_detail.lastname = 'Guest';
          }
        } else {
          customer_detail.firstname = 'Booking';
          customer_detail.lastname = 'Guest';
        }
      } else {
        // No email and no name - use fallback
        customer_detail.firstname = 'Booking';
        customer_detail.lastname = 'Guest';
      }
    } else if (!customer_detail.firstname) {
      // Has lastname but no firstname
      customer_detail.firstname = customer_detail.email ? customer_detail.email.split('@')[0] : 'Guest';
    } else if (!customer_detail.lastname) {
      // Has firstname but no lastname
      customer_detail.lastname = 'Guest';
    }
  }

  // Build normalized booking
  const normalized: QloAppsBooking = {
    id: raw.id,
    id_customer: raw.id_customer || 0,
    reference: String(raw.id), // Use booking ID as reference
    booking_status: (raw.id_status as any) || 1,
    payment_status: 1, // Assume completed for room_bookings
    total_price: parseFloat(raw.total_price_tax_incl || '0') || 0,
    currency: 'USD', // Default currency
    source: 'qloapps',
    room_types: room_types,
    customer_detail: customer_detail!,
    date_add: raw.date_add,
    date_upd: raw.date_upd,
  };

  return normalized;
}

/**
 * Normalize an array of raw bookings
 * 
 * @param rawBookings Array of raw bookings from QloApps API
 * @returns Array of normalized bookings
 */
export function normalizeQloAppsBookings(rawBookings: QloAppsBookingRaw[]): QloAppsBooking[] {
  return rawBookings.map(raw => normalizeQloAppsBooking(raw));
}

