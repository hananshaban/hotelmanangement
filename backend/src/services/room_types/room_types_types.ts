import type { Beds24RoomType, Beds24Unit } from '../rooms/rooms_types.js';

/**
 * Room Type Types
 * Represents Beds24-style room types with quantity
 */

export interface RoomType {
  id: string;
  name: string;
  room_type: Beds24RoomType;
  qty: number;
  price_per_night: number;
  min_price?: number | null;
  max_price?: number | null;
  rack_rate?: number | null;
  cleaning_fee: number;
  security_deposit: number;
  max_people?: number | null;
  max_adult?: number | null;
  max_children?: number | null;
  min_stay?: number | null;
  max_stay?: number | null;
  tax_percentage?: number | null;
  tax_per_person?: number | null;
  room_size?: number | null;
  floor?: number | null;
  highlight_color?: string | null;
  sell_priority?: number | null;
  include_reports: boolean;
  restriction_strategy?: string | null;
  overbooking_protection?: string | null;
  block_after_checkout_days: number;
  control_priority?: number | null;
  unit_allocation: 'perBooking' | 'perGuest';
  features: string[];
  description?: string | null;
  units: Beds24Unit[];
  cm_room_id?: string | null;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}

export interface CreateRoomTypeRequest {
  name: string;
  room_type: Beds24RoomType;
  qty: number;
  price_per_night: number;
  min_price?: number;
  max_price?: number;
  rack_rate?: number;
  cleaning_fee?: number;
  security_deposit?: number;
  max_people?: number;
  max_adult?: number | null;
  max_children?: number | null;
  min_stay?: number | null;
  max_stay?: number | null;
  tax_percentage?: number | null;
  tax_per_person?: number | null;
  room_size?: number | null;
  floor?: number | null;
  highlight_color?: string | null;
  sell_priority?: number | null;
  include_reports?: boolean;
  restriction_strategy?: 'firstNight' | 'stayThrough' | null;
  overbooking_protection?: 'room' | 'property' | null;
  block_after_checkout_days?: number;
  control_priority?: number | null;
  unit_allocation?: 'perBooking' | 'perGuest';
  features?: string[];
  description?: string;
  units?: Beds24Unit[];
  cm_room_id?: string;
}

export interface UpdateRoomTypeRequest extends Partial<CreateRoomTypeRequest> {
  // All fields optional for update
}

export interface RoomTypeResponse extends RoomType {
  // Same as RoomType, but ensures all fields are present
}

export interface RoomTypeAvailability {
  room_type_id: string;
  room_type_name: string;
  room_type: Beds24RoomType;
  available_units: number;
  total_units: number;
  reserved_units: number;
  price_per_night: number;
  date: string; // YYYY-MM-DD
}

export interface RoomTypeAvailabilityRange {
  room_type_id: string;
  room_type_name: string;
  room_type: Beds24RoomType;
  total_units: number;
  availability: Map<string, number>; // date -> available units
  price_per_night: number;
}

export interface AvailableRoomTypesQuery {
  check_in: string; // YYYY-MM-DD
  check_out: string; // YYYY-MM-DD
  min_price?: number;
  max_price?: number;
  room_type?: Beds24RoomType;
  max_people?: number;
  units_requested?: number; // Default 1
}



