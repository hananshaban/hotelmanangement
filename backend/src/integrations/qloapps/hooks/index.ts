/**
 * QloApps Hooks Module
 *
 * Export all sync hooks for easy import.
 */

export {
  queueQloAppsReservationSyncHook,
  queueQloAppsReservationCancelHook,
  queueQloAppsAvailabilitySyncHook,
  queueQloAppsReservationAvailabilitySyncHook,
  queueQloAppsRateSyncHook,
  queueQloAppsRoomTypeSyncHook,
  queueQloAppsFullSyncHook,
} from './sync_hooks.js';
