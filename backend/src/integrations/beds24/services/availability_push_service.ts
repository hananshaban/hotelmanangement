import { Beds24Client } from '../beds24_client.js';
import type { Beds24CalendarUpdate } from '../beds24_types.js';
import type { SyncResult, BatchSyncResult } from '../beds24_sync_types.js';
import {
  mapPmsAvailabilityToBeds24,
  mapPmsRatesToBeds24,
  getDefaultDateRange,
  type DateRange,
} from '../mappers/availability_mapper.js';
import db from '../../../config/database.js';
import { decrypt } from '../../../utils/encryption.js';

/**
 * Service for pushing room availability and rates to Beds24
 */
export class AvailabilityPushService {
  private client: Beds24Client;

  constructor(clientOrRefreshToken: Beds24Client | string) {
    if (clientOrRefreshToken instanceof Beds24Client) {
      this.client = clientOrRefreshToken;
    } else {
      this.client = new Beds24Client(clientOrRefreshToken);
    }
  }

  /**
   * Push room availability to Beds24
   * Supports both individual rooms (legacy) and room types (new)
   */
  async pushRoomAvailability(
    roomId: string,
    dateRange?: DateRange,
    options: { includeRates?: boolean; isRoomType?: boolean; idempotencyKey?: string } = {}
  ): Promise<SyncResult> {
    try {
      const range = dateRange || getDefaultDateRange();

      // Try room type first (new Beds24-style), then fallback to individual room (legacy)
      let room: any = null;
      let beds24RoomId: string | null = null;

      if (options.isRoomType) {
        // Load room type
        room = await db('room_types').where({ id: roomId }).whereNull('deleted_at').first();
        if (room) {
          beds24RoomId = room.beds24_room_id;
        }
      } else {
        // Try individual room first (legacy)
        room = await db('rooms').where({ id: roomId }).first();
        if (room) {
          beds24RoomId = room.beds24_room_id;
        } else {
          // Fallback: try as room type
          room = await db('room_types').where({ id: roomId }).whereNull('deleted_at').first();
          if (room) {
            beds24RoomId = room.beds24_room_id;
          }
        }
      }

      if (!room) {
        return {
          success: false,
          syncType: 'PUSH',
          entityType: 'availability',
          entityId: roomId,
          error: 'Room or room type not found',
          syncedAt: new Date(),
        };
      }

      if (!beds24RoomId) {
        return {
          success: false,
          syncType: 'PUSH',
          entityType: 'availability',
          entityId: roomId,
          error: 'Room/room type not mapped to Beds24',
          syncedAt: new Date(),
        };
      }

      // Load Beds24 config
      const config = await this.loadBeds24Config();
      if (!config?.push_sync_enabled) {
        return {
          success: false,
          syncType: 'PUSH',
          entityType: 'availability',
          entityId: roomId,
          error: 'Push sync is disabled',
          syncedAt: new Date(),
        };
      }

      // Map availability
      const calendarUpdate = await mapPmsAvailabilityToBeds24(
        room,
        range,
        beds24RoomId
      );

      // Push to Beds24
      const requestOptions: { method: 'PUT'; body: Beds24CalendarUpdate; idempotencyKey?: string } = {
        method: 'PUT',
        body: calendarUpdate,
      };
      if (options.idempotencyKey) {
        requestOptions.idempotencyKey = options.idempotencyKey;
      }
      await this.client.makeRequest('/inventory/rooms/calendar', requestOptions);

      // Optionally push rates
      if (options.includeRates) {
        const ratesUpdate = await mapPmsRatesToBeds24(room, range, beds24RoomId);
        await this.client.makeRequest('/inventory/rooms/calendar', {
          method: 'PUT',
          body: ratesUpdate,
        });
      }

      return {
        success: true,
        syncType: 'PUSH',
        entityType: 'availability',
        entityId: roomId,
        beds24Id: beds24RoomId,
        syncedAt: new Date(),
      };
    } catch (error) {
      const result: SyncResult = {
        success: false,
        syncType: 'PUSH',
        entityType: 'availability',
        entityId: roomId,
        error: error instanceof Error ? error.message : 'Unknown error',
        syncedAt: new Date(),
      };
      if (error instanceof Error) {
        result.errorCode = error.constructor.name;
      }
      return result;
    }
  }

  /**
   * Push availability for all rooms and room types
   */
  async pushAllRoomsAvailability(
    propertyId: string = '00000000-0000-0000-0000-000000000001',
    dateRange?: DateRange
  ): Promise<BatchSyncResult> {
    const range = dateRange || getDefaultDateRange();

    // Get all room types with Beds24 mapping (new Beds24-style)
    const roomTypes = await db('room_types')
      .whereNotNull('beds24_room_id')
      .whereNull('deleted_at')
      .select('id', 'beds24_room_id');

    // Get all individual rooms with Beds24 mapping (legacy)
    const rooms = await db('rooms')
      .whereNotNull('beds24_room_id')
      .select('id', 'beds24_room_id');

    const results: SyncResult[] = [];

    // Push room types first (new system)
    for (const roomType of roomTypes) {
      const result = await this.pushRoomAvailability(roomType.id, range, {
        isRoomType: true,
      });
      results.push(result);
    }

    // Push individual rooms (legacy)
    for (const room of rooms) {
      const result = await this.pushRoomAvailability(room.id, range, {
        isRoomType: false,
      });
      results.push(result);
    }

    const successful = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    return {
      total: results.length,
      successful,
      failed,
      results,
    };
  }

  /**
   * Push room rates to Beds24
   * Supports both individual rooms (legacy) and room types (new)
   */
  async pushRates(
    roomId: string,
    idempotencyKey?: string,
    isRoomType: boolean = false
  ): Promise<SyncResult> {
    try {
      const range = getDefaultDateRange();

      // Try room type first (new), then individual room (legacy)
      let room: any = null;
      let beds24RoomId: string | null = null;

      if (isRoomType) {
        room = await db('room_types').where({ id: roomId }).whereNull('deleted_at').first();
        if (room) {
          beds24RoomId = room.beds24_room_id;
        }
      } else {
        room = await db('rooms').where({ id: roomId }).first();
        if (room) {
          beds24RoomId = room.beds24_room_id;
        } else {
          // Fallback: try as room type
          room = await db('room_types').where({ id: roomId }).whereNull('deleted_at').first();
          if (room) {
            beds24RoomId = room.beds24_room_id;
          }
        }
      }

      if (!room || !beds24RoomId) {
        return {
          success: false,
          syncType: 'PUSH',
          entityType: 'rate',
          entityId: roomId,
          error: 'Room/room type not found or not mapped to Beds24',
          syncedAt: new Date(),
        };
      }

      const config = await this.loadBeds24Config();
      if (!config?.push_sync_enabled) {
        return {
          success: false,
          syncType: 'PUSH',
          entityType: 'rate',
          entityId: roomId,
          error: 'Push sync is disabled',
          syncedAt: new Date(),
        };
      }

      const ratesUpdate = await mapPmsRatesToBeds24(room, range, beds24RoomId);

      const requestOptions: { method: 'PUT'; body: Beds24CalendarUpdate; idempotencyKey?: string } = {
        method: 'PUT',
        body: ratesUpdate,
      };
      if (idempotencyKey) {
        requestOptions.idempotencyKey = idempotencyKey;
      }
      await this.client.makeRequest('/inventory/rooms/calendar', requestOptions);

      return {
        success: true,
        syncType: 'PUSH',
        entityType: 'rate',
        entityId: roomId,
        beds24Id: beds24RoomId,
        syncedAt: new Date(),
      };
    } catch (error) {
      const result: SyncResult = {
        success: false,
        syncType: 'PUSH',
        entityType: 'rate',
        entityId: roomId,
        error: error instanceof Error ? error.message : 'Unknown error',
        syncedAt: new Date(),
      };
      if (error instanceof Error) {
        result.errorCode = error.constructor.name;
      }
      return result;
    }
  }

  /**
   * Load Beds24 configuration
   */
  private async loadBeds24Config() {
    const propertyId = '00000000-0000-0000-0000-000000000001';
    const config = await db('beds24_config')
      .where({ property_id: propertyId })
      .first();

    if (!config) {
      return null;
    }

    const refreshToken = decrypt(config.refresh_token);
    this.client.setRefreshToken(refreshToken);

    return {
      ...config,
      refresh_token: refreshToken,
    };
  }
}

