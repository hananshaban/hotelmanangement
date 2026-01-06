/**
 * QloApps Services Index
 *
 * Central export point for all QloApps sync services.
 */

// Guest Matching Service
export {
  QloAppsGuestMatchingService,
  type GuestMatchResult,
  type GuestMatchOptions,
} from './guest_matching_service.js';

// Pull Sync Service
export {
  QloAppsPullSyncService,
  type BookingSyncResult,
  type PullSyncOptions,
} from './pull_sync_service.js';

// Push Sync Service
export {
  QloAppsPushSyncService,
  type ReservationPushResult,
  type PushSyncOptions,
} from './push_sync_service.js';

// Availability Sync Service
export {
  QloAppsAvailabilitySyncService,
  type RoomTypeAvailabilitySyncResult,
  type AvailabilitySyncOptions,
} from './availability_sync_service.js';

// Rate Sync Service
export {
  QloAppsRateSyncService,
  type RoomTypeRateSyncResult,
  type RateSyncOptions,
} from './rate_sync_service.js';

// Room Type Sync Service
export {
  QloAppsRoomTypeSyncService,
  type RoomTypeSyncResult,
  type RoomTypeMappingProposal,
  type RoomTypeSyncOptions,
} from './room_type_sync_service.js';

// Conflict Resolution Service
export {
  ConflictResolutionService,
  createConflictResolutionService,
  getConflictResolutionService,
  type SyncConflict,
  type ConflictResolution,
  type ConflictResolutionResult,
  type ConflictResolutionConfig,
  type ConflictResolutionStrategy,
  type ConflictEntityType,
  type ConflictStatus,
  type ConflictDetectionOptions,
} from './conflict_resolution_service.js';
