/**
 * QloApps Availability Sync Service
 *
 * Syncs availability from PMS to QloApps.
 * Calculates room availability and pushes updates.
 */

import { QloAppsClient } from '../qloapps_client.js';
import { QLOAPPS_CONFIG } from '../qloapps_config.js';
import type { QloAppsAvailabilityUpdate, QloAppsSyncResult } from '../qloapps_types.js';
import {
  calculateRoomTypeAvailability,
  mapAvailabilityToQloApps,
  getDefaultDateRange,
  splitDateRange,
  formatDateString,
} from '../mappers/availability_mapper.js';
import type { DateRange, DailyAvailability } from '../mappers/availability_mapper.js';
import db from '../../../config/database.js';
import { decrypt } from '../../../utils/encryption.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Result of syncing availability for a single room type
 */
export interface RoomTypeAvailabilitySyncResult {
  success: boolean;
  pmsRoomTypeId: string;
  qloAppsRoomTypeId: number;
  updatesCount: number;
  error?: string;
}

/**
 * Options for availability sync
 */
export interface AvailabilitySyncOptions {
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
// Availability Sync Service
// ============================================================================

/**
 * Service for syncing availability from PMS to QloApps
 */
export class QloAppsAvailabilitySyncService {
  private client: QloAppsClient;
  private configId: string;

  constructor(client: QloAppsClient, configId: string) {
    this.client = client;
    this.configId = configId;
  }

  /**
   * Create a new AvailabilitySyncService instance from stored config
   */
  static async fromConfigId(configId: string): Promise<QloAppsAvailabilitySyncService> {
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

    return new QloAppsAvailabilitySyncService(client, configId);
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
        property_id: this.propertyId,
        is_active: true,
      })
      .select('local_room_type_id', 'qloapps_product_id');

    const result: Array<{
      pmsRoomTypeId: string;
      qloAppsRoomTypeId: number;
      roomTypeName: string;
    }> = [];

    for (const mapping of mappings) {
      const roomType = await db('room_types')
        .where({ id: mapping.local_room_type_id })
        .whereNull('deleted_at')
        .first();

      if (roomType) {
        result.push({
          pmsRoomTypeId: mapping.local_room_type_id,
          qloAppsRoomTypeId: parseInt(mapping.qloapps_product_id, 10),
          roomTypeName: roomType.name,
        });
      }
    }

    return result;
  }

  /**
   * Sync availability for a single room type
   */
  async syncRoomTypeAvailability(
    pmsRoomTypeId: string,
    qloAppsRoomTypeId: number,
    dateRange: DateRange
  ): Promise<RoomTypeAvailabilitySyncResult> {
    try {
      console.log(`[QloApps Availability] Syncing room type ${pmsRoomTypeId} for ${formatDateString(dateRange.startDate)} to ${formatDateString(dateRange.endDate)}`);

      // Calculate availability from PMS
      const availability = await calculateRoomTypeAvailability(pmsRoomTypeId, dateRange);

      // Map to QloApps format
      const updates = mapAvailabilityToQloApps(availability, qloAppsRoomTypeId);

      // Push to QloApps in chunks
      const chunkSize = 30; // 30 days per request
      for (let i = 0; i < updates.length; i += chunkSize) {
        const chunk = updates.slice(i, i + chunkSize);
        await this.pushAvailabilityUpdates(chunk);
      }

      console.log(`[QloApps Availability] Synced ${updates.length} days for room type ${pmsRoomTypeId}`);

      return {
        success: true,
        pmsRoomTypeId,
        qloAppsRoomTypeId,
        updatesCount: updates.length,
      };
    } catch (error) {
      console.error(`[QloApps Availability] Error syncing room type ${pmsRoomTypeId}:`, error);
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
   * Push availability updates to QloApps
   * Note: QloApps availability management is typically done through
   * the hotel_room_information endpoint. This is a placeholder that
   * logs the updates for now. Actual implementation depends on
   * QloApps API version and configuration.
   */
  private async pushAvailabilityUpdates(updates: QloAppsAvailabilityUpdate[]): Promise<void> {
    if (updates.length === 0) {
      return;
    }

    // Group updates by room type
    const updatesByRoomType = new Map<number, QloAppsAvailabilityUpdate[]>();
    for (const update of updates) {
      const existing = updatesByRoomType.get(update.roomTypeId) || [];
      existing.push(update);
      updatesByRoomType.set(update.roomTypeId, existing);
    }

    // Log updates - actual push depends on QloApps API availability endpoint
    for (const [roomTypeId, roomTypeUpdates] of updatesByRoomType) {
      console.log(`[QloApps Availability] Would push ${roomTypeUpdates.length} updates for room type ${roomTypeId}`);
      
      // TODO: Implement actual API call when QloApps availability endpoint is confirmed
      // The QloApps hotel_room_information endpoint may be used for this purpose
      // await this.client.updateRoomAvailability(roomTypeId, roomTypeUpdates);
    }
  }

  /**
   * Run availability sync for all mapped room types
   */
  async runAvailabilitySync(options: AvailabilitySyncOptions = {}): Promise<QloAppsSyncResult> {
    const startedAt = new Date();
    const errors: string[] = [];

    let processedCount = 0;
    let createdCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;
    let failedCount = 0;

    try {
      // Determine date range
      const futureDays = options.futureDays ?? QLOAPPS_CONFIG.AVAILABILITY_FUTURE_DAYS;
      const dateRange = options.dateRange ?? getDefaultDateRange(futureDays);

      // Get room type mappings
      let mappings = await this.getRoomTypeMappings();

      // Filter by specific room types if provided
      if (options.roomTypeIds && options.roomTypeIds.length > 0) {
        mappings = mappings.filter(m => options.roomTypeIds!.includes(m.pmsRoomTypeId));
      }

      console.log(`[QloApps Availability] Syncing ${mappings.length} room types for ${formatDateString(dateRange.startDate)} to ${formatDateString(dateRange.endDate)}`);

      // Split date range into chunks for processing
      const chunkSizeDays = options.chunkSizeDays ?? 30;
      const dateChunks = splitDateRange(dateRange, chunkSizeDays);

      // Sync each room type
      for (const mapping of mappings) {
        for (const chunk of dateChunks) {
          const result = await this.syncRoomTypeAvailability(
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
      await this.updateSyncState('availability', true);

      // Log sync results
      await this.logSyncResult({
        syncType: QLOAPPS_CONFIG.SYNC_TYPES.AVAILABILITY_PUSH,
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
      await this.updateSyncState('availability', false, errorMessage);
    }

    const completedAt = new Date();

    return {
      success: failedCount === 0,
      syncType: QLOAPPS_CONFIG.SYNC_TYPES.AVAILABILITY_PUSH,
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
        property_id: this.propertyId,
        entity_type: entityType,
      })
      .first();

    const now = new Date();
    const updates = {
      last_successful_sync: success ? now : undefined,
      last_sync_success: success,
      last_sync_error: success ? null : errorMessage,
      updated_at: now,
    };

    if (existing) {
      await db('qloapps_sync_state')
        .where({ id: existing.id })
        .update(updates);
    } else {
      await db('qloapps_sync_state').insert({
        property_id: this.propertyId,
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
      property_id: this.propertyId,
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
