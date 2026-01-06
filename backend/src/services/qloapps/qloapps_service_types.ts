/**
 * QloApps Service Types
 *
 * TypeScript interfaces for QloApps API request/response types.
 */

// =============================================================================
// Configuration Types
// =============================================================================

/**
 * Request to save/update QloApps configuration
 */
export interface SaveQloAppsConfigRequest {
  baseUrl: string;
  apiKey: string;
  qloAppsHotelId: number;
  syncIntervalMinutes?: number;
  syncEnabled?: boolean;
  syncReservationsInbound?: boolean;
  syncReservationsOutbound?: boolean;
  syncAvailability?: boolean;
  syncRates?: boolean;
}

/**
 * Request to update existing QloApps configuration
 */
export interface UpdateQloAppsConfigRequest {
  syncIntervalMinutes?: number;
  syncEnabled?: boolean;
  syncReservationsInbound?: boolean;
  syncReservationsOutbound?: boolean;
  syncAvailability?: boolean;
  syncRates?: boolean;
}

/**
 * QloApps configuration response
 */
export interface QloAppsConfigResponse {
  configured: boolean;
  baseUrl?: string;
  qloAppsHotelId?: number;
  syncIntervalMinutes?: number;
  syncEnabled?: boolean;
  syncReservationsInbound?: boolean;
  syncReservationsOutbound?: boolean;
  syncAvailability?: boolean;
  syncRates?: boolean;
  lastSuccessfulSync?: Date | null;
  lastSyncError?: string | null;
  consecutiveFailures?: number;
  circuitState?: 'closed' | 'open' | 'half_open';
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * Connection test response
 */
export interface ConnectionTestResponse {
  success: boolean;
  message: string;
  hotelName?: string;
  roomTypesCount?: number;
  timestamp: Date;
}

// =============================================================================
// Sync Types
// =============================================================================

/**
 * Manual sync trigger request
 */
export interface TriggerSyncRequest {
  syncType: 'full' | 'reservations_inbound' | 'reservations_outbound' | 'room_types' | 'availability' | 'rates';
  options?: {
    since?: string; // ISO date string
    force?: boolean;
  };
}

/**
 * Sync status response
 */
export interface SyncStatusResponse {
  isRunning: boolean;
  currentSyncType?: string;
  lastSync?: {
    type: string;
    status: 'completed' | 'failed';
    startedAt: Date;
    completedAt: Date;
    itemsProcessed: number;
    itemsCreated: number;
    itemsUpdated: number;
    itemsFailed: number;
    durationMs: number;
    error?: string;
  };
  nextScheduledSync?: Date;
  queuedSyncs: number;
}

/**
 * Sync result response
 */
export interface SyncResultResponse {
  success: boolean;
  syncType: string;
  message: string;
  result?: {
    itemsProcessed: number;
    itemsCreated: number;
    itemsUpdated: number;
    itemsFailed: number;
    durationMs: number;
    errors?: string[];
  };
  startedAt: Date;
}

// =============================================================================
// Mapping Types
// =============================================================================

/**
 * Room type mapping request
 */
export interface CreateRoomTypeMappingRequest {
  localRoomTypeId: string;
  qloAppsProductId: number;
  syncDirection?: 'inbound' | 'outbound' | 'bidirectional';
}

/**
 * Room type mapping response
 */
export interface RoomTypeMappingResponse {
  id: string;
  localRoomTypeId: string;
  localRoomTypeName: string;
  qloAppsProductId: number;
  qloAppsProductName?: string;
  qloAppsHotelId: number;
  syncDirection: string;
  isActive: boolean;
  lastSyncedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Unmapped items response
 */
export interface UnmappedItemsResponse {
  pmsRoomTypes: Array<{
    id: string;
    name: string;
    roomType: string;
    basePrice: number;
  }>;
  qloAppsRoomTypes: Array<{
    id: number;
    name: string;
    price: number;
    maxAdults: number;
    maxChildren: number;
  }>;
}

/**
 * Reservation mapping response
 */
export interface ReservationMappingResponse {
  id: string;
  localReservationId: string;
  qloAppsOrderId: number;
  qloAppsBookingId?: number;
  source: string;
  qloAppsChannel?: string;
  hasConflict: boolean;
  lastSyncedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Customer mapping response
 */
export interface CustomerMappingResponse {
  id: string;
  localGuestId: string;
  localGuestName: string;
  localGuestEmail?: string;
  qloAppsCustomerId: number;
  matchMethod: string;
  confidenceScore: number;
  createdAt: Date;
  updatedAt: Date;
}

// =============================================================================
// Sync Logs Types
// =============================================================================

/**
 * Sync log query parameters (from Express query string - all values are strings)
 */
export interface SyncLogQueryParams {
  syncType?: string;
  direction?: string;
  entityType?: string;
  success?: string;
  startDate?: string;
  endDate?: string;
  limit?: string;
  offset?: string;
}

/**
 * Sync log entry response
 */
export interface SyncLogEntryResponse {
  id: string;
  syncStateId?: string;
  syncType: string;
  direction: string;
  entityType: string;
  localEntityId?: string;
  qloAppsEntityId?: number;
  operation: string;
  success: boolean;
  errorMessage?: string;
  durationMs?: number;
  createdAt: Date;
}

/**
 * Sync logs paginated response
 */
export interface SyncLogsResponse {
  logs: SyncLogEntryResponse[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

// =============================================================================
// Health Check Types
// =============================================================================

/**
 * QloApps health status response
 */
export interface QloAppsHealthResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  configured: boolean;
  connected: boolean;
  lastSuccessfulSync?: Date;
  consecutiveFailures: number;
  circuitState: 'closed' | 'open' | 'half_open';
  syncEnabled: boolean;
  details?: {
    apiResponseTime?: number;
    pendingInbound?: number;
    pendingOutbound?: number;
    lastError?: string;
  };
}

// =============================================================================
// Auto-mapping Types
// =============================================================================

/**
 * Auto-mapping suggestion
 */
export interface MappingSuggestion {
  pmsRoomType: {
    id: string;
    name: string;
    basePrice: number;
  };
  qloAppsRoomType: {
    id: number;
    name: string;
    price: number;
  };
  confidence: number;
  matchReason: string;
}

/**
 * Auto-mapping suggestions response
 */
export interface AutoMappingSuggestionsResponse {
  suggestions: MappingSuggestion[];
  unmappedPms: number;
  unmappedQloApps: number;
}

/**
 * Apply auto-mapping request
 */
export interface ApplyAutoMappingRequest {
  mappings: Array<{
    localRoomTypeId: string;
    qloAppsProductId: number;
  }>;
}

// =============================================================================
// Error Response Type
// =============================================================================

/**
 * Standard error response
 */
export interface ErrorResponse {
  error: string;
  code?: string;
  details?: Record<string, unknown>;
}
