/**
 * QloApps Routes
 *
 * Express router for QloApps integration API endpoints.
 * All routes require authentication and appropriate role.
 */

import { Router } from 'express';
import { authenticateToken, requireRole } from '../auth/auth_middleware.js';
import {
  // Configuration
  getConfigHandler,
  saveConfigHandler,
  updateConfigHandler,
  deleteConfigHandler,
  testConnectionHandler,

  // Sync
  triggerSyncHandler,
  getSyncStatusHandler,

  // Room Type Mappings
  getRoomTypeMappingsHandler,
  getUnmappedRoomTypesHandler,
  createRoomTypeMappingHandler,
  deleteRoomTypeMappingHandler,
  getMappingSuggestionsHandler,
  applyMappingSuggestionsHandler,

  // Reservation Mappings
  getReservationMappingsHandler,
  getConflictedReservationsHandler,
  resolveConflictHandler,

  // Customer Mappings
  getCustomerMappingsHandler,

  // Sync Logs
  getSyncLogsHandler,
  getRecentErrorsHandler,

  // Health
  getHealthHandler,
} from './qloapps_controller.js';

const router = Router();

// All routes require authentication
router.use(authenticateToken);

// =============================================================================
// Configuration Routes
// =============================================================================

/**
 * GET /api/v1/qloapps/config
 * Get current QloApps configuration
 */
router.get(
  '/config',
  requireRole('ADMIN', 'SUPER_ADMIN'),
  getConfigHandler
);

/**
 * POST /api/v1/qloapps/config
 * Save QloApps configuration (create or update)
 */
router.post(
  '/config',
  requireRole('ADMIN', 'SUPER_ADMIN'),
  saveConfigHandler
);

/**
 * PUT /api/v1/qloapps/config
 * Update QloApps configuration (partial update)
 */
router.put(
  '/config',
  requireRole('ADMIN', 'SUPER_ADMIN'),
  updateConfigHandler
);

/**
 * DELETE /api/v1/qloapps/config
 * Delete QloApps configuration
 */
router.delete(
  '/config',
  requireRole('SUPER_ADMIN'),
  deleteConfigHandler
);

/**
 * POST /api/v1/qloapps/test-connection
 * Test connection to QloApps API
 */
router.post(
  '/test-connection',
  requireRole('ADMIN', 'SUPER_ADMIN'),
  testConnectionHandler
);

// =============================================================================
// Sync Routes
// =============================================================================

/**
 * POST /api/v1/qloapps/sync
 * Trigger a manual sync operation
 */
router.post(
  '/sync',
  requireRole('ADMIN', 'SUPER_ADMIN'),
  triggerSyncHandler
);

/**
 * GET /api/v1/qloapps/sync/status
 * Get current sync status
 */
router.get(
  '/sync/status',
  requireRole('ADMIN', 'SUPER_ADMIN'),
  getSyncStatusHandler
);

// =============================================================================
// Room Type Mapping Routes
// =============================================================================

/**
 * GET /api/v1/qloapps/mappings/room-types
 * Get all room type mappings
 */
router.get(
  '/mappings/room-types',
  requireRole('ADMIN', 'SUPER_ADMIN'),
  getRoomTypeMappingsHandler
);

/**
 * GET /api/v1/qloapps/mappings/room-types/unmapped
 * Get unmapped room types from both PMS and QloApps
 */
router.get(
  '/mappings/room-types/unmapped',
  requireRole('ADMIN', 'SUPER_ADMIN'),
  getUnmappedRoomTypesHandler
);

/**
 * GET /api/v1/qloapps/mappings/room-types/suggestions
 * Get auto-mapping suggestions for room types
 */
router.get(
  '/mappings/room-types/suggestions',
  requireRole('ADMIN', 'SUPER_ADMIN'),
  getMappingSuggestionsHandler
);

/**
 * POST /api/v1/qloapps/mappings/room-types
 * Create a room type mapping
 */
router.post(
  '/mappings/room-types',
  requireRole('ADMIN', 'SUPER_ADMIN'),
  createRoomTypeMappingHandler
);

/**
 * POST /api/v1/qloapps/mappings/room-types/apply-suggestions
 * Apply multiple room type mappings at once
 */
router.post(
  '/mappings/room-types/apply-suggestions',
  requireRole('ADMIN', 'SUPER_ADMIN'),
  applyMappingSuggestionsHandler
);

/**
 * DELETE /api/v1/qloapps/mappings/room-types/:id
 * Delete a room type mapping
 */
router.delete(
  '/mappings/room-types/:id',
  requireRole('ADMIN', 'SUPER_ADMIN'),
  deleteRoomTypeMappingHandler
);

// =============================================================================
// Reservation Mapping Routes
// =============================================================================

/**
 * GET /api/v1/qloapps/mappings/reservations
 * Get reservation mappings with pagination
 */
router.get(
  '/mappings/reservations',
  requireRole('ADMIN', 'SUPER_ADMIN'),
  getReservationMappingsHandler
);

/**
 * GET /api/v1/qloapps/mappings/reservations/conflicts
 * Get reservation mappings with conflicts
 */
router.get(
  '/mappings/reservations/conflicts',
  requireRole('ADMIN', 'SUPER_ADMIN'),
  getConflictedReservationsHandler
);

/**
 * POST /api/v1/qloapps/mappings/reservations/:id/resolve-conflict
 * Resolve a reservation conflict
 */
router.post(
  '/mappings/reservations/:id/resolve-conflict',
  requireRole('ADMIN', 'SUPER_ADMIN'),
  resolveConflictHandler
);

// =============================================================================
// Customer Mapping Routes
// =============================================================================

/**
 * GET /api/v1/qloapps/mappings/customers
 * Get customer mappings with pagination
 */
router.get(
  '/mappings/customers',
  requireRole('ADMIN', 'SUPER_ADMIN'),
  getCustomerMappingsHandler
);

// =============================================================================
// Sync Logs Routes
// =============================================================================

/**
 * GET /api/v1/qloapps/sync-logs
 * Get sync logs with pagination and filters
 */
router.get(
  '/sync-logs',
  requireRole('ADMIN', 'SUPER_ADMIN'),
  getSyncLogsHandler
);

/**
 * GET /api/v1/qloapps/sync-logs/errors
 * Get recent sync errors
 */
router.get(
  '/sync-logs/errors',
  requireRole('ADMIN', 'SUPER_ADMIN'),
  getRecentErrorsHandler
);

// =============================================================================
// Health Check Routes
// =============================================================================

/**
 * GET /api/v1/qloapps/health
 * Get QloApps integration health status
 */
router.get(
  '/health',
  requireRole('ADMIN', 'SUPER_ADMIN', 'MANAGER'),
  getHealthHandler
);

export { router as qloAppsRoutes };
