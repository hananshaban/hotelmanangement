/**
 * QloApps Room Sync Service
 *
 * Syncs individual rooms between PMS and QloApps.
 * Handles mapping of physical room instances (e.g., GR-101, GR-102).
 */

import { QloAppsClient } from '../qloapps_client.js';
import { QLOAPPS_CONFIG } from '../qloapps_config.js';
import type {
  QloAppsRoom,
  GetHotelRoomsParams,
} from '../qloapps_types.js';
import {
  mapQloAppsRoomToPms,
  validateQloAppsRoom,
} from '../mappers/room_mapper.js';
import db from '../../../config/database.js';
import { decrypt } from '../../../utils/encryption.js';
import type { RoomType } from '../../../services/room_types/room_types_types.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Result of syncing a single room
 */
export interface RoomSyncResult {
  success: boolean;
  pmsRoomId?: string;
  qloAppsRoomId?: number;
  action: 'created' | 'updated' | 'mapped' | 'skipped' | 'failed';
  error?: string;
  roomNumber?: string;
}

/**
 * Options for room sync
 */
export interface RoomSyncOptions {
  /** Only sync rooms for specific room type IDs */
  roomTypeIds?: string[];
  /** Only sync rooms for specific product IDs */
  productIds?: number[];
  /** Create rooms if they don't exist in PMS */
  createIfMissing?: boolean;
  /** Update existing rooms */
  updateExisting?: boolean;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Map room type to Beds24-compatible room_type (lowercase)
 * @param type PMS room type (Single, Double, Suite, General, Other)
 * @returns Beds24 room type (single, double, suite, etc.)
 */
function mapTypeToRoomType(type: string): string {
  const mapping: Record<string, string> = {
    'Single': 'single',
    'Double': 'double',
    'Suite': 'suite',
    'General': 'double', // Default General to double
    'Other': 'double',   // Default Other to double
  };
  return mapping[type] || 'double';
}

// ============================================================================
// Room Sync Service
// ============================================================================

/**
 * Service for syncing individual rooms between PMS and QloApps
 */
export class QloAppsRoomSyncService {
  private client: QloAppsClient;
  private configId: string;
  private hotelId: string;
  private qloAppsHotelId: number;

  constructor(client: QloAppsClient, configId: string, hotelId: string, qloAppsHotelId: number) {
    this.client = client;
    this.configId = configId;
    this.hotelId = hotelId;
    this.qloAppsHotelId = qloAppsHotelId;
  }

  /**
   * Create a new RoomSyncService instance from stored config
   */
  static async fromConfigId(configId: string): Promise<QloAppsRoomSyncService> {
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

    return new QloAppsRoomSyncService(
      client,
      configId,
      config.hotel_id,
      parseInt(config.qloapps_hotel_id, 10)
    );
  }

  /**
   * Pull rooms from QloApps and sync to PMS
   * @param options Sync options
   * @returns Array of sync results
   */
  async pullRooms(options: RoomSyncOptions = {}): Promise<RoomSyncResult[]> {
    console.log(`[QloApps Room Sync] 🏨 Starting room sync for hotel ${this.hotelId}`);
    
    const results: RoomSyncResult[] = [];

    try {
      // Build fetch parameters
      const params: GetHotelRoomsParams = {
        hotelId: this.qloAppsHotelId,
        limit: QLOAPPS_CONFIG.HOTEL_ROOMS_BATCH_SIZE,
      };

      // Filter by product IDs if specified
      if (options.productIds && options.productIds.length > 0) {
        // QloApps API doesn't support multiple product IDs in one call
        // We'll fetch all and filter in memory
        console.log(`[QloApps Room Sync] 📋 Filtering by ${options.productIds.length} product IDs`);
      }

      // Fetch rooms from QloApps
      console.log(`[QloApps Room Sync] 🔄 Fetching rooms from QloApps...`);
      const qloAppsRooms = await this.client.getHotelRooms(params);
      console.log(`[QloApps Room Sync] ✓ Received ${qloAppsRooms.length} rooms`);

      // Filter by product IDs if specified
      const filteredRooms = options.productIds
        ? qloAppsRooms.filter(room => options.productIds!.includes(room.id_product))
        : qloAppsRooms;

      console.log(`[QloApps Room Sync] 📋 Processing ${filteredRooms.length} rooms`);

      // Sync each room
      for (const qloAppsRoom of filteredRooms) {
        const result = await this.syncSingleRoom(qloAppsRoom, options);
        results.push(result);
      }

      // Summary
      const created = results.filter(r => r.success && r.action === 'created').length;
      const updated = results.filter(r => r.success && r.action === 'updated').length;
      const mapped = results.filter(r => r.success && r.action === 'mapped').length;
      const skipped = results.filter(r => r.action === 'skipped').length;
      const failed = results.filter(r => !r.success).length;

      console.log(`[QloApps Room Sync] ✅ Sync complete:`);
      console.log(`[QloApps Room Sync]   Created: ${created}`);
      console.log(`[QloApps Room Sync]   Updated: ${updated}`);
      console.log(`[QloApps Room Sync]   Mapped: ${mapped}`);
      console.log(`[QloApps Room Sync]   Skipped: ${skipped}`);
      console.log(`[QloApps Room Sync]   Failed: ${failed}`);

      return results;
    } catch (error) {
      console.error(`[QloApps Room Sync] ❌ Error during room sync:`, error);
      throw error;
    }
  }

  /**
   * Sync a single room from QloApps to PMS
   * @param qloAppsRoom QloApps room
   * @param options Sync options
   * @returns Sync result
   */
  private async syncSingleRoom(
    qloAppsRoom: QloAppsRoom,
    options: RoomSyncOptions
  ): Promise<RoomSyncResult> {
    try {
      // Validate room data
      const validation = validateQloAppsRoom(qloAppsRoom);
      if (!validation.valid) {
        console.warn(`[QloApps Room Sync] ⚠️ Room ${qloAppsRoom.id} validation failed:`, validation.errors);
        return {
          success: false,
          qloAppsRoomId: qloAppsRoom.id,
          action: 'failed',
          error: `Validation failed: ${validation.errors.join(', ')}`,
          roomNumber: qloAppsRoom.room_num,
        };
      }

      // Check if mapping already exists
      const existingMapping = await db('qloapps_room_mappings')
        .where({
          hotel_id: this.hotelId,
          qloapps_room_id: qloAppsRoom.id.toString(),
          is_active: true,
        })
        .first();

      if (existingMapping) {
        // Mapping exists - update if requested
        if (options.updateExisting) {
          return await this.updateExistingRoom(qloAppsRoom, existingMapping);
        } else {
          return {
            success: true,
            pmsRoomId: existingMapping.local_room_id,
            qloAppsRoomId: qloAppsRoom.id,
            action: 'skipped',
            roomNumber: qloAppsRoom.room_num,
          };
        }
      }

      // Find room type mapping for this room's product
      const roomTypeMapping = await db('qloapps_room_type_mappings')
        .where({
          hotel_id: this.hotelId,
          qloapps_product_id: qloAppsRoom.id_product.toString(),
          is_active: true,
        })
        .first();

      if (!roomTypeMapping) {
        console.warn(`[QloApps Room Sync] ⚠️ No room type mapping for product ${qloAppsRoom.id_product}`);
        return {
          success: false,
          qloAppsRoomId: qloAppsRoom.id,
          action: 'failed',
          error: `No room type mapping for product ${qloAppsRoom.id_product}`,
          roomNumber: qloAppsRoom.room_num,
        };
      }

      // Get PMS room type details
      const pmsRoomType = await db('room_types')
        .where({ id: roomTypeMapping.local_room_type_id })
        .first();

      if (!pmsRoomType) {
        console.warn(`[QloApps Room Sync] ⚠️ PMS room type ${roomTypeMapping.local_room_type_id} not found`);
        return {
          success: false,
          qloAppsRoomId: qloAppsRoom.id,
          action: 'failed',
          error: `PMS room type ${roomTypeMapping.local_room_type_id} not found`,
          roomNumber: qloAppsRoom.room_num,
        };
      }

      // Create new room if requested
      if (options.createIfMissing) {
        return await this.createNewRoom(qloAppsRoom, pmsRoomType, roomTypeMapping.local_room_type_id);
      } else {
        // Try to find existing room by room number
        const existingRoom = await db('rooms')
          .where({ room_number: qloAppsRoom.room_num })
          .whereNull('deleted_at')
          .first();

        if (existingRoom) {
          // Create mapping for existing room
          await this.createMapping(
            qloAppsRoom.id,
            existingRoom.id,
            roomTypeMapping.local_room_type_id
          );

          console.log(`[QloApps Room Sync] ✓ Mapped existing room ${qloAppsRoom.room_num}`);
          return {
            success: true,
            pmsRoomId: existingRoom.id,
            qloAppsRoomId: qloAppsRoom.id,
            action: 'mapped',
            roomNumber: qloAppsRoom.room_num,
          };
        } else {
          return {
            success: false,
            qloAppsRoomId: qloAppsRoom.id,
            action: 'skipped',
            error: 'Room not found in PMS and createIfMissing is false',
            roomNumber: qloAppsRoom.room_num,
          };
        }
      }
    } catch (error) {
      console.error(`[QloApps Room Sync] ❌ Error syncing room ${qloAppsRoom.id}:`, error);
      return {
        success: false,
        qloAppsRoomId: qloAppsRoom.id,
        action: 'failed',
        error: error instanceof Error ? error.message : String(error),
        roomNumber: qloAppsRoom.room_num,
      };
    }
  }

  /**
   * Create a new room in PMS
   */
  private async createNewRoom(
    qloAppsRoom: QloAppsRoom,
    pmsRoomType: RoomType,
    roomTypeId: string
  ): Promise<RoomSyncResult> {
    try {
      // Map QloApps room to PMS format
      const roomData = mapQloAppsRoomToPms(qloAppsRoom, pmsRoomType);

      // Insert room - scoped to current hotel
      const [room] = await db('rooms')
        .insert({
          hotel_id: this.hotelId,
          room_number: roomData.room_number,
          type: roomData.type,
          room_type: mapTypeToRoomType(roomData.type),
          status: roomData.status,
          price_per_night: roomData.price_per_night,
          floor: roomData.floor,
          features: JSON.stringify(roomData.features || []),
          description: roomData.description,
        })
        .returning(['id', 'room_number']);

      // Create mapping
      await this.createMapping(qloAppsRoom.id, room.id, roomTypeId);

      console.log(`[QloApps Room Sync] ✓ Created room ${room.room_number} (${room.id})`);

      return {
        success: true,
        pmsRoomId: room.id,
        qloAppsRoomId: qloAppsRoom.id,
        action: 'created',
        roomNumber: room.room_number,
      };
    } catch (error) {
      console.error(`[QloApps Room Sync] ❌ Error creating room:`, error);
      throw error;
    }
  }

  /**
   * Update an existing room in PMS
   */
  private async updateExistingRoom(
    qloAppsRoom: QloAppsRoom,
    mapping: any
  ): Promise<RoomSyncResult> {
    try {
      // Get PMS room type
      const pmsRoomType = await db('room_types')
        .where({ id: mapping.local_room_type_id })
        .first();

      if (!pmsRoomType) {
        throw new Error(`PMS room type ${mapping.local_room_type_id} not found`);
      }

      // Map QloApps room to PMS format
      const roomData = mapQloAppsRoomToPms(qloAppsRoom, pmsRoomType);

      // Update room
      await db('rooms')
        .where({ id: mapping.local_room_id })
        .update({
          room_number: roomData.room_number,
          type: roomData.type,
          room_type: mapTypeToRoomType(roomData.type),
          status: roomData.status,
          floor: roomData.floor,
          description: roomData.description,
          updated_at: new Date(),
        });

      // Update mapping sync time
      await this.updateMapping(qloAppsRoom.id, mapping.local_room_id);

      console.log(`[QloApps Room Sync] ✓ Updated room ${roomData.room_number}`);

      return {
        success: true,
        pmsRoomId: mapping.local_room_id,
        qloAppsRoomId: qloAppsRoom.id,
        action: 'updated',
        roomNumber: roomData.room_number,
      };
    } catch (error) {
      console.error(`[QloApps Room Sync] ❌ Error updating room:`, error);
      throw error;
    }
  }

  /**
   * Create a mapping between QloApps room and PMS room
   */
  private async createMapping(
    qloAppsRoomId: number,
    pmsRoomId: string,
    roomTypeId: string
  ): Promise<void> {
    await db('qloapps_room_mappings').insert({
      hotel_id: this.hotelId,
      qloapps_hotel_id: this.hotelId.toString(),
      qloapps_room_id: qloAppsRoomId.toString(),
      local_room_id: pmsRoomId,
      local_room_type_id: roomTypeId,
      is_active: true,
      last_synced_at: new Date(),
      last_sync_status: 'success',
    });
  }

  /**
   * Update an existing mapping
   */
  private async updateMapping(
    qloAppsRoomId: number,
    pmsRoomId: string
  ): Promise<void> {
    await db('qloapps_room_mappings')
      .where({
        hotel_id: this.hotelId,
        qloapps_room_id: qloAppsRoomId.toString(),
      })
      .update({
        last_synced_at: new Date(),
        last_sync_status: 'success',
        updated_at: new Date(),
      });
  }
}

