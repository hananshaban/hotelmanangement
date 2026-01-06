/**
 * QloApps Rate Sync Service
 *
 * Syncs room rates from PMS to QloApps.
 * Pushes pricing updates for room types.
 */

import { QloAppsClient } from '../qloapps_client.js';
import { QLOAPPS_CONFIG } from '../qloapps_config.js';
import type { QloAppsRateUpdate, QloAppsSyncResult } from '../qloapps_types.js';
import {
  getRoomTypeRates,
  mapRatesToQloApps,
  getDefaultDateRange,
  splitDateRange,
  formatDateString,
} from '../mappers/availability_mapper.js';
import type { DateRange } from '../mappers/availability_mapper.js';
import db from '../../../config/database.js';
import { decrypt } from '../../../utils/encryption.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Result of syncing rates for a single room type
 */
export interface RoomTypeRateSyncResult {
  success: boolean;
  pmsRoomTypeId: string;
  qloAppsRoomTypeId: number;
  updatesCount: number;
  error?: string;
}

/**
 * Options for rate sync
 */
export interface RateSyncOptions {
  /** Date range to sync */
  dateRange?: DateRange;
  /** Specific room type IDs to sync */
  roomTypeIds?: string[];
  /** Number of days into the future to sync */
  futureDays?: number;
  /** Chunk size for batch processing (in days) */
  chunkSizeDays?: number;
}

// ============================================================================
// Rate Sync Service
// ============================================================================

/**
 * Service for syncing rates from PMS to QloApps
 */
export class QloAppsRateSyncService {
  private client: QloAppsClient;
  private configId: string;

  constructor(client: QloAppsClient, configId: string) {
    this.client = client;
    this.configId = configId;
  }

  /**
   * Create a new RateSyncService instance from stored config
   */
  static async fromConfigId(configId: string): Promise<QloAppsRateSyncService> {
    const config = await db('qloapps_config')
      .where({ id: configId })
      .first();

    if (!config) {
      throw new Error(`QloApps config not found: ${configId}`);
    }

    const apiKey = decrypt(config.api_key_encrypted);
    const client = new QloAppsClient({
      baseUrl: config.base_url,
      apiKey,
      hotelId: parseInt(config.qloapps_hotel_id, 10),
    });

    return new QloAppsRateSyncService(client, configId);
  }

  /**
   * Get all active room type mappings for this config
   */
  async getRoomTypeMappings(): Promise<Array<{
    pmsRoomTypeId: string;
    qloAppsRoomTypeId: number;
    roomTypeName: string;
  }>> {
    const mappings = await db('qloapps_room_type_mappings')
      .where({
        qloapps_config_id: this.configId,
        is_active: true,
      })
      .select('pms_room_type_id', 'qloapps_room_type_id');

    const result: Array<{
      pmsRoomTypeId: string;
      qloAppsRoomTypeId: number;
      roomTypeName: string;
    }> = [];

    for (const mapping of mappings) {
      const roomType = await db('room_types')
        .where({ id: mapping.pms_room_type_id })
        .whereNull('deleted_at')
        .first();

      if (roomType) {
        result.push({
          pmsRoomTypeId: mapping.pms_room_type_id,
          qloAppsRoomTypeId: parseInt(mapping.qloapps_room_type_id, 10),
          roomTypeName: roomType.name,
        });
      }
    }

    return result;
  }

  /**
   * Sync rates for a single room type
   */
  async syncRoomTypeRates(
    pmsRoomTypeId: string,
    qloAppsRoomTypeId: number,
    dateRange: DateRange
  ): Promise<RoomTypeRateSyncResult> {
    try {
      console.log(`[QloApps Rates] Syncing room type ${pmsRoomTypeId} for ${formatDateString(dateRange.startDate)} to ${formatDateString(dateRange.endDate)}`);

      // Get rates from PMS
      const rates = await getRoomTypeRates(pmsRoomTypeId, dateRange);

      // Get room type for min/max stay restrictions
      const roomType = await db('room_types')
        .where({ id: pmsRoomTypeId })
        .whereNull('deleted_at')
        .first();

      // Map to QloApps format with restrictions
      const updates = mapRatesToQloApps(rates, qloAppsRoomTypeId, {
        minStay: roomType?.min_stay || undefined,
        maxStay: roomType?.max_stay || undefined,
      });

      // Push to QloApps in chunks
      const chunkSize = 30;
      for (let i = 0; i < updates.length; i += chunkSize) {
        const chunk = updates.slice(i, i + chunkSize);
        await this.pushRateUpdates(chunk);
      }

      console.log(`[QloApps Rates] Synced ${updates.length} days for room type ${pmsRoomTypeId}`);

      return {
        success: true,
        pmsRoomTypeId,
        qloAppsRoomTypeId,
        updatesCount: updates.length,
      };
    } catch (error) {
      console.error(`[QloApps Rates] Error syncing room type ${pmsRoomTypeId}:`, error);
      return {
        success: false,
        pmsRoomTypeId,
        qloAppsRoomTypeId,
        updatesCount: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Push rate updates to QloApps
   * Note: QloApps rate management typically uses specific pricing endpoints.
   * This is a placeholder that logs updates. Actual implementation depends
   * on QloApps API configuration.
   */
  private async pushRateUpdates(updates: QloAppsRateUpdate[]): Promise<void> {
    if (updates.length === 0) {
      return;
    }

    // Group updates by room type
    const updatesByRoomType = new Map<number, QloAppsRateUpdate[]>();
    for (const update of updates) {
      const existing = updatesByRoomType.get(update.roomTypeId) || [];
      existing.push(update);
      updatesByRoomType.set(update.roomTypeId, existing);
    }

    // Log updates - actual push depends on QloApps API rate endpoint
    for (const [roomTypeId, roomTypeUpdates] of updatesByRoomType) {
      console.log(`[QloApps Rates] Would push ${roomTypeUpdates.length} rate updates for room type ${roomTypeId}`);
      
      // TODO: Implement actual API call when QloApps rate management endpoint is confirmed
      // QloApps may use specific_price or advanced_pricing modules
      // await this.client.updateRoomRates(roomTypeId, roomTypeUpdates);
    }
  }

  /**
   * Run rate sync for all mapped room types
   */
  async runRateSync(options: RateSyncOptions = {}): Promise<QloAppsSyncResult> {
    const startedAt = new Date();
    const errors: string[] = [];

    let processedCount = 0;
    let createdCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;
    let failedCount = 0;

    try {
      // Determine date range
      const futureDays = options.futureDays ?? QLOAPPS_CONFIG.RATE_FUTURE_DAYS;
      const dateRange = options.dateRange ?? getDefaultDateRange(futureDays);

      // Get room type mappings
      let mappings = await this.getRoomTypeMappings();

      // Filter by specific room types if provided
      if (options.roomTypeIds && options.roomTypeIds.length > 0) {
        mappings = mappings.filter(m => options.roomTypeIds!.includes(m.pmsRoomTypeId));
      }

      console.log(`[QloApps Rates] Syncing ${mappings.length} room types for ${formatDateString(dateRange.startDate)} to ${formatDateString(dateRange.endDate)}`);

      // Split date range into chunks for processing
      const chunkSizeDays = options.chunkSizeDays ?? 30;
      const dateChunks = splitDateRange(dateRange, chunkSizeDays);

      // Sync each room type
      for (const mapping of mappings) {
        for (const chunk of dateChunks) {
          const result = await this.syncRoomTypeRates(
            mapping.pmsRoomTypeId,
            mapping.qloAppsRoomTypeId,
            chunk
          );

          processedCount++;
          if (result.success) {
            updatedCount += result.updatesCount;
          } else {
            failedCount++;
            if (result.error) {
              errors.push(`Room type ${mapping.pmsRoomTypeId}: ${result.error}`);
            }
          }
        }
      }

      // Update sync state
      await this.updateSyncState('rates', true);

      // Log sync results
      await this.logSyncResult({
        syncType: QLOAPPS_CONFIG.SYNC_TYPES.RATES_PUSH,
        success: failedCount === 0,
        processedCount,
        createdCount,
        updatedCount,
        skippedCount,
        failedCount,
        errors,
        startedAt,
        completedAt: new Date(),
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      errors.push(errorMessage);
      failedCount++;

      // Update sync state with failure
      await this.updateSyncState('rates', false, errorMessage);
    }

    const completedAt = new Date();

    return {
      success: failedCount === 0,
      syncType: QLOAPPS_CONFIG.SYNC_TYPES.RATES_PUSH,
      processedCount,
      createdCount,
      updatedCount,
      skippedCount,
      failedCount,
      errors,
      durationMs: completedAt.getTime() - startedAt.getTime(),
      startedAt,
      completedAt,
    };
  }

  /**
   * Update sync state in database
   */
  private async updateSyncState(
    entityType: string,
    success: boolean,
    errorMessage?: string
  ): Promise<void> {
    const existing = await db('qloapps_sync_state')
      .where({
        qloapps_config_id: this.configId,
        entity_type: entityType,
      })
      .first();

    const now = new Date();
    const updates = {
      last_sync_at: now,
      last_sync_success: success,
      last_sync_error: success ? null : errorMessage,
      consecutive_failures: success ? 0 : (existing?.consecutive_failures || 0) + 1,
      updated_at: now,
    };

    if (existing) {
      await db('qloapps_sync_state')
        .where({ id: existing.id })
        .update(updates);
    } else {
      await db('qloapps_sync_state').insert({
        qloapps_config_id: this.configId,
        entity_type: entityType,
        ...updates,
      });
    }
  }

  /**
   * Log sync result to database
   */
  private async logSyncResult(result: {
    syncType: string;
    success: boolean;
    processedCount: number;
    createdCount: number;
    updatedCount: number;
    skippedCount: number;
    failedCount: number;
    errors: string[];
    startedAt: Date;
    completedAt: Date;
  }): Promise<void> {
    await db('qloapps_sync_logs').insert({
      qloapps_config_id: this.configId,
      sync_type: result.syncType,
      direction: 'push',
      status: result.success ? 'success' : 'failed',
      started_at: result.startedAt,
      completed_at: result.completedAt,
      records_processed: result.processedCount,
      records_created: result.createdCount,
      records_updated: result.updatedCount,
      records_failed: result.failedCount,
      error_details: result.errors.length > 0 ? JSON.stringify(result.errors) : null,
    });
  }
}
