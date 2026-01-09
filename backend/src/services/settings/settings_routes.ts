import { Router } from 'express';
import { authenticateToken, requireRole } from '../auth/auth_middleware.js';
import {
  getHotelSettingsHandler,
  updateHotelSettingsHandler,
  clearAllDataHandler,
} from './settings_controller.js';
import {
  getBeds24ConfigHandler,
  authenticateBeds24Handler,
  updateBeds24ConfigHandler,
  testBeds24ConnectionHandler,
  triggerInitialSyncHandler,
} from './beds24_controller.js';
import {
  getBeds24RoomsHandler,
  getUnmappedBeds24RoomsHandler,
  getPmsRoomsWithMappingHandler,
  mapRoomHandler,
  unmapRoomHandler,
  autoCreateRoomsHandler,
} from './beds24_rooms_controller.js';
import {
  getChannelManagerStatusHandler,
  switchChannelManagerHandler,
  testQloAppsConnectionHandler,
  setupQloAppsConnectionHandler,
} from './channel_manager_controller.js';

const router = Router();

// All routes require authentication
router.use(authenticateToken);

// Hotel settings routes
router.get('/settings', getHotelSettingsHandler);
router.put(
  '/settings',
  requireRole('ADMIN', 'SUPER_ADMIN', 'MANAGER'),
  updateHotelSettingsHandler,
);

// Beds24 configuration routes
router.get(
  '/settings/beds24',
  requireRole('ADMIN', 'SUPER_ADMIN'),
  getBeds24ConfigHandler,
);
router.post(
  '/settings/beds24/authenticate',
  requireRole('ADMIN', 'SUPER_ADMIN'),
  authenticateBeds24Handler,
);
router.put(
  '/settings/beds24',
  requireRole('ADMIN', 'SUPER_ADMIN'),
  updateBeds24ConfigHandler,
);
router.post(
  '/settings/beds24/test',
  requireRole('ADMIN', 'SUPER_ADMIN'),
  testBeds24ConnectionHandler,
);
router.post(
  '/settings/beds24/initial-sync',
  requireRole('ADMIN', 'SUPER_ADMIN'),
  triggerInitialSyncHandler,
);

// Beds24 room mapping routes
router.get(
  '/settings/beds24/rooms',
  requireRole('ADMIN', 'SUPER_ADMIN'),
  getBeds24RoomsHandler,
);
router.get(
  '/settings/beds24/rooms/unmapped',
  requireRole('ADMIN', 'SUPER_ADMIN'),
  getUnmappedBeds24RoomsHandler,
);
router.get(
  '/settings/beds24/rooms/pms',
  requireRole('ADMIN', 'SUPER_ADMIN'),
  getPmsRoomsWithMappingHandler,
);
router.post(
  '/settings/beds24/rooms/map',
  requireRole('ADMIN', 'SUPER_ADMIN'),
  mapRoomHandler,
);
router.delete(
  '/settings/beds24/rooms/:roomId/map',
  requireRole('ADMIN', 'SUPER_ADMIN'),
  unmapRoomHandler,
);
router.post(
  '/settings/beds24/rooms/auto-create',
  requireRole('ADMIN', 'SUPER_ADMIN'),
  autoCreateRoomsHandler,
);

// ============================================================================
// Channel Manager Routes
// ============================================================================

// Get channel manager status (which is active, what's configured)
router.get(
  '/settings/channel-manager',
  requireRole('ADMIN', 'SUPER_ADMIN'),
  getChannelManagerStatusHandler,
);

// Switch active channel manager
router.post(
  '/settings/channel-manager/switch',
  requireRole('ADMIN', 'SUPER_ADMIN'),
  switchChannelManagerHandler,
);

// Test QloApps connection
router.post(
  '/settings/channel-manager/test-qloapps',
  requireRole('ADMIN', 'SUPER_ADMIN'),
  testQloAppsConnectionHandler,
);

// Setup QloApps configuration
router.post(
  '/settings/channel-manager/setup-qloapps',
  requireRole('ADMIN', 'SUPER_ADMIN'),
  setupQloAppsConnectionHandler,
);

// ============================================================================
// Data Management Routes
// ============================================================================

// Data management routes
router.post(
  '/settings/clear-all-data',
  requireRole('SUPER_ADMIN'), // Only SUPER_ADMIN can clear all data
  clearAllDataHandler,
);

export { router as settingsRoutes };

