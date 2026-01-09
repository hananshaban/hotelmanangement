/**
 * QloApps API Type Definitions
 *
 * TypeScript interfaces for QloApps WebService API data structures.
 * QloApps is built on PrestaShop and uses similar API patterns.
 */

import type { QLOAPPS_CONFIG } from './qloapps_config.js';

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * QloApps connection configuration
 */
export interface QloAppsConnectionConfig {
  /** Base URL of the QloApps instance (e.g., https://your-hotel.qloapps.com) */
  baseUrl: string;

  /** API key for authentication (used as Basic Auth username) */
  apiKey: string;

  /** QloApps hotel ID for multi-hotel setups */
  hotelId: number;

  /** Request timeout in milliseconds */
  timeout?: number;

  /** Whether to enable debug logging */
  debug?: boolean;
}

/**
 * Stored QloApps configuration (from database)
 */
export interface QloAppsStoredConfig {
  id: string;
  propertyId: string;
  baseUrl: string;
  apiKeyEncrypted: string;
  qloAppsHotelId: string;
  syncIntervalMinutes: number;
  syncEnabled: boolean;
  syncReservationsInbound: boolean;
  syncReservationsOutbound: boolean;
  syncAvailability: boolean;
  syncRates: boolean;
  lastSuccessfulSync: Date | null;
  lastSyncError: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// Room Type (Product) Types
// ============================================================================

/**
 * QloApps room type (product in PrestaShop terms)
 */
export interface QloAppsRoomType {
  /** Room type ID */
  id: number;

  /** Hotel ID this room type belongs to */
  id_hotel: number;

  /** Room type name */
  name: string;

  /** Base price per night */
  price: number;

  /** Maximum number of adults */
  max_adults: number;

  /** Maximum number of children */
  max_children: number;

  /** Maximum total guests (adults + children) */
  max_guests: number;

  /** Whether this room type is active */
  active: boolean;

  /** Room type description */
  description?: string;

  /** Short description */
  description_short?: string;

  /** Number of rooms of this type */
  quantity?: number;

  /** Room features/amenities */
  features?: QloAppsRoomFeature[];

  /** Date added */
  date_add?: string;

  /** Date last updated */
  date_upd?: string;
}

/**
 * Room feature/amenity
 */
export interface QloAppsRoomFeature {
  id: number;
  name: string;
  value?: string;
}

/**
 * Request to create a room type
 */
export interface QloAppsRoomTypeCreateRequest {
  name: string;
  price: number;
  max_adults: number;
  max_children: number;
  description?: string;
  active?: boolean;
}

/**
 * Request to update a room type
 */
export interface QloAppsRoomTypeUpdateRequest extends Partial<QloAppsRoomTypeCreateRequest> {
  id: number;
}

// ============================================================================
// Customer Types
// ============================================================================

/**
 * QloApps customer
 */
export interface QloAppsCustomer {
  /** Customer ID */
  id: number;

  /** First name */
  firstname: string;

  /** Last name */
  lastname: string;

  /** Email address */
  email: string;

  /** Phone number */
  phone?: string;

  /** Mobile phone number */
  phone_mobile?: string;

  /** Whether customer is active */
  active: boolean;

  /** Customer note/comments */
  note?: string;

  /** Date of birth */
  birthday?: string;

  /** Gender (0=unknown, 1=male, 2=female) */
  id_gender?: number;

  /** Newsletter subscription */
  newsletter?: boolean;

  /** Date added */
  date_add?: string;

  /** Date last updated */
  date_upd?: string;

  /** Default address */
  addresses?: QloAppsAddress[];
}

/**
 * Customer address
 */
export interface QloAppsAddress {
  id: number;
  address1: string;
  address2?: string;
  city: string;
  postcode?: string;
  id_country: number;
  id_state?: number;
  country?: string;
  state?: string;
  phone?: string;
  phone_mobile?: string;
}

/**
 * Request to create a customer
 */
export interface QloAppsCustomerCreateRequest {
  firstname: string;
  lastname: string;
  email: string;
  phone?: string;
  phone_mobile?: string;
  note?: string;
  birthday?: string;
  id_gender?: number;
  active?: boolean;
  passwd?: string; // Required for customer creation
}

/**
 * Request to update a customer
 */
export interface QloAppsCustomerUpdateRequest extends Partial<Omit<QloAppsCustomerCreateRequest, 'email'>> {
  id: number;
  email?: string; // Email can be updated but is optional
}

// ============================================================================
// Booking Types
// ============================================================================

/**
 * Booking status enum values
 */
export type QloAppsBookingStatusCode = 1 | 2 | 3 | 4;

/**
 * Payment status enum values
 */
export type QloAppsPaymentStatusCode = 1 | 2 | 3;

/**
 * Raw booking response from QloApps room_bookings endpoint (flat structure)
 * This endpoint returns flattened booking data with customer and room info directly in the object
 */
export interface QloAppsBookingRaw {
  /** Booking ID */
  id: number;

  /** Product/Room Type ID */
  id_product?: number;

  /** Hotel ID */
  id_hotel?: number;

  /** Order ID */
  id_order?: number;

  /** Order Detail ID */
  id_order_detail?: number;

  /** Cart ID */
  id_cart?: number;

  /** Room ID */
  id_room?: number;

  /** Customer ID */
  id_customer?: number;

  /** Booking type */
  booking_type?: number;

  /** Status ID (1=confirmed, 2=pending, etc.) */
  id_status?: number;

  /** Comment/Notes */
  comment?: string;

  /** Check-in time */
  check_in?: string;

  /** Check-out time */
  check_out?: string;

  /** Check-in date (YYYY-MM-DD HH:mm:ss) */
  date_from?: string;

  /** Check-out date (YYYY-MM-DD HH:mm:ss) */
  date_to?: string;

  /** Total price excluding tax */
  total_price_tax_excl?: string;

  /** Total price including tax */
  total_price_tax_incl?: string;

  /** Total paid amount */
  total_paid_amount?: string;

  /** Refund status */
  is_refunded?: number;

  /** Cancellation status */
  is_cancelled?: number;

  /** Back order status */
  is_back_order?: number;

  /** Room number */
  room_num?: string;

  /** Room type name */
  room_type_name?: string;

  /** Hotel name */
  hotel_name?: string;

  /** City */
  city?: string;

  /** State */
  state?: string;

  /** Country */
  country?: string;

  /** ZIP code */
  zipcode?: string;

  /** Phone number */
  phone?: string;

  /** Email address */
  email?: string;

  /** Check-in time */
  check_in_time?: string;

  /** Check-out time */
  check_out_time?: string;

  /** Planned check-out datetime */
  planned_check_out?: string;

  /** Number of adults */
  adults?: number;

  /** Number of children */
  children?: number;

  /** Child ages JSON string */
  child_ages?: string;

  /** Date added */
  date_add?: string;

  /** Date updated */
  date_upd?: string;

  /** Legacy associations structure (for backward compatibility with other endpoints) */
  associations?: {
    room_types?: QloAppsBookingRoomType[] | { room_type: QloAppsBookingRoomType | QloAppsBookingRoomType[] };
    customer_detail?: QloAppsBookingCustomer;
  };

  /** Legacy direct fields (for backward compatibility) */
  room_types?: QloAppsBookingRoomType[];
  customer_detail?: QloAppsBookingCustomer;
}

/**
 * QloApps booking (order in PrestaShop terms) - Normalized format
 */
export interface QloAppsBooking {
  /** Booking/order ID */
  id: number;

  /** Reference number */
  reference?: string;

  /** Customer ID */
  id_customer: number;

  /** Booking status (1=new, 2=completed, 3=cancelled, 4=refunded) */
  booking_status: QloAppsBookingStatusCode;

  /** Payment status (1=completed, 2=partial, 3=awaiting) */
  payment_status: QloAppsPaymentStatusCode;

  /** Total price */
  total_price: number;

  /** Total paid amount */
  total_paid?: number;

  /** Currency code (USD, EUR, etc.) */
  currency: string;

  /** Booking source (webservice, website, ota, etc.) */
  source?: string;

  /** Channel name if from OTA */
  channel?: string;

  /** Payment method */
  payment_type?: string;

  /** Room types booked */
  room_types: QloAppsBookingRoomType[];

  /** Customer details for this booking */
  customer_detail: QloAppsBookingCustomer;

  /** Special requests / remarks */
  remarks?: string;

  /** Date booking was created */
  date_add?: string;

  /** Date booking was last updated */
  date_upd?: string;
}

/**
 * Room type within a booking
 */
export interface QloAppsBookingRoomType {
  /** Room type ID */
  id_room_type: number;

  /** Check-in date (YYYY-MM-DD) */
  date_from: string;

  /** Check-out date (YYYY-MM-DD) */
  date_to: string;

  /** Number of rooms of this type booked */
  number_of_rooms: number;

  /** Specific room ID if assigned */
  id_room?: number;

  /** Room name */
  room_name?: string;

  /** Room type name */
  room_type_name?: string;

  /** Occupancy details */
  occupancy: QloAppsOccupancy[];

  /** Price for this room type */
  price?: number;
}

/**
 * Occupancy details for a room
 */
export interface QloAppsOccupancy {
  /** Number of adults */
  adults: number;

  /** Number of children */
  children: number;

  /** Ages of children */
  child_ages: number[];
}

/**
 * Customer details within a booking
 */
export interface QloAppsBookingCustomer {
  /** First name */
  firstname: string;

  /** Last name */
  lastname: string;

  /** Email address */
  email: string;

  /** Phone number */
  phone: string;

  /** Street address */
  address?: string;

  /** City */
  city?: string;

  /** Country ISO code */
  country_code?: string;

  /** State/Province ISO code */
  state_code?: string;

  /** Postal/ZIP code */
  zip?: string;
}

/**
 * Request to create a booking
 */
export interface QloAppsBookingCreateRequest {
  /** Currency code */
  currency: string;

  /** Booking status (default: 1 = new) */
  booking_status?: QloAppsBookingStatusCode;

  /** Payment status (default: 3 = awaiting) */
  payment_status?: QloAppsPaymentStatusCode;

  /** Payment method */
  payment_type?: string;

  /** Booking source */
  source?: string;

  /** Customer details */
  customer_detail: QloAppsBookingCustomer;

  /** Rooms to book */
  room_types: QloAppsBookingRoomTypeRequest[];

  /** Special requests */
  remarks?: string;
}

/**
 * Room type request within booking creation
 */
export interface QloAppsBookingRoomTypeRequest {
  /** Room type ID */
  id_room_type: number;

  /** Check-in date (YYYY-MM-DD) */
  date_from: string;

  /** Check-out date (YYYY-MM-DD) */
  date_to: string;

  /** Number of rooms */
  number_of_rooms: number;

  /** Occupancy per room */
  occupancy: QloAppsOccupancy[];
}

/**
 * Request to update a booking
 */
export interface QloAppsBookingUpdateRequest {
  /** Booking ID */
  id: number;

  /** New booking status */
  booking_status?: QloAppsBookingStatusCode;

  /** New payment status */
  payment_status?: QloAppsPaymentStatusCode;

  /** Updated remarks */
  remarks?: string;
}

// ============================================================================
// API Response Types
// ============================================================================

/**
 * Generic list response from QloApps API
 */
export interface QloAppsListResponse<T> {
  /** Array of items */
  items: T[];

  /** Total count of items (for pagination) */
  total: number;

  /** Number of items per page */
  limit: number;

  /** Offset for pagination */
  offset: number;
}

/**
 * Single item response wrapper
 */
export interface QloAppsSingleResponse<T> {
  /** The item */
  [key: string]: T;
}

/**
 * Create operation response
 */
export interface QloAppsCreateResponse {
  /** ID of created resource */
  id: number;
}

/**
 * API error response
 */
export interface QloAppsErrorResponse {
  /** Error code */
  code?: number;

  /** Error message */
  message: string;

  /** Validation errors */
  errors?: Array<{
    field: string;
    message: string;
  }>;
}

// ============================================================================
// Query/Filter Types
// ============================================================================

/**
 * Parameters for fetching bookings
 */
export interface GetBookingsParams {
  /** Filter by hotel ID */
  hotelId?: number;

  /** Filter by booking status */
  bookingStatus?: QloAppsBookingStatusCode;

  /** Filter by date from (YYYY-MM-DD) */
  dateFrom?: string;

  /** Filter by date to (YYYY-MM-DD) */
  dateTo?: string;

  /** Filter by modified since (ISO 8601 datetime) */
  modifiedSince?: string;

  /** Maximum results to return */
  limit?: number;

  /** Offset for pagination */
  offset?: number;

  /** Display mode: 'full' for all fields */
  display?: 'full' | string[];
}

/**
 * Parameters for fetching room types
 */
export interface GetRoomTypesParams {
  /** Filter by hotel ID */
  hotelId?: number;

  /** Filter by active status */
  active?: boolean;

  /** Maximum results to return */
  limit?: number;

  /** Offset for pagination */
  offset?: number;
}

/**
 * Parameters for fetching customers
 */
export interface GetCustomersParams {
  /** Filter by email */
  email?: string;

  /** Filter by active status */
  active?: boolean;

  /** Maximum results to return */
  limit?: number;

  /** Offset for pagination */
  offset?: number;
}

// ============================================================================
// Availability Types
// ============================================================================

/**
 * Availability update for a date range
 */
export interface QloAppsAvailabilityUpdate {
  /** Room type ID */
  roomTypeId: number;

  /** Date (YYYY-MM-DD) */
  date: string;

  /** Number of rooms available */
  quantity: number;
}

/**
 * Rate update for a date range
 */
export interface QloAppsRateUpdate {
  /** Room type ID */
  roomTypeId: number;

  /** Date (YYYY-MM-DD) */
  date: string;

  /** Price for this date */
  price: number;

  /** Minimum stay requirement */
  minStay?: number;

  /** Maximum stay limit */
  maxStay?: number;

  /** Close to arrival (CTA) */
  closedToArrival?: boolean;

  /** Close to departure (CTD) */
  closedToDeparture?: boolean;
}

// ============================================================================
// Sync Result Types
// ============================================================================

/**
 * Result of a sync operation
 */
export interface QloAppsSyncResult {
  /** Whether sync completed successfully */
  success: boolean;

  /** Type of sync performed */
  syncType: string;

  /** Total items processed */
  processedCount: number;

  /** Items created */
  createdCount: number;

  /** Items updated */
  updatedCount: number;

  /** Items skipped (no changes) */
  skippedCount: number;

  /** Items that failed */
  failedCount: number;

  /** Error messages for failed items */
  errors: string[];

  /** Duration in milliseconds */
  durationMs: number;

  /** When sync started */
  startedAt: Date;

  /** When sync completed */
  completedAt: Date;
}

// ============================================================================
// Connection Test Types
// ============================================================================

/**
 * Result of testing QloApps connection
 */
export interface QloAppsConnectionTestResult {
  /** Whether connection was successful */
  success: boolean;

  /** Human-readable message */
  message: string;

  /** Hotel name from QloApps */
  hotelName?: string;

  /** QloApps version */
  version?: string;

  /** Available API resources */
  availableResources?: string[];

  /** Response time in milliseconds */
  responseTimeMs?: number;

  /** Error details if failed */
  error?: string;
}

// ============================================================================
// Request Options Types
// ============================================================================

/**
 * Options for API requests
 */
export interface QloAppsRequestOptions {
  /** HTTP method */
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

  /** Request headers */
  headers?: Record<string, string>;

  /** Request body */
  body?: unknown;

  /** Query parameters */
  query?: Record<string, string | number | boolean | string[] | undefined>;

  /** Request timeout override */
  timeout?: number;

  /** Skip rate limiting check */
  skipRateLimit?: boolean;
}

/**
 * Rate limit information from response headers
 */
export interface QloAppsRateLimitInfo {
  /** Maximum requests allowed */
  limit: number;

  /** Remaining requests in window */
  remaining: number;

  /** Seconds until window resets */
  resetsIn: number;
}
