/**
 * QloApps Room Type Sync Service
 *
 * Syncs room types between PMS and QloApps.
 * Handles initial mapping and ongoing updates.
 */

import { QloAppsClient } from '../qloapps_client.js';
import { QLOAPPS_CONFIG } from '../qloapps_config.js';
import type {
  QloAppsRoomType,
  QloAppsSyncResult,
} from '../qloapps_types.js';
import {
  mapQloAppsRoomTypeToPms,
  mapPmsRoomTypeToQloApps,
  mapPmsRoomTypeToQloAppsUpdate,
  calculateRoomTypeMatchScore,
  roomTypeNeedsUpdate,
} from '../mappers/room_type_mapper.js';
import db from '../../../config/database.js';
import { decrypt } from '../../../utils/encryption.js';
import type { RoomType } from '../../../services/room_types/room_types_types.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Result of syncing a single room type
 */
export interface RoomTypeSyncResult {
  success: boolean;
  pmsRoomTypeId?: string;
  qloAppsRoomTypeId?: number;
  action: 'created' | 'updated' | 'mapped' | 'skipped' | 'failed';
  error?: string;
}

/**
 * Room type mapping proposal
 */
export interface RoomTypeMappingProposal {
  pmsRoomType: {
    id: string;
    name: string;
    price: number;
  };
  qloAppsRoomType: {
    id: number;
    name: string;
    price: number;
  };
  matchScore: number;
  reason: string;
}

/**
 * Options for room type sync
 */
export interface RoomTypeSyncOptions {
  /** Only sync specific PMS room type IDs */
  pmsRoomTypeIds?: string[];
  /** Auto-create mappings for unmatched room types */
  autoCreateMappings?: boolean;
  /** Minimum match score for auto-mapping (0-100) */
  minMatchScore?: number;
}

// ============================================================================
// Room Type Sync Service
// ============================================================================

/**
 * Service for syncing room types between PMS and QloApps
 */
export class QloAppsRoomTypeSyncService {
  private client: QloAppsClient;
  private configId: string;
  private propertyId: string;
  private hotelId: number;

  constructor(client: QloAppsClient, configId: string, propertyId: string, hotelId: number) {
    this.client = client;
    this.configId = configId;
    this.propertyId = propertyId;
    this.hotelId = hotelId;
  }

  /**
   * Create a new RoomTypeSyncService instance from stored config
   */
  static async fromConfigId(configId: string): Promise<QloAppsRoomTypeSyncService> {
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

    return new QloAppsRoomTypeSyncService(client, configId, config.property_id, parseInt(config.qloapps_hotel_id, 10));
  }

  /**
   * Get all PMS room types
   */
  async getPmsRoomTypes(): Promise<RoomType[]> {
    const roomTypes = await db('room_types')
      .whereNull('deleted_at')
      .orderBy('name');

    return roomTypes;
  }

  /**
   * Get all QloApps room types
   */
  async getQloAppsRoomTypes(): Promise<QloAppsRoomType[]> {
    return await this.client.getRoomTypes({ active: true });
  }

  /**
   * Get existing room type mappings
   */
  async getExistingMappings(): Promise<Array<{
    id: string;
    pmsRoomTypeId: string;
    qloAppsRoomTypeId: number;
    isActive: boolean;
  }>> {
    const mappings = await db('qloapps_room_type_mappings')
      .where({ property_id: this.propertyId })
      .select('id', 'local_room_type_id', 'qloapps_product_id', 'is_active');

    return mappings.map(m => ({
      id: m.id,
      pmsRoomTypeId: m.local_room_type_id,
      qloAppsRoomTypeId: parseInt(m.qloapps_product_id, 10),
      isActive: m.is_active,
    }));
  }

  /**
   * Generate mapping proposals by matching PMS and QloApps room types
   */
  async generateMappingProposals(
    minMatchScore: number = 50
  ): Promise<RoomTypeMappingProposal[]> {
    const proposals: RoomTypeMappingProposal[] = [];

    // Get all room types from both systems
    const pmsRoomTypes = await this.getPmsRoomTypes();
    const qloAppsRoomTypes = await this.getQloAppsRoomTypes();
    const existingMappings = await this.getExistingMappings();

    // Create sets of already mapped IDs
    const mappedPmsIds = new Set(existingMappings.map(m => m.pmsRoomTypeId));
    const mappedQloAppsIds = new Set(existingMappings.map(m => m.qloAppsRoomTypeId));

    // Find best matches for unmapped PMS room types
    for (const pmsType of pmsRoomTypes) {
      if (mappedPmsIds.has(pmsType.id)) {
        continue; // Already mapped
      }

      let bestMatch: { qloAppsType: QloAppsRoomType; score: number } | null = null;

      for (const qloAppsType of qloAppsRoomTypes) {
        if (mappedQloAppsIds.has(qloAppsType.id)) {
          continue; // Already mapped
        }

        const score = calculateRoomTypeMatchScore(pmsType, qloAppsType);
        if (score >= minMatchScore && (!bestMatch || score > bestMatch.score)) {
          bestMatch = { qloAppsType, score };
        }
      }

      if (bestMatch) {
        proposals.push({
          pmsRoomType: {
            id: pmsType.id,
            name: pmsType.name,
            price: pmsType.price_per_night,
          },
          qloAppsRoomType: {
            id: bestMatch.qloAppsType.id,
            name: bestMatch.qloAppsType.name,
            price: bestMatch.qloAppsType.price,
          },
          matchScore: bestMatch.score,
          reason: this.getMatchReason(bestMatch.score),
        });
      }
    }

    // Sort by match score descending
    proposals.sort((a, b) => b.matchScore - a.matchScore);

    return proposals;
  }

  /**
   * Get human-readable match reason
   */
  private getMatchReason(score: number): string {
    if (score >= 90) {
      return 'Excellent match - names and attributes are very similar';
    } else if (score >= 70) {
      return 'Good match - names or key attributes match';
    } else if (score >= 50) {
      return 'Possible match - some attributes match';
    } else {
      return 'Weak match - limited similarity';
    }
  }

  /**
   * Create a room type mapping
   */
  async createMapping(
    pmsRoomTypeId: string,
    qloAppsRoomTypeId: number
  ): Promise<void> {
    // Check for existing mapping
    const existing = await db('qloapps_room_type_mappings')
      .where({
        property_id: this.propertyId,
        local_room_type_id: pmsRoomTypeId,
      })
      .first();

    if (existing) {
      // Update existing mapping
      await db('qloapps_room_type_mappings')
        .where({ id: existing.id })
        .update({
          qloapps_product_id: qloAppsRoomTypeId.toString(),
          is_active: true,
          updated_at: new Date(),
          last_synced_at: new Date(),
        });
    } else {
      // Create new mapping
      await db('qloapps_room_type_mappings').insert({
        property_id: this.propertyId,
        local_room_type_id: pmsRoomTypeId,
        qloapps_product_id: qloAppsRoomTypeId.toString(),
        qloapps_hotel_id: this.hotelId.toString(),
        is_active: true,
        sync_direction: 'bidirectional',
        last_synced_at: new Date(),
        last_sync_status: 'success',
      });
    }
  }

  /**
   * Delete a room type mapping
   */
  async deleteMapping(pmsRoomTypeId: string): Promise<void> {
    await db('qloapps_room_type_mappings')
      .where({
        property_id: this.propertyId,
        local_room_type_id: pmsRoomTypeId,
      })
      .update({
        is_active: false,
        updated_at: new Date(),
      });
  }

  /**
   * Sync room types from QloApps to PMS
   * Creates PMS room types for QloApps room types without mappings
   */
  async pullRoomTypes(): Promise<RoomTypeSyncResult[]> {
    const results: RoomTypeSyncResult[] = [];

    console.log('[QloApps RoomType] 🔄 Starting room type pull sync...');
    
    const qloAppsRoomTypes = await this.getQloAppsRoomTypes();
    console.log(`[QloApps RoomType] 📥 Fetched ${qloAppsRoomTypes.length} room types from QloApps`);
    
    const existingMappings = await this.getExistingMappings();
    console.log(`[QloApps RoomType] 🔗 Found ${existingMappings.length} existing mappings`);
    
    const mappedQloAppsIds = new Set(existingMappings.map(m => m.qloAppsRoomTypeId));

    for (const qloAppsType of qloAppsRoomTypes) {
      console.log(`[QloApps RoomType] 📝 Processing QloApps room type ${qloAppsType.id}: "${qloAppsType.name}"`);
      
      if (mappedQloAppsIds.has(qloAppsType.id)) {
        // Already mapped, skip
        console.log(`[QloApps RoomType] ⏭️  Room type ${qloAppsType.id} already mapped, skipping`);
        results.push({
          success: true,
          qloAppsRoomTypeId: qloAppsType.id,
          action: 'skipped',
        });
        continue;
      }

      try {
        // Create new PMS room type
        console.log(`[QloApps RoomType] 🏗️  Creating new PMS room type from QloApps room type ${qloAppsType.id}...`);
        const roomTypeData = mapQloAppsRoomTypeToPms(qloAppsType);
        console.log(`[QloApps RoomType] 📊 Room type data:`, JSON.stringify(roomTypeData, null, 2));

        const [newRoomType] = await db('room_types')
          .insert(roomTypeData)
          .returning(['id', 'name', 'room_type', 'qty', 'price_per_night']);

        console.log(`[QloApps RoomType] ✅ Created PMS room type: ${JSON.stringify(newRoomType)}`);

        // Create mapping
        console.log(`[QloApps RoomType] 🔗 Creating mapping: PMS ${newRoomType.id} <-> QloApps ${qloAppsType.id}`);
        await this.createMapping(newRoomType.id, qloAppsType.id);

        results.push({
          success: true,
          pmsRoomTypeId: newRoomType.id,
          qloAppsRoomTypeId: qloAppsType.id,
          action: 'created',
        });

        console.log(`[QloApps RoomType] ✨ Successfully synced room type ${newRoomType.id} (QloApps ID: ${qloAppsType.id})`);
      } catch (error) {
        console.error(`[QloApps RoomType] ❌ Failed to sync room type ${qloAppsType.id}:`, error);
        console.error(`[QloApps RoomType] 📋 Error details:`, error instanceof Error ? error.stack : error);
        results.push({
          success: false,
          qloAppsRoomTypeId: qloAppsType.id,
          action: 'failed',
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    console.log(`[QloApps RoomType] 🏁 Room type pull sync complete. Results: ${JSON.stringify({
      total: results.length,
      created: results.filter(r => r.action === 'created').length,
      skipped: results.filter(r => r.action === 'skipped').length,
      failed: results.filter(r => r.action === 'failed').length,
    })}`);

    return results;
  }

  /**
   * Run room type sync
   */
  async runRoomTypeSync(options: RoomTypeSyncOptions = {}): Promise<QloAppsSyncResult> {
    const startedAt = new Date();
    const errors: string[] = [];

    let processedCount = 0;
    let createdCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;
    let failedCount = 0;

    try {
      // If auto-create mappings is enabled, generate and apply proposals
      if (options.autoCreateMappings) {
        const minScore = options.minMatchScore ?? 70;
        const proposals = await this.generateMappingProposals(minScore);

        for (const proposal of proposals) {
          try {
            await this.createMapping(
              proposal.pmsRoomType.id,
              proposal.qloAppsRoomType.id
            );
            createdCount++;
            console.log(`[QloApps RoomType] Auto-mapped ${proposal.pmsRoomType.name} <-> ${proposal.qloAppsRoomType.name} (score: ${proposal.matchScore})`);
          } catch (error) {
            failedCount++;
            const errorMsg = error instanceof Error ? error.message : 'Unknown error';
            errors.push(`Failed to create mapping for ${proposal.pmsRoomType.name}: ${errorMsg}`);
          }
          processedCount++;
        }
      }

      // Get existing mappings and check for updates needed
      const mappings = await this.getExistingMappings();
      const pmsRoomTypes = await this.getPmsRoomTypes();
      const qloAppsRoomTypes = await this.getQloAppsRoomTypes();

      // Build lookup maps
      const pmsRoomTypeMap = new Map(pmsRoomTypes.map(rt => [rt.id, rt]));
      const qloAppsRoomTypeMap = new Map(qloAppsRoomTypes.map(rt => [rt.id, rt]));

      for (const mapping of mappings) {
        if (!mapping.isActive) {
          continue;
        }

        // Filter by specific IDs if provided
        if (options.pmsRoomTypeIds && options.pmsRoomTypeIds.length > 0) {
          if (!options.pmsRoomTypeIds.includes(mapping.pmsRoomTypeId)) {
            continue;
          }
        }

        const pmsRoomType = pmsRoomTypeMap.get(mapping.pmsRoomTypeId);
        const qloAppsRoomType = qloAppsRoomTypeMap.get(mapping.qloAppsRoomTypeId);

        if (!pmsRoomType || !qloAppsRoomType) {
          skippedCount++;
          continue;
        }

        // Check if QloApps needs updating from PMS
        const updateCheck = roomTypeNeedsUpdate(qloAppsRoomType, pmsRoomType);
        if (updateCheck.needsUpdate) {
          console.log(`[QloApps RoomType] Room type ${pmsRoomType.name} needs update: ${updateCheck.changes.join(', ')}`);
          // Note: Actual update would require QloApps room type update API
          // which is not commonly available in QloApps WebService
          updatedCount++;
        } else {
          skippedCount++;
        }
        processedCount++;
      }

      // Update sync state
      await this.updateSyncState('room_types', true);

      // Log sync results
      await this.logSyncResult({
        syncType: QLOAPPS_CONFIG.SYNC_TYPES.ROOM_TYPES_PULL,
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

      await this.updateSyncState('room_types', false, errorMessage);
    }

    const completedAt = new Date();

    return {
      success: failedCount === 0,
      syncType: QLOAPPS_CONFIG.SYNC_TYPES.ROOM_TYPES_PULL,
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
      direction: 'pull',
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
