/**
 * QloApps Controller
 *
 * HTTP request handlers for QloApps integration API endpoints.
 * Handles configuration, sync management, mappings, and monitoring.
 */

import type { Request, Response, NextFunction } from 'express';
import { QloAppsClient } from '../../integrations/qloapps/qloapps_client.js';
import {
  qloAppsConfigRepository,
  roomTypeMappingRepository,
  reservationMappingRepository,
  customerMappingRepository,
  syncStateRepository,
  syncLogRepository,
} from './qloapps_repository.js';
import type {
  SaveQloAppsConfigRequest,
  UpdateQloAppsConfigRequest,
  TriggerSyncRequest,
  CreateRoomTypeMappingRequest,
  SyncLogQueryParams,
} from './qloapps_service_types.js';

// =============================================================================
// Configuration Endpoints
// =============================================================================

/**
 * GET /api/v1/qloapps/config
 * Get current QloApps configuration
 */
export async function getConfigHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const config = await qloAppsConfigRepository.getConfig();

    if (!config) {
      res.json({
        configured: false,
        syncEnabled: false,
      });
      return;
    }

    // Don't send encrypted API key to frontend
    res.json({
      configured: true,
      baseUrl: config.base_url,
      qloAppsHotelId: config.qloapps_hotel_id,
      syncIntervalMinutes: config.sync_interval_minutes,
      syncEnabled: config.sync_enabled,
      syncReservationsInbound: config.sync_reservations_inbound,
      syncReservationsOutbound: config.sync_reservations_outbound,
      syncAvailability: config.sync_availability,
      syncRates: config.sync_rates,
      lastSuccessfulSync: config.last_successful_sync,
      lastSyncError: config.last_sync_error,
      consecutiveFailures: config.consecutive_failures,
      circuitState: config.circuit_state,
      createdAt: config.created_at,
      updatedAt: config.updated_at,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/v1/qloapps/config
 * Save QloApps configuration (create or update)
 */
export async function saveConfigHandler(
  req: Request<object, object, SaveQloAppsConfigRequest>,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { baseUrl, apiKey, qloAppsHotelId, ...options } = req.body;

    // Validate required fields
    if (!baseUrl || !apiKey || !qloAppsHotelId) {
      res.status(400).json({
        error: 'baseUrl, apiKey, and qloAppsHotelId are required',
      });
      return;
    }

    // Validate baseUrl format
    try {
      new URL(baseUrl);
    } catch {
      res.status(400).json({
        error: 'Invalid baseUrl format. Must be a valid URL.',
      });
      return;
    }

    // Test connection before saving
    const client = new QloAppsClient({
      baseUrl,
      apiKey,
      hotelId: qloAppsHotelId,
    });

    const connectionTest = await client.testConnection();
    if (!connectionTest.success) {
      res.status(400).json({
        error: `Connection test failed: ${connectionTest.message}`,
      });
      return;
    }

    // Save configuration
    const config = await qloAppsConfigRepository.saveConfig({
      baseUrl,
      apiKey,
      qloAppsHotelId,
      ...options,
    });

    res.json({
      success: true,
      message: 'QloApps configuration saved successfully',
      config: {
        configured: true,
        baseUrl: config.base_url,
        qloAppsHotelId: config.qloapps_hotel_id,
        syncIntervalMinutes: config.sync_interval_minutes,
        syncEnabled: config.sync_enabled,
        syncReservationsInbound: config.sync_reservations_inbound,
        syncReservationsOutbound: config.sync_reservations_outbound,
        syncAvailability: config.sync_availability,
        syncRates: config.sync_rates,
        hotelName: connectionTest.hotelName,
      },
    });
  } catch (error) {
    console.error('Error saving QloApps config:', error);
    res.status(400).json({
      error: error instanceof Error ? error.message : 'Failed to save configuration',
    });
  }
}

/**
 * PUT /api/v1/qloapps/config
 * Update QloApps configuration (partial update)
 */
export async function updateConfigHandler(
  req: Request<object, object, UpdateQloAppsConfigRequest>,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const config = await qloAppsConfigRepository.updateConfig(req.body);

    if (!config) {
      res.status(404).json({
        error: 'QloApps configuration not found. Please configure first.',
      });
      return;
    }

    res.json({
      success: true,
      config: {
        configured: true,
        baseUrl: config.base_url,
        qloAppsHotelId: config.qloapps_hotel_id,
        syncIntervalMinutes: config.sync_interval_minutes,
        syncEnabled: config.sync_enabled,
        syncReservationsInbound: config.sync_reservations_inbound,
        syncReservationsOutbound: config.sync_reservations_outbound,
        syncAvailability: config.sync_availability,
        syncRates: config.sync_rates,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * DELETE /api/v1/qloapps/config
 * Delete QloApps configuration
 */
export async function deleteConfigHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const deleted = await qloAppsConfigRepository.deleteConfig();

    if (!deleted) {
      res.status(404).json({
        error: 'QloApps configuration not found',
      });
      return;
    }

    res.json({
      success: true,
      message: 'QloApps configuration deleted',
    });
  } catch (error) {
    next(error);
  }
}

// =============================================================================
// Connection Test Endpoint
// =============================================================================

/**
 * POST /api/v1/qloapps/test-connection
 * Test connection to QloApps API
 */
export async function testConnectionHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const config = await qloAppsConfigRepository.getConfig();

    if (!config) {
      res.status(404).json({
        success: false,
        error: 'QloApps configuration not found',
      });
      return;
    }

    const apiKey = await qloAppsConfigRepository.getDecryptedApiKey();
    if (!apiKey) {
      res.status(500).json({
        success: false,
        error: 'Failed to decrypt API key',
      });
      return;
    }

    const client = new QloAppsClient({
      baseUrl: config.base_url,
      apiKey,
      hotelId: config.qloapps_hotel_id,
    });

    const startTime = Date.now();
    const result = await client.testConnection();
    const responseTime = Date.now() - startTime;

    if (result.success) {
      // Reset circuit breaker on successful connection
      await qloAppsConfigRepository.recordSyncSuccess();
    }

    res.json({
      success: result.success,
      message: result.message,
      hotelName: result.hotelName,
      responseTimeMs: responseTime,
      timestamp: new Date(),
    });
  } catch (error) {
    console.error('Connection test error:', error);
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'Connection test failed',
      timestamp: new Date(),
    });
  }
}

// =============================================================================
// Sync Endpoints
// =============================================================================

/**
 * POST /api/v1/qloapps/sync
 * Trigger a manual sync operation
 */
export async function triggerSyncHandler(
  req: Request<object, object, TriggerSyncRequest>,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { syncType, options } = req.body;

    if (!syncType) {
      res.status(400).json({
        error: 'syncType is required',
      });
      return;
    }

    // Validate sync type
    const validSyncTypes = ['full', 'reservations_inbound', 'reservations_outbound', 'room_types', 'availability', 'rates'];
    if (!validSyncTypes.includes(syncType)) {
      res.status(400).json({
        error: `Invalid syncType. Must be one of: ${validSyncTypes.join(', ')}`,
      });
      return;
    }

    // Check if config exists
    const config = await qloAppsConfigRepository.getConfig();
    if (!config) {
      res.status(404).json({
        error: 'QloApps configuration not found',
      });
      return;
    }

    // Check if sync is enabled
    if (!config.sync_enabled) {
      res.status(400).json({
        error: 'Sync is disabled. Enable sync in configuration first.',
      });
      return;
    }

    // Check circuit breaker
    if (config.circuit_state === 'open') {
      res.status(503).json({
        error: 'Sync circuit is open due to repeated failures. Please test connection first.',
      });
      return;
    }

    // Check if sync is already running
    const dbSyncType = `qloapps_${syncType}`;
    const isRunning = await syncStateRepository.isRunning(dbSyncType);
    if (isRunning) {
      res.status(409).json({
        error: `A ${syncType} sync is already running`,
      });
      return;
    }

    // Start sync state
    const syncState = await syncStateRepository.startSync(dbSyncType, {
      triggeredBy: 'manual',
      options,
    });

    // TODO: Queue the actual sync job via RabbitMQ or run in background
    // For now, we'll just acknowledge the request
    // In Phase 5, this will queue a job to the sync worker

    res.json({
      success: true,
      message: `${syncType} sync started`,
      syncStateId: syncState.id,
      startedAt: syncState.started_at,
    });
  } catch (error) {
    console.error('Trigger sync error:', error);
    res.status(400).json({
      error: error instanceof Error ? error.message : 'Failed to start sync',
    });
  }
}

/**
 * GET /api/v1/qloapps/sync/status
 * Get current sync status
 */
export async function getSyncStatusHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Check running syncs
    const runningCount = await syncStateRepository.getRunningCount();

    // Get latest sync states for each type
    const syncTypes = [
      'qloapps_full',
      'qloapps_reservations_inbound',
      'qloapps_reservations_outbound',
      'qloapps_room_types',
      'qloapps_availability',
      'qloapps_rates',
    ];

    const lastSyncs: Record<string, unknown> = {};
    for (const syncType of syncTypes) {
      const lastSync = await syncStateRepository.getLatestState(syncType);
      if (lastSync) {
        const shortType = syncType.replace('qloapps_', '');
        lastSyncs[shortType] = {
          status: lastSync.status,
          startedAt: lastSync.started_at,
          completedAt: lastSync.completed_at,
          itemsProcessed: lastSync.items_processed,
          itemsCreated: lastSync.items_created,
          itemsUpdated: lastSync.items_updated,
          itemsFailed: lastSync.items_failed,
          durationMs: lastSync.duration_ms,
          error: lastSync.error_message,
        };
      }
    }

    res.json({
      isRunning: runningCount > 0,
      runningCount,
      lastSyncs,
      timestamp: new Date(),
    });
  } catch (error) {
    next(error);
  }
}

// =============================================================================
// Room Type Mapping Endpoints
// =============================================================================

/**
 * GET /api/v1/qloapps/mappings/room-types
 * Get all room type mappings
 */
export async function getRoomTypeMappingsHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const mappings = await roomTypeMappingRepository.getMappingsWithDetails();

    res.json({
      mappings: mappings.map((m) => ({
        id: m.id,
        localRoomTypeId: m.local_room_type_id,
        localRoomTypeName: m.room_type_name,
        qloAppsProductId: m.qloapps_product_id,
        qloAppsHotelId: m.qloapps_hotel_id,
        syncDirection: m.sync_direction,
        isActive: m.is_active,
        lastSyncedAt: m.last_synced_at,
        createdAt: m.created_at,
        updatedAt: m.updated_at,
      })),
      total: mappings.length,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/v1/qloapps/mappings/room-types/unmapped
 * Get unmapped room types from both PMS and QloApps
 */
export async function getUnmappedRoomTypesHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Get unmapped PMS room types
    const pmsRoomTypes = await roomTypeMappingRepository.getUnmappedPmsRoomTypes();

    // Get QloApps room types to find unmapped ones
    const config = await qloAppsConfigRepository.getConfig();
    let qloAppsRoomTypes: Array<{ id: number; name: string; price: number; maxAdults: number; maxChildren: number }> = [];

    if (config) {
      const apiKey = await qloAppsConfigRepository.getDecryptedApiKey();
      if (apiKey) {
        try {
          const client = new QloAppsClient({
            baseUrl: config.base_url,
            apiKey,
            hotelId: config.qloapps_hotel_id,
          });

          const allQloAppsRoomTypes = await client.getRoomTypes();
          const mappings = await roomTypeMappingRepository.getAllMappings();
          const mappedQloAppsIds = new Set(mappings.map((m) => m.qloapps_product_id));

          qloAppsRoomTypes = allQloAppsRoomTypes
            .filter((rt) => !mappedQloAppsIds.has(rt.id))
            .map((rt) => ({
              id: rt.id,
              name: rt.name,
              price: rt.price,
              maxAdults: rt.max_adults,
              maxChildren: rt.max_children,
            }));
        } catch (error) {
          console.error('Error fetching QloApps room types:', error);
          // Continue with empty QloApps list
        }
      }
    }

    res.json({
      pmsRoomTypes: pmsRoomTypes.map((rt) => ({
        id: rt.id,
        name: rt.name,
        roomType: rt.room_type,
        basePrice: parseFloat(rt.price_per_night.toString()),
      })),
      qloAppsRoomTypes,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/v1/qloapps/mappings/room-types
 * Create a room type mapping
 */
export async function createRoomTypeMappingHandler(
  req: Request<object, object, CreateRoomTypeMappingRequest>,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { localRoomTypeId, qloAppsProductId, syncDirection } = req.body;

    if (!localRoomTypeId || !qloAppsProductId) {
      res.status(400).json({
        error: 'localRoomTypeId and qloAppsProductId are required',
      });
      return;
    }

    // Check for existing mapping
    const existingLocal = await roomTypeMappingRepository.getByLocalRoomTypeId(localRoomTypeId);
    if (existingLocal) {
      res.status(409).json({
        error: 'This PMS room type is already mapped',
      });
      return;
    }

    const config = await qloAppsConfigRepository.getConfig();
    if (!config) {
      res.status(404).json({
        error: 'QloApps configuration not found',
      });
      return;
    }

    const existingQloApps = await roomTypeMappingRepository.getByQloAppsProductId(
      qloAppsProductId,
      config.qloapps_hotel_id
    );
    if (existingQloApps) {
      res.status(409).json({
        error: 'This QloApps room type is already mapped',
      });
      return;
    }

    // Create mapping
    const mappingData: {
      localRoomTypeId: string;
      qloAppsProductId: number;
      qloAppsHotelId: number;
      syncDirection?: 'inbound' | 'outbound' | 'bidirectional';
    } = {
      localRoomTypeId,
      qloAppsProductId,
      qloAppsHotelId: config.qloapps_hotel_id,
    };
    if (syncDirection) {
      mappingData.syncDirection = syncDirection;
    }
    const mapping = await roomTypeMappingRepository.createMapping(mappingData);

    res.status(201).json({
      success: true,
      mapping: {
        id: mapping.id,
        localRoomTypeId: mapping.local_room_type_id,
        qloAppsProductId: mapping.qloapps_product_id,
        qloAppsHotelId: mapping.qloapps_hotel_id,
        syncDirection: mapping.sync_direction,
        isActive: mapping.is_active,
        createdAt: mapping.created_at,
      },
    });
  } catch (error) {
    console.error('Error creating room type mapping:', error);
    res.status(400).json({
      error: error instanceof Error ? error.message : 'Failed to create mapping',
    });
  }
}

/**
 * DELETE /api/v1/qloapps/mappings/room-types/:id
 * Delete a room type mapping
 */
export async function deleteRoomTypeMappingHandler(
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;

    const deleted = await roomTypeMappingRepository.deleteMapping(id);

    if (!deleted) {
      res.status(404).json({
        error: 'Room type mapping not found',
      });
      return;
    }

    res.json({
      success: true,
      message: 'Room type mapping deleted',
    });
  } catch (error) {
    next(error);
  }
}

// =============================================================================
// Reservation Mapping Endpoints
// =============================================================================

/**
 * GET /api/v1/qloapps/mappings/reservations
 * Get reservation mappings with pagination
 */
export async function getReservationMappingsHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { source, hasConflict, limit = '50', offset = '0' } = req.query;

    const queryParams: {
      limit?: number;
      offset?: number;
      source?: string;
      hasConflict?: boolean;
    } = {
      limit: parseInt(limit as string, 10),
      offset: parseInt(offset as string, 10),
    };
    if (typeof source === 'string') {
      queryParams.source = source;
    }
    if (hasConflict === 'true') {
      queryParams.hasConflict = true;
    } else if (hasConflict === 'false') {
      queryParams.hasConflict = false;
    }

    const result = await reservationMappingRepository.getMappings(queryParams);

    res.json({
      mappings: result.mappings.map((m) => ({
        id: m.id,
        localReservationId: m.local_reservation_id,
        qloAppsOrderId: m.qloapps_order_id,
        qloAppsBookingId: m.qloapps_booking_id,
        source: m.source,
        qloAppsChannel: m.qloapps_channel,
        hasConflict: m.has_conflict,
        lastSyncedAt: m.last_synced_at,
        createdAt: m.created_at,
        updatedAt: m.updated_at,
      })),
      total: result.total,
      limit: parseInt(limit as string, 10),
      offset: parseInt(offset as string, 10),
      hasMore: result.total > parseInt(offset as string, 10) + parseInt(limit as string, 10),
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/v1/qloapps/mappings/reservations/conflicts
 * Get reservation mappings with conflicts
 */
export async function getConflictedReservationsHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const conflicts = await reservationMappingRepository.getConflictedMappings();

    res.json({
      conflicts: conflicts.map((m) => ({
        id: m.id,
        localReservationId: m.local_reservation_id,
        qloAppsOrderId: m.qloapps_order_id,
        conflictData: m.conflict_data,
        createdAt: m.created_at,
        updatedAt: m.updated_at,
      })),
      total: conflicts.length,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/v1/qloapps/mappings/reservations/:id/resolve-conflict
 * Resolve a reservation conflict
 */
export async function resolveConflictHandler(
  req: Request<{ id: string }, object, { resolution: 'pms' | 'qloapps' }>,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;
    const { resolution } = req.body;

    if (!resolution || !['pms', 'qloapps'].includes(resolution)) {
      res.status(400).json({
        error: 'resolution must be "pms" or "qloapps"',
      });
      return;
    }

    // TODO: Apply resolution (sync data in chosen direction)
    // For now, just mark conflict as resolved
    await reservationMappingRepository.resolveConflict(id);

    res.json({
      success: true,
      message: `Conflict resolved in favor of ${resolution}`,
    });
  } catch (error) {
    next(error);
  }
}

// =============================================================================
// Customer Mapping Endpoints
// =============================================================================

/**
 * GET /api/v1/qloapps/mappings/customers
 * Get customer mappings with pagination
 */
export async function getCustomerMappingsHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { matchMethod, limit = '50', offset = '0' } = req.query;

    const queryParams: {
      limit?: number;
      offset?: number;
      matchMethod?: string;
    } = {
      limit: parseInt(limit as string, 10),
      offset: parseInt(offset as string, 10),
    };
    if (typeof matchMethod === 'string') {
      queryParams.matchMethod = matchMethod;
    }

    const result = await customerMappingRepository.getMappings(queryParams);

    res.json({
      mappings: result.mappings.map((m) => ({
        id: m.id,
        localGuestId: m.local_guest_id,
        localGuestName: m.guest_name,
        localGuestEmail: m.guest_email,
        qloAppsCustomerId: m.qloapps_customer_id,
        matchMethod: m.match_method,
        confidenceScore: parseFloat(m.confidence_score.toString()),
        createdAt: m.created_at,
        updatedAt: m.updated_at,
      })),
      total: result.total,
      limit: parseInt(limit as string, 10),
      offset: parseInt(offset as string, 10),
      hasMore: result.total > parseInt(offset as string, 10) + parseInt(limit as string, 10),
    });
  } catch (error) {
    next(error);
  }
}

// =============================================================================
// Sync Logs Endpoints
// =============================================================================

/**
 * GET /api/v1/qloapps/sync-logs
 * Get sync logs with pagination and filters
 */
export async function getSyncLogsHandler(
  req: Request<object, object, object, SyncLogQueryParams>,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const {
      syncType,
      direction,
      entityType,
      success,
      startDate,
      endDate,
      limit = '50',
      offset = '0',
    } = req.query;

    const queryParams: {
      syncType?: string;
      direction?: 'inbound' | 'outbound';
      entityType?: string;
      success?: boolean;
      startDate?: Date;
      endDate?: Date;
      limit?: number;
      offset?: number;
    } = {
      limit: parseInt(limit as string, 10),
      offset: parseInt(offset as string, 10),
    };

    if (typeof syncType === 'string') {
      queryParams.syncType = syncType;
    }
    if (direction === 'inbound' || direction === 'outbound') {
      queryParams.direction = direction;
    }
    if (typeof entityType === 'string') {
      queryParams.entityType = entityType;
    }
    if (success === 'true') {
      queryParams.success = true;
    } else if (success === 'false') {
      queryParams.success = false;
    }
    if (typeof startDate === 'string') {
      queryParams.startDate = new Date(startDate);
    }
    if (typeof endDate === 'string') {
      queryParams.endDate = new Date(endDate);
    }

    const result = await syncLogRepository.getLogs(queryParams);

    res.json({
      logs: result.logs.map((log) => ({
        id: log.id,
        syncStateId: log.sync_state_id,
        syncType: log.sync_type,
        direction: log.direction,
        entityType: log.entity_type,
        localEntityId: log.local_entity_id,
        qloAppsEntityId: log.qloapps_entity_id,
        operation: log.operation,
        success: log.success,
        errorMessage: log.error_message,
        durationMs: log.duration_ms,
        createdAt: log.created_at,
      })),
      total: result.total,
      limit: parseInt(limit as string, 10),
      offset: parseInt(offset as string, 10),
      hasMore: result.total > parseInt(offset as string, 10) + parseInt(limit as string, 10),
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/v1/qloapps/sync-logs/errors
 * Get recent sync errors
 */
export async function getRecentErrorsHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { limit = '10' } = req.query;

    const errors = await syncLogRepository.getRecentErrors(parseInt(limit as string, 10));

    res.json({
      errors: errors.map((log) => ({
        id: log.id,
        syncType: log.sync_type,
        direction: log.direction,
        entityType: log.entity_type,
        operation: log.operation,
        errorMessage: log.error_message,
        createdAt: log.created_at,
      })),
      total: errors.length,
    });
  } catch (error) {
    next(error);
  }
}

// =============================================================================
// Health Check Endpoint
// =============================================================================

/**
 * GET /api/v1/qloapps/health
 * Get QloApps integration health status
 */
export async function getHealthHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const config = await qloAppsConfigRepository.getConfig();

    if (!config) {
      res.json({
        status: 'unhealthy',
        configured: false,
        connected: false,
        consecutiveFailures: 0,
        circuitState: 'closed',
        syncEnabled: false,
      });
      return;
    }

    // Determine health status
    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    let connected = false;

    if (config.circuit_state === 'open') {
      status = 'unhealthy';
    } else if (config.consecutive_failures > 0) {
      status = 'degraded';
    }

    // Quick connection check
    if (config.circuit_state !== 'open') {
      try {
        const apiKey = await qloAppsConfigRepository.getDecryptedApiKey();
        if (apiKey) {
          const client = new QloAppsClient({
            baseUrl: config.base_url,
            apiKey,
            hotelId: config.qloapps_hotel_id,
            timeout: 5000, // Quick timeout for health check
          });

          const result = await client.testConnection();
          connected = result.success;
        }
      } catch {
        connected = false;
        status = 'degraded';
      }
    }

    // Get recent errors count
    const recentErrors = await syncLogRepository.getRecentErrors(5);
    const runningCount = await syncStateRepository.getRunningCount();

    res.json({
      status,
      configured: true,
      connected,
      lastSuccessfulSync: config.last_successful_sync,
      consecutiveFailures: config.consecutive_failures,
      circuitState: config.circuit_state,
      syncEnabled: config.sync_enabled,
      details: {
        pendingInbound: 0, // TODO: Calculate from queue
        pendingOutbound: 0, // TODO: Calculate from queue
        runningJobs: runningCount,
        recentErrorsCount: recentErrors.length,
        lastError: config.last_sync_error || undefined,
      },
    });
  } catch (error) {
    next(error);
  }
}

// =============================================================================
// Auto-Mapping Endpoints
// =============================================================================

/**
 * GET /api/v1/qloapps/mappings/room-types/suggestions
 * Get auto-mapping suggestions for room types
 */
export async function getMappingSuggestionsHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const config = await qloAppsConfigRepository.getConfig();
    if (!config) {
      res.status(404).json({
        error: 'QloApps configuration not found',
      });
      return;
    }

    const apiKey = await qloAppsConfigRepository.getDecryptedApiKey();
    if (!apiKey) {
      res.status(500).json({
        error: 'Failed to decrypt API key',
      });
      return;
    }

    // Get unmapped PMS room types
    const pmsRoomTypes = await roomTypeMappingRepository.getUnmappedPmsRoomTypes();

    // Get QloApps room types
    const client = new QloAppsClient({
      baseUrl: config.base_url,
      apiKey,
      hotelId: config.qloapps_hotel_id,
    });

    const qloAppsRoomTypes = await client.getRoomTypes();
    const mappings = await roomTypeMappingRepository.getAllMappings();
    const mappedQloAppsIds = new Set(mappings.map((m) => m.qloapps_product_id));

    const unmappedQloApps = qloAppsRoomTypes.filter((rt) => !mappedQloAppsIds.has(rt.id));

    // Generate suggestions based on name similarity
    const suggestions: Array<{
      pmsRoomType: { id: string; name: string; basePrice: number };
      qloAppsRoomType: { id: number; name: string; price: number };
      confidence: number;
      matchReason: string;
    }> = [];

    for (const pmsType of pmsRoomTypes) {
      for (const qloAppsType of unmappedQloApps) {
        const nameMatch = calculateNameSimilarity(pmsType.name, qloAppsType.name);
        const priceMatch = calculatePriceSimilarity(
          parseFloat(pmsType.price_per_night.toString()),
          qloAppsType.price
        );

        const confidence = (nameMatch * 0.7) + (priceMatch * 0.3);

        if (confidence > 0.5) {
          suggestions.push({
            pmsRoomType: {
              id: pmsType.id,
              name: pmsType.name,
              basePrice: parseFloat(pmsType.price_per_night.toString()),
            },
            qloAppsRoomType: {
              id: qloAppsType.id,
              name: qloAppsType.name,
              price: qloAppsType.price,
            },
            confidence,
            matchReason: nameMatch > 0.8 ? 'Name match' : priceMatch > 0.9 ? 'Price match' : 'Combined similarity',
          });
        }
      }
    }

    // Sort by confidence descending
    suggestions.sort((a, b) => b.confidence - a.confidence);

    res.json({
      suggestions,
      unmappedPms: pmsRoomTypes.length,
      unmappedQloApps: unmappedQloApps.length,
    });
  } catch (error) {
    console.error('Error getting mapping suggestions:', error);
    res.status(400).json({
      error: error instanceof Error ? error.message : 'Failed to get suggestions',
    });
  }
}

/**
 * POST /api/v1/qloapps/mappings/room-types/apply-suggestions
 * Apply multiple room type mappings at once
 */
export async function applyMappingSuggestionsHandler(
  req: Request<object, object, { mappings: Array<{ localRoomTypeId: string; qloAppsProductId: number }> }>,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { mappings } = req.body;

    if (!mappings || !Array.isArray(mappings) || mappings.length === 0) {
      res.status(400).json({
        error: 'mappings array is required and must not be empty',
      });
      return;
    }

    const config = await qloAppsConfigRepository.getConfig();
    if (!config) {
      res.status(404).json({
        error: 'QloApps configuration not found',
      });
      return;
    }

    const results: Array<{ localRoomTypeId: string; success: boolean; error?: string }> = [];

    for (const mapping of mappings) {
      try {
        await roomTypeMappingRepository.createMapping({
          localRoomTypeId: mapping.localRoomTypeId,
          qloAppsProductId: mapping.qloAppsProductId,
          qloAppsHotelId: config.qloapps_hotel_id,
          syncDirection: 'bidirectional',
        });
        results.push({ localRoomTypeId: mapping.localRoomTypeId, success: true });
      } catch (error) {
        results.push({
          localRoomTypeId: mapping.localRoomTypeId,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    const successCount = results.filter((r) => r.success).length;

    res.json({
      success: successCount > 0,
      message: `${successCount}/${mappings.length} mappings created`,
      results,
    });
  } catch (error) {
    next(error);
  }
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Calculate name similarity using Levenshtein distance
 */
function calculateNameSimilarity(name1: string, name2: string): number {
  const s1 = name1.toLowerCase().trim();
  const s2 = name2.toLowerCase().trim();

  if (s1 === s2) return 1;

  // Check if one contains the other
  if (s1.includes(s2) || s2.includes(s1)) return 0.9;

  // Simple Levenshtein distance
  const len1 = s1.length;
  const len2 = s2.length;

  if (len1 === 0) return len2 === 0 ? 1 : 0;
  if (len2 === 0) return 0;

  const matrix: number[][] = [];

  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= len2; j++) {
    matrix[0]![j] = j;
  }

  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      matrix[i]![j] = Math.min(
        matrix[i - 1]![j]! + 1,
        matrix[i]![j - 1]! + 1,
        matrix[i - 1]![j - 1]! + cost
      );
    }
  }

  const maxLen = Math.max(len1, len2);
  return 1 - matrix[len1]![len2]! / maxLen;
}

/**
 * Calculate price similarity (how close two prices are)
 */
function calculatePriceSimilarity(price1: number, price2: number): number {
  if (price1 === price2) return 1;
  if (price1 === 0 || price2 === 0) return 0;

  const ratio = Math.min(price1, price2) / Math.max(price1, price2);
  return ratio;
}
