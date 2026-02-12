// Beds24 room type enum
export type Beds24RoomType =
  | 'single'
  | 'double'
  | 'twin'
  | 'twinDouble'
  | 'triple'
  | 'quadruple'
  | 'apartment'
  | 'family'
  | 'suite'
  | 'studio'
  | 'dormitoryRoom'
  | 'bedInDormitory'
  | 'bungalow'
  | 'chalet'
  | 'holidayHome'
  | 'villa'
  | 'mobileHome'
  | 'tent'
  | 'campSite'
  | 'activity'
  | 'tour'
  | 'carRental';

// Legacy PMS room type (for backward compatibility)
export type LegacyRoomType = 'Single' | 'Double' | 'Suite';

// Beds24 unit interface (for multi-unit rooms)
export interface Beds24Unit {
  id?: number; // Beds24 unit ID (optional for PMS-created units)
  name: string;
  name2?: string;
  name3?: string;
  name4?: string;
  name5?: string;
  name6?: string;
  name7?: string;
  name8?: string;
  statusColor?: string;
  statusText?: string;
  note?: string;
}

export interface CreateRoomRequest {
  room_number: string;
  type: LegacyRoomType; // Keep for backward compatibility
  room_type: Beds24RoomType; // Beds24-compatible room type (required)
  status?: 'Available' | 'Occupied' | 'Cleaning' | 'Out of Service';
  price_per_night: number;
  floor: number;
  features?: string[];
  description?: string;
  
  // Beds24-compatible fields
  qty?: number; // Number of units (1-99)
  min_price?: number;
  max_price?: number;
  rack_rate?: number;
  cleaning_fee?: number;
  security_deposit?: number;
  max_people?: number;
  max_adult?: number | null; // null = use max_people
  max_children?: number | null; // null = no distinction
  min_stay?: number | null; // 1-365
  max_stay?: number | null; // 1-365
  tax_percentage?: number | null;
  tax_per_person?: number | null;
  room_size?: number | null; // Square meters (1-2000)
  highlight_color?: string | null;
  sell_priority?: number | null; // 1-100, null = hidden
  include_reports?: boolean;
  restriction_strategy?: 'firstNight' | 'stayThrough' | null;
  overbooking_protection?: 'room' | 'property' | null;
  block_after_checkout_days?: number; // 0-7
  control_priority?: number | null; // 1-100, null = hidden
  unit_allocation?: 'perBooking' | 'perGuest'; // How units are allocated
  units?: Beds24Unit[]; // Array of unit objects for multi-unit rooms
}

export interface UpdateRoomRequest {
  room_number?: string;
  type?: LegacyRoomType;
  room_type?: Beds24RoomType;
  status?: 'Available' | 'Occupied' | 'Cleaning' | 'Out of Service';
  price_per_night?: number;
  floor?: number;
  features?: string[];
  description?: string;
  
  // Beds24-compatible fields
  qty?: number;
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
  highlight_color?: string | null;
  sell_priority?: number | null;
  include_reports?: boolean;
  restriction_strategy?: 'firstNight' | 'stayThrough' | null;
  overbooking_protection?: 'room' | 'property' | null;
  block_after_checkout_days?: number;
  control_priority?: number | null;
  unit_allocation?: 'perBooking' | 'perGuest';
  units?: Beds24Unit[]; // Array of unit objects for multi-unit rooms
}

export interface UpdateHousekeepingRequest {
  status: 'Clean' | 'Dirty' | 'In Progress';
  assigned_staff_id?: string;
  assigned_staff_name?: string;
  notes?: string;
}

export interface RoomResponse {
  id: string;
  room_number: string;
  type: string; // Legacy type
  room_type: string; // Beds24 room type (required)
  status: string;
  price_per_night: number;
  floor: number;
  features: string[];
  description?: string;
  
  // Beds24-compatible fields
  qty?: number;
  min_price?: number | null;
  max_price?: number | null;
  rack_rate?: number | null;
  cleaning_fee?: number | null;
  security_deposit?: number | null;
  max_people?: number | null;
  max_adult?: number | null;
  max_children?: number | null;
  min_stay?: number | null;
  max_stay?: number | null;
  tax_percentage?: number | null;
  tax_per_person?: number | null;
  room_size?: number | null;
  highlight_color?: string | null;
  sell_priority?: number | null;
  include_reports?: boolean | null;
  restriction_strategy?: string | null;
  overbooking_protection?: string | null;
  block_after_checkout_days?: number | null;
  control_priority?: number | null;
  unit_allocation?: string | null; // 'perBooking' | 'perGuest'
  units?: Beds24Unit[] | null; // Array of unit objects for multi-unit rooms
  
  // Channel Manager integration
  cm_room_id?: string | null;
  
  created_at: string;
  updated_at: string;
}

export interface HousekeepingResponse {
  id: string;
  room_id: string;
  status: string;
  assigned_staff_id?: string;
  assigned_staff_name?: string;
  last_cleaned?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

