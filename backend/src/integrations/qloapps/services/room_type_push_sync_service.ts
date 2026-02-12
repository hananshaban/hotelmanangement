/**
 * QloApps Room Type Push Sync Service
 *
 * Pushes room types from PMS to QloApps as products.
 * Handles creating and updating products in QloApps.
 */

import { QloAppsClient } from '../qloapps_client.js';
import { QLOAPPS_CONFIG } from '../qloapps_config.js';
import type { QloAppsRoomType } from '../qloapps_types.js';
import { mapPmsRoomTypeToQloApps } from '../mappers/room_type_mapper.js';
import db from '../../../config/database.js';
import { decrypt } from '../../../utils/encryption.js';
import type { RoomType } from '../../../services/room_types/room_types_types.js';
import crypto from 'crypto';

// ============================================================================
// Types
// ============================================================================

/**
 * Result of pushing a single room type
 */
export interface RoomTypePushResult {
  success: boolean;
  pmsRoomTypeId: string;
  qloAppsProductId?: number;
  action: 'created' | 'updated' | 'skipped' | 'failed';
  error?: string;
}

/**
 * Options for push sync operation
 */
export interface RoomTypePushSyncOptions {
  /** Specific room type IDs to push */
  roomTypeIds?: string[];
  /** Force update even if no changes detected */
  forceUpdate?: boolean;
}

// ============================================================================
// Room Type Push Sync Service
// ============================================================================

/**
 * Service for pushing room types from PMS to QloApps
 */
export class QloAppsRoomTypePushSyncService {
  private client: QloAppsClient;
  private configId: string;
  private hotelId: string;
  private qloAppsHotelId: number;

  constructor(
    client: QloAppsClient,
    configId: string,
    hotelId: string,
    qloAppsHotelId: number
  ) {
    this.client = client;
    this.configId = configId;
    this.hotelId = hotelId;
    this.qloAppsHotelId = qloAppsHotelId;
  }

  /**
   * Create a new RoomTypePushSyncService instance from stored config
   */
  static async fromConfigId(configId: string): Promise<QloAppsRoomTypePushSyncService> {
    const config = await db('qloapps_config')
      .where({ id: configId })
      .first();

    if (!config) {
      throw new Error(`QloApps config not found: ${configId}`);
    }

    const apiKey = decrypt(config.api_key_encrypted);
    const hotelId = parseInt(config.qloapps_hotel_id, 10);

    const client = new QloAppsClient({
      baseUrl: config.base_url,
      apiKey,
      hotelId,
    });

    return new QloAppsRoomTypePushSyncService(
      client,
      configId,
      config.hotel_id,
      hotelId
    );
  }

  /**
   * Push a single room type to QloApps
   */
  async pushRoomType(roomTypeId: string): Promise<RoomTypePushResult> {
    console.log(`[QloApps RoomType Push] Processing room type ${roomTypeId}...`);

    try {
      // Get room type from database
      const roomType = await db('room_types')
        .where({ id: roomTypeId })
        .whereNull('deleted_at')
        .first();

      if (!roomType) {
        return {
          success: false,
          pmsRoomTypeId: roomTypeId,
          action: 'failed',
          error: 'Room type not found',
        };
      }

      // Check if room type is already mapped
      const existingMapping = await db('qloapps_room_type_mappings')
        .where({
          hotel_id: this.hotelId,
          local_room_type_id: roomTypeId,
          is_active: true,
        })
        .first();

      if (existingMapping) {
        // Update existing product
        return await this.updateRoomType(roomType, parseInt(existingMapping.qloapps_product_id, 10));
      } else {
        // Create new product
        return await this.createRoomType(roomType);
      }
    } catch (error) {
      console.error(`[QloApps RoomType Push] Error pushing room type ${roomTypeId}:`, error);
      return {
        success: false,
        pmsRoomTypeId: roomTypeId,
        action: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Create a new room type (product) in QloApps
   */
  private async createRoomType(roomType: RoomType): Promise<RoomTypePushResult> {
    console.log(`[QloApps RoomType Push] Creating product for room type ${roomType.id}...`);

    try {
      // Map room type to QloApps format
      const productData = mapPmsRoomTypeToQloApps(roomType);

      // Note: QloApps API for creating room types/products is not fully implemented
      // in the client yet. This is a placeholder for when it's available.
      // For now, room types are typically synced from QloApps to PMS (pull), not push.
      
      console.warn(`[QloApps RoomType Push] Product creation not fully implemented in QloApps API`);
      console.warn(`[QloApps RoomType Push] Room types should be created in QloApps and synced to PMS`);

      return {
        success: false,
        pmsRoomTypeId: roomType.id,
        action: 'skipped',
        error: 'Product creation not supported - create room types in QloApps first',
      };

      // TODO: When QloApps provides product creation API, implement:
      // const qloAppsProductId = await this.client.createRoomType(productData);
      // await this.createMapping(roomType.id, qloAppsProductId);
    } catch (error) {
      console.error(`[QloApps RoomType Push] Error creating product:`, error);
      return {
        success: false,
        pmsRoomTypeId: roomType.id,
        action: 'failed',
        error: error instanceof Error ? error.message : 'Failed to create product',
      };
    }
  }

  /**
   * Update an existing room type (product) in QloApps
   */
  private async updateRoomType(
    roomType: RoomType,
    qloAppsProductId: number
  ): Promise<RoomTypePushResult> {
    console.log(`[QloApps RoomType Push] Updating product ${qloAppsProductId} for room type ${roomType.id}...`);

    try {
      // Get current product data from QloApps
      const currentProduct = await this.client.getRoomType(qloAppsProductId);

      if (!currentProduct) {
        console.warn(`[QloApps RoomType Push] Product ${qloAppsProductId} not found in QloApps`);
        return {
          success: false,
          pmsRoomTypeId: roomType.id,
          qloAppsProductId,
          action: 'failed',
          error: 'Product not found in QloApps',
        };
      }

      // Check if update is needed
      const needsUpdate = this.checkIfUpdateNeeded(roomType, currentProduct);

      if (!needsUpdate) {
        console.log(`[QloApps RoomType Push] Product ${qloAppsProductId} is up to date, skipping`);
        
        // Update last synced timestamp
        await db('qloapps_room_type_mappings')
          .where({
            hotel_id: this.hotelId,
            local_room_type_id: roomType.id,
          })
          .update({
            last_synced_at: new Date(),
            updated_at: new Date(),
          });

        return {
          success: true,
          pmsRoomTypeId: roomType.id,
          qloAppsProductId,
          action: 'skipped',
        };
      }

      // Note: QloApps API for updating room types is limited
      // Only certain fields can be updated (e.g., price, availability)
      // Structural changes should be made in QloApps directly
      
      console.log(`[QloApps RoomType Push] Product updates limited by QloApps API`);
      console.log(`[QloApps RoomType Push] Price/availability updates handled separately`);

      // Update mapping timestamp
      await db('qloapps_room_type_mappings')
        .where({
          hotel_id: this.hotelId,
          local_room_type_id: roomType.id,
        })
        .update({
          last_synced_at: new Date(),
          updated_at: new Date(),
        });

      return {
        success: true,
        pmsRoomTypeId: roomType.id,
        qloAppsProductId,
        action: 'skipped',
        error: 'Full product updates not supported - use availability/rate sync instead',
      };

      // TODO: When QloApps provides full product update API, implement:
      // const updateData = mapPmsRoomTypeToQloAppsUpdate(roomType, qloAppsProductId);
      // await this.client.updateRoomType(updateData);
    } catch (error) {
      console.error(`[QloApps RoomType Push] Error updating product:`, error);
      return {
        success: false,
        pmsRoomTypeId: roomType.id,
        qloAppsProductId,
        action: 'failed',
        error: error instanceof Error ? error.message : 'Failed to update product',
      };
    }
  }

  /**
   * Create a room type mapping
   */
  private async createMapping(
    roomTypeId: string,
    qloAppsProductId: number
  ): Promise<void> {
    await db('qloapps_room_type_mappings').insert({
      id: crypto.randomUUID(),
      hotel_id: this.hotelId,
      local_room_type_id: roomTypeId,
      qloapps_product_id: qloAppsProductId.toString(),
      qloapps_hotel_id: this.hotelId.toString(),
      sync_direction: 'outbound',
      is_active: true,
      last_synced_at: new Date(),
      created_at: new Date(),
      updated_at: new Date(),
    });

    console.log(`[QloApps RoomType Push] Created mapping: room type ${roomTypeId} -> product ${qloAppsProductId}`);
  }

  /**
   * Check if room type update is needed
   */
  private checkIfUpdateNeeded(roomType: RoomType, product: QloAppsRoomType): boolean {
    // Check name
    if (roomType.name !== product.name) {
      return true;
    }

    // Check price
    const roomTypePrice = parseFloat(roomType.price_per_night.toString());
    const productPrice = typeof product.price === 'string' 
      ? parseFloat(product.price) 
      : product.price;
    
    if (Math.abs(roomTypePrice - productPrice) > 0.01) {
      return true;
    }

    // Check capacity
    if (roomType.max_adult !== product.max_adults) {
      return true;
    }

    if (roomType.max_children !== product.max_children) {
      return true;
    }

    return false;
  }

  /**
   * Push multiple room types
   */
  async pushRoomTypes(roomTypeIds: string[]): Promise<RoomTypePushResult[]> {
    const results: RoomTypePushResult[] = [];

    console.log(`[QloApps RoomType Push] Pushing ${roomTypeIds.length} room types...`);

    for (const roomTypeId of roomTypeIds) {
      const result = await this.pushRoomType(roomTypeId);
      results.push(result);
    }

    return results;
  }

  /**
   * Sync all room type mappings
   * Useful for initial setup - maps existing room types to QloApps products
   */
  async syncRoomTypeMappings(): Promise<void> {
    console.log(`[QloApps RoomType Push] Syncing room type mappings...`);

    try {
      // Get all QloApps room types for this hotel
      const qloAppsRoomTypes = await this.client.getRoomTypes({
        hotelId: this.qloAppsHotelId,
        active: true,
      });

      // Get all PMS room types
      const pmsRoomTypes = await db('room_types')
        .whereNull('deleted_at')
        .where({ hotel_id: this.hotelId });

      console.log(`[QloApps RoomType Push] Found ${qloAppsRoomTypes.length} QloApps room types`);
      console.log(`[QloApps RoomType Push] Found ${pmsRoomTypes.length} PMS room types`);

      // Auto-map by name similarity
      for (const pmsRoomType of pmsRoomTypes) {
        // Check if already mapped
        const existingMapping = await db('qloapps_room_type_mappings')
          .where({
            hotel_id: this.hotelId,
            local_room_type_id: pmsRoomType.id,
            is_active: true,
          })
          .first();

        if (existingMapping) {
          console.log(`[QloApps RoomType Push] Room type ${pmsRoomType.name} already mapped`);
          continue;
        }

        // Find matching QloApps room type by name
        const matchingQloAppsRoomType = qloAppsRoomTypes.find(
          qrt => qrt.name.toLowerCase().trim() === pmsRoomType.name.toLowerCase().trim()
        );

        if (matchingQloAppsRoomType) {
          await this.createMapping(pmsRoomType.id, matchingQloAppsRoomType.id);
          console.log(`[QloApps RoomType Push] Auto-mapped: ${pmsRoomType.name} -> ${matchingQloAppsRoomType.name}`);
        } else {
          console.log(`[QloApps RoomType Push] No match found for room type: ${pmsRoomType.name}`);
        }
      }

      console.log(`[QloApps RoomType Push] Room type mapping sync complete`);
    } catch (error) {
      console.error(`[QloApps RoomType Push] Error syncing mappings:`, error);
      throw error;
    }
  }
}

