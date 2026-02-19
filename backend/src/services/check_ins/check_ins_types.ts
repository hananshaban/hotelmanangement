/**
 * Check-in Types
 * 
 * Defines types for the check-in/checkout flow, separating reservation intent
 * from actual room assignment and guest stay.
 */

export type CheckInStatus = 'checked_in' | 'checked_out';

export type RoomChangeReason = 'upgrade' | 'downgrade' | 'maintenance' | 'guest_preference' | 'other';

export type RoomAssignmentType = 'initial' | 'change' | 'upgrade' | 'downgrade';

/**
 * Request to check in a guest
 */
export interface CheckInRequest {
  reservation_id: string;
  actual_room_id: string;
  notes?: string;
  check_in_time?: string; // ISO timestamp, defaults to now
}

/**
 * Request to change a guest's room during their stay
 */
export interface RoomChangeRequest {
  checkin_id: string;
  new_room_id: string;
  change_reason: RoomChangeReason;
  notes?: string;
}

/**
 * Request to check out a guest
 */
export interface CheckOutRequest {
  checkin_id: string;
  actual_checkout_time?: string; // ISO timestamp, defaults to now
  notes?: string;
}

/**
 * Room assignment record (audit trail entry)
 */
export interface RoomAssignment {
  id: string;
  hotel_id: string;
  checkin_id: string;
  from_room_id?: string | null;
  to_room_id: string;
  assignment_type: RoomAssignmentType;
  change_reason?: string | null;
  notes?: string | null;
  assigned_by?: string | null;
  assigned_by_name?: string | null;
  assigned_at: string;
  
  // Room details for convenience
  from_room_number?: string;
  to_room_number?: string;
}

/**
 * Check-in response with full details
 */
export interface CheckInResponse {
  id: string;
  hotel_id: string;
  reservation_id: string;
  actual_room_id: string;
  actual_room_number: string;
  check_in_time: string;
  expected_checkout_time?: string | null;
  actual_checkout_time?: string | null;
  checked_in_by?: string | null;
  checked_in_by_name?: string | null;
  notes?: string | null;
  status: CheckInStatus;
  created_at: string;
  updated_at: string;
  
  // Related data
  reservation?: ReservationSummary;
  room_assignments?: RoomAssignment[];
}

/**
 * Summary of reservation data (for embedding in check-in responses)
 */
export interface ReservationSummary {
  id: string;
  reservation_number?: string;
  primary_guest_id: string;
  primary_guest_name: string;
  primary_guest_email: string;
  primary_guest_phone: string;
  check_in: string;
  check_out: string;
  status: string;
  room_type_id?: string | null;
  room_type_name?: string | null;
  reserved_room_id?: string | null;
  reserved_room_number?: string | null;
  special_requests?: string | null;
}

/**
 * Room details for check-in
 */
export interface RoomDetails {
  id: string;
  room_number: string;
  type: string;
  room_type: string;
  status: string;
  floor: number;
  features: string[];
  description?: string;
  price_per_night: number;
  is_preferred?: boolean; // True if room type matches reservation's room type
}

/**
 * Eligible rooms for check-in (available rooms of the reserved type)
 */
export interface EligibleRoomsResponse {
  reservation_id: string;
  reserved_room_type_id?: string | null;
  reserved_room_type_name?: string | null;
  reserved_room_id?: string | null;
  reserved_room_number?: string | null;
  check_in_date: string;
  check_out_date: string;
  available_rooms: RoomDetails[];
}

/**
 * Filters for querying check-ins
 */
export interface CheckInFilters {
  hotel_id?: string;
  status?: CheckInStatus;
  room_id?: string;
  reservation_id?: string;
  checked_in_by?: string;
  check_in_from?: string; // ISO date
  check_in_to?: string; // ISO date
  checkout_from?: string; // ISO date
  checkout_to?: string; // ISO date
}

/**
 * Response for listing check-ins with pagination
 */
export interface CheckInsListResponse {
  check_ins: CheckInResponse[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}



