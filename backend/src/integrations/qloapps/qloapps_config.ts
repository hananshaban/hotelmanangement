/**
 * QloApps API Configuration
 *
 * Configuration constants and defaults for QloApps Channel Manager integration.
 * QloApps is a PrestaShop-based hotel management system with WebService API.
 */

export const QLOAPPS_CONFIG = {
  // ============================================================================
  // API Defaults
  // ============================================================================

  /** Default request timeout in milliseconds */
  DEFAULT_TIMEOUT_MS: 30000, // 30 seconds

  /** Maximum retry attempts for failed requests */
  MAX_RETRIES: 3,

  /** Initial delay between retries in milliseconds */
  RETRY_INITIAL_DELAY_MS: 1000, // 1 second

  /** Maximum delay between retries in milliseconds */
  RETRY_MAX_DELAY_MS: 10000, // 10 seconds

  /** Backoff multiplier for exponential retry */
  RETRY_BACKOFF_MULTIPLIER: 2,

  // ============================================================================
  // Rate Limiting
  // ============================================================================

  /** Maximum requests per time window */
  RATE_LIMIT_MAX_REQUESTS: 60,

  /** Rate limit window in milliseconds */
  RATE_LIMIT_WINDOW_MS: 60 * 1000, // 1 minute

  // ============================================================================
  // Circuit Breaker
  // ============================================================================

  CIRCUIT_BREAKER: {
    /** Number of consecutive failures before opening circuit */
    FAILURE_THRESHOLD: 5,

    /** Time to wait before trying again after circuit opens (ms) */
    RESET_TIMEOUT_MS: 60 * 1000, // 1 minute

    /** Number of test requests allowed in half-open state */
    HALF_OPEN_MAX_REQUESTS: 3,
  },

  // ============================================================================
  // Sync Configuration
  // ============================================================================

  /** Default sync interval in minutes */
  DEFAULT_SYNC_INTERVAL_MINUTES: 15,

  /** Minimum allowed sync interval in minutes */
  MIN_SYNC_INTERVAL_MINUTES: 5,

  /** Maximum allowed sync interval in minutes */
  MAX_SYNC_INTERVAL_MINUTES: 60,

  // ============================================================================
  // Batch Sizes
  // ============================================================================

  /** Maximum bookings to fetch per API call */
  BOOKING_BATCH_SIZE: 50,

  /** Maximum room types to process per sync */
  ROOM_TYPE_BATCH_SIZE: 20,

  /** Maximum customers to process per sync */
  CUSTOMER_BATCH_SIZE: 50,

  // ============================================================================
  // Date Ranges
  // ============================================================================

  /** How many days in the future to sync availability */
  AVAILABILITY_FUTURE_DAYS: 365,

  /** How many days in the future to sync rates */
  RATE_FUTURE_DAYS: 365,

  /** How many days back to look for modified bookings */
  BOOKING_LOOKBACK_DAYS: 7,

  /** How many days in the future to look for bookings */
  BOOKING_FUTURE_DAYS: 365,

  // ============================================================================
  // QloApps Booking Status Codes
  // ============================================================================

  /**
   * QloApps uses numeric status codes for bookings.
   * These map to different stages of the booking lifecycle.
   */
  BOOKING_STATUS: {
    /** New booking awaiting confirmation */
    NEW: 1,
    /** Booking completed (confirmed or checked out) */
    COMPLETED: 2,
    /** Booking cancelled */
    CANCELLED: 3,
    /** Booking refunded */
    REFUNDED: 4,
  } as const,

  // ============================================================================
  // QloApps Payment Status Codes
  // ============================================================================

  PAYMENT_STATUS: {
    /** Payment completed in full */
    COMPLETED: 1,
    /** Partial payment received */
    PARTIAL: 2,
    /** Awaiting payment */
    AWAITING: 3,
  } as const,

  // ============================================================================
  // PMS Status Mapping
  // ============================================================================

  /**
   * Maps PMS reservation status to QloApps booking status.
   * Used when pushing reservations from PMS to QloApps.
   */
  PMS_TO_QLOAPPS_STATUS: {
    confirmed: 1, // NEW
    pending: 1, // NEW
    'checked-in': 2, // COMPLETED
    'checked-out': 2, // COMPLETED
    cancelled: 3, // CANCELLED
    'no-show': 3, // CANCELLED
  } as const,

  /**
   * Maps QloApps booking status to PMS reservation status.
   * Used when pulling bookings from QloApps to PMS.
   */
  QLOAPPS_TO_PMS_STATUS: {
    1: 'confirmed', // NEW -> confirmed
    2: 'checked-out', // COMPLETED -> checked-out
    3: 'cancelled', // CANCELLED -> cancelled
    4: 'cancelled', // REFUNDED -> cancelled (with refund flag)
  } as const,

  // ============================================================================
  // API Endpoints
  // ============================================================================

  /**
   * QloApps WebService API endpoints.
   * These follow PrestaShop's WebService structure.
   */
  ENDPOINTS: {
    /** Root endpoint - lists available resources */
    ROOT: '/api/',
    /** Room Bookings endpoint (use this instead of bookings for complete data) */
    ROOM_BOOKINGS: '/api/room_bookings',
    /** Bookings/Orders endpoint (legacy - use room_bookings instead) */
    BOOKINGS: '/api/bookings',
    /** Room Types (Products) endpoint */
    ROOM_TYPES: '/api/room_types',
    /** Customers endpoint */
    CUSTOMERS: '/api/customers',
    /** Hotels endpoint */
    HOTELS: '/api/hotels',
    /** Hotel booking details */
    HOTEL_BOOKING_DETAIL: '/api/hotel_booking_detail',
    /** Room information/inventory */
    HOTEL_ROOM_INFORMATION: '/api/hotel_room_information',
  } as const,

  // ============================================================================
  // API Headers
  // ============================================================================

  /**
   * Headers for QloApps API requests.
   */
  HEADERS: {
    /** Request JSON response format instead of XML */
    OUTPUT_FORMAT: 'Output-Format',
    /** Content type for POST/PUT requests */
    CONTENT_TYPE: 'Content-Type',
  } as const,

  // ============================================================================
  // Sync Types
  // ============================================================================

  /**
   * Types of sync operations for tracking and logging.
   */
  SYNC_TYPES: {
    ROOM_TYPES_PULL: 'qloapps_room_types_pull',
    ROOM_TYPES_PUSH: 'qloapps_room_types_push',
    RESERVATIONS_PULL: 'qloapps_reservations_pull',
    RESERVATIONS_PUSH: 'qloapps_reservations_push',
    AVAILABILITY_PUSH: 'qloapps_availability_push',
    RATES_PUSH: 'qloapps_rates_push',
    CUSTOMERS_PULL: 'qloapps_customers_pull',
    CUSTOMERS_PUSH: 'qloapps_customers_push',
    FULL_SYNC: 'qloapps_full_sync',
  } as const,

  // ============================================================================
  // Sync Options
  // ============================================================================

  /**
   * Configuration options for sync operations.
   */
  SYNC_OPTIONS: {
    /** Always fetch individual bookings for complete data (slower but more reliable) */
    ALWAYS_ENRICH_BOOKINGS: true,
    /** Maximum concurrent enrichment requests */
    MAX_CONCURRENT_ENRICHMENT: 5,
  } as const,

  // ============================================================================
  // Error Codes
  // ============================================================================

  /**
   * Custom error codes for QloApps integration.
   */
  ERROR_CODES: {
    AUTHENTICATION_ERROR: 'QLOAPPS_AUTH_ERROR',
    RATE_LIMIT_ERROR: 'QLOAPPS_RATE_LIMIT',
    NETWORK_ERROR: 'QLOAPPS_NETWORK_ERROR',
    VALIDATION_ERROR: 'QLOAPPS_VALIDATION_ERROR',
    NOT_FOUND_ERROR: 'QLOAPPS_NOT_FOUND',
    API_ERROR: 'QLOAPPS_API_ERROR',
    CIRCUIT_BREAKER_OPEN: 'QLOAPPS_CIRCUIT_OPEN',
    CONFIGURATION_ERROR: 'QLOAPPS_CONFIG_ERROR',
    MAPPING_ERROR: 'QLOAPPS_MAPPING_ERROR',
    SYNC_ERROR: 'QLOAPPS_SYNC_ERROR',
  } as const,
} as const;

// ============================================================================
// Type exports for configuration values
// ============================================================================

export type QloAppsBookingStatus =
  (typeof QLOAPPS_CONFIG.BOOKING_STATUS)[keyof typeof QLOAPPS_CONFIG.BOOKING_STATUS];

export type QloAppsPaymentStatus =
  (typeof QLOAPPS_CONFIG.PAYMENT_STATUS)[keyof typeof QLOAPPS_CONFIG.PAYMENT_STATUS];

export type QloAppsSyncType =
  (typeof QLOAPPS_CONFIG.SYNC_TYPES)[keyof typeof QLOAPPS_CONFIG.SYNC_TYPES];

export type QloAppsErrorCode =
  (typeof QLOAPPS_CONFIG.ERROR_CODES)[keyof typeof QLOAPPS_CONFIG.ERROR_CODES];

export type QloAppsEndpoint =
  (typeof QLOAPPS_CONFIG.ENDPOINTS)[keyof typeof QLOAPPS_CONFIG.ENDPOINTS];
