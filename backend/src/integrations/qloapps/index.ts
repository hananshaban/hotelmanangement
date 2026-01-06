/**
 * QloApps Integration - Main exports
 *
 * This module provides the complete QloApps Channel Manager integration,
 * including the API client, types, errors, and configuration.
 *
 * Usage:
 * ```typescript
 * import { QloAppsClient, QLOAPPS_CONFIG } from './integrations/qloapps';
 *
 * const client = new QloAppsClient({
 *   baseUrl: 'https://your-hotel.qloapps.com',
 *   apiKey: 'your-api-key',
 *   hotelId: 1,
 * });
 *
 * // Test connection
 * const result = await client.testConnection();
 *
 * // Get bookings
 * const bookings = await client.getBookings({ dateFrom: '2026-01-01' });
 * ```
 */

// Client
export { QloAppsClient } from './qloapps_client.js';

// Configuration
export { QLOAPPS_CONFIG } from './qloapps_config.js';
export type {
  QloAppsBookingStatus,
  QloAppsPaymentStatus,
  QloAppsSyncType,
  QloAppsErrorCode,
  QloAppsEndpoint,
} from './qloapps_config.js';

// Types
export type {
  // Configuration types
  QloAppsConnectionConfig,
  QloAppsStoredConfig,
  // Room type types
  QloAppsRoomType,
  QloAppsRoomFeature,
  QloAppsRoomTypeCreateRequest,
  QloAppsRoomTypeUpdateRequest,
  // Customer types
  QloAppsCustomer,
  QloAppsAddress,
  QloAppsCustomerCreateRequest,
  QloAppsCustomerUpdateRequest,
  // Booking types
  QloAppsBookingStatusCode,
  QloAppsPaymentStatusCode,
  QloAppsBooking,
  QloAppsBookingRoomType,
  QloAppsOccupancy,
  QloAppsBookingCustomer,
  QloAppsBookingCreateRequest,
  QloAppsBookingRoomTypeRequest,
  QloAppsBookingUpdateRequest,
  // Response types
  QloAppsListResponse,
  QloAppsSingleResponse,
  QloAppsCreateResponse,
  QloAppsErrorResponse,
  // Query types
  GetBookingsParams,
  GetRoomTypesParams,
  GetCustomersParams,
  // Availability types
  QloAppsAvailabilityUpdate,
  QloAppsRateUpdate,
  // Sync types
  QloAppsSyncResult,
  // Connection test types
  QloAppsConnectionTestResult,
  // Request types
  QloAppsRequestOptions,
  QloAppsRateLimitInfo,
} from './qloapps_types.js';

// Errors
export {
  QloAppsError,
  QloAppsAuthenticationError,
  QloAppsRateLimitError,
  QloAppsNetworkError,
  QloAppsTimeoutError,
  QloAppsValidationError,
  QloAppsNotFoundError,
  QloAppsApiError,
  QloAppsCircuitBreakerError,
  QloAppsConfigurationError,
  QloAppsMappingError,
  QloAppsSyncError,
  createQloAppsError,
  isQloAppsError,
  isRetryableError,
} from './qloapps_errors.js';

// Mappers
export * from './mappers/index.js';

// Services
export { QloAppsPullSyncService } from './services/pull_sync_service.js';
export { QloAppsPushSyncService } from './services/push_sync_service.js';
export { QloAppsAvailabilitySyncService } from './services/availability_sync_service.js';
export { QloAppsRateSyncService } from './services/rate_sync_service.js';

// Queue
export {
  // Topology
  QLOAPPS_EXCHANGE_NAME,
  QLOAPPS_QUEUE_NAMES,
  QLOAPPS_ROUTING_KEYS,
  setupQloAppsTopology,
  initQloAppsTopology,
  // Publisher
  qloAppsPublisher,
  queueQloAppsInboundSync,
  queueQloAppsReservationSync,
  queueQloAppsAvailabilitySync,
  queueQloAppsRateSync,
  // Consumer base
  QloAppsBaseConsumer,
} from './queue/index.js';

// Message types
export type {
  QloAppsInboundMessage,
  QloAppsOutboundReservationMessage,
  QloAppsOutboundAvailabilityMessage,
  QloAppsOutboundRateMessage,
} from './queue/rabbitmq_topology.js';

// Workers
export {
  QloAppsInboundWorker,
  startQloAppsInboundWorker,
  stopQloAppsInboundWorker,
  QloAppsOutboundWorker,
  startQloAppsOutboundWorker,
  stopQloAppsOutboundWorker,
} from './workers/index.js';

// Hooks
export {
  queueQloAppsReservationSyncHook,
  queueQloAppsReservationCancelHook,
  queueQloAppsAvailabilitySyncHook,
  queueQloAppsReservationAvailabilitySyncHook,
  queueQloAppsRateSyncHook,
  queueQloAppsRoomTypeSyncHook,
  queueQloAppsFullSyncHook,
} from './hooks/index.js';
