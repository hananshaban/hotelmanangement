/**
 * Channel Manager Strategy Pattern Types
 * 
 * Simplified types for the incremental approach (QloApps only).
 * These interfaces can be extended when adding more channel managers.
 */

// ============================================================================
// Configuration Types
// ============================================================================

export type ChannelManagerName = 'beds24' | 'qloapps';

export interface ChannelManagerConfig {
  name: ChannelManagerName;
  displayName: string;
  enabled: boolean;
  syncEnabled: boolean;
}

// ============================================================================
// Sync Operation Types
// ============================================================================

export interface SyncReservationInput {
  reservationId: string;
  action: 'create' | 'update' | 'cancel';
}

export interface SyncAvailabilityInput {
  roomTypeId: string;
  dateFrom: string;
  dateTo: string;
}

export interface SyncRatesInput {
  roomTypeId: string;
  dateFrom: string;
  dateTo: string;
}

// ============================================================================
// Result Types
// ============================================================================

export interface SyncResult {
  success: boolean;
  operationType: 'reservation' | 'availability' | 'rates';
  itemsProcessed: number;
  duration: number;
  error?: string;
}

export interface ConnectionTestResult {
  success: boolean;
  message: string;
  latency?: number;
}

// ============================================================================
// Strategy Interface
// ============================================================================

/**
 * Core interface that channel manager strategies must implement.
 * Currently only QloApps implements this; Beds24 uses direct integration.
 */
export interface IChannelManagerStrategy {
  /**
   * Get the strategy name (e.g., 'qloapps')
   */
  getName(): ChannelManagerName;

  /**
   * Get the display name for UI
   */
  getDisplayName(): string;

  /**
   * Initialize the strategy (called on app startup)
   */
  initialize(): Promise<void>;

  /**
   * Check if the strategy is enabled (config exists and sync_enabled=true)
   */
  isEnabled(): Promise<boolean>;

  /**
   * Test connection to the channel manager
   */
  testConnection(): Promise<ConnectionTestResult>;

  /**
   * Sync a reservation to the channel manager
   */
  syncReservation(input: SyncReservationInput): Promise<SyncResult>;

  /**
   * Sync availability to the channel manager
   */
  syncAvailability(input: SyncAvailabilityInput): Promise<SyncResult>;

  /**
   * Sync rates to the channel manager
   */
  syncRates(input: SyncRatesInput): Promise<SyncResult>;
}

// ============================================================================
// Service Types
// ============================================================================

export interface ChannelManagerStatus {
  active: ChannelManagerName;
  available: ChannelManagerName[];
  beds24: {
    configured: boolean;
    syncEnabled: boolean;
  };
  qloapps: {
    configured: boolean;
    syncEnabled: boolean;
  };
}
