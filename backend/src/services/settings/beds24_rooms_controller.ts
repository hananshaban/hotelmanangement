import type { Request, Response, NextFunction } from 'express';
import { RoomSyncService } from '../../integrations/beds24/services/room_sync_service.js';
import db from '../../config/database.js';
import { decrypt } from '../../utils/encryption.js';

const PROPERTY_ID = '00000000-0000-0000-0000-000000000000';

/**
 * Get Beds24 rooms
 */
export async function getBeds24RoomsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const config = await db('beds24_config')
      .where({ hotel_id: PROPERTY_ID })
      .first();

    if (!config) {
      res.status(404).json({
        error: 'Beds24 configuration not found',
      });
      return;
    }

    const refreshToken = decrypt(config.refresh_token);
    const service = new RoomSyncService(refreshToken);

    const rooms = await service.pullRooms(config.beds24_hotel_id);

    res.json(rooms);
  } catch (error) {
    next(error);
  }
}

/**
 * Get unmapped Beds24 rooms
 */
export async function getUnmappedBeds24RoomsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const config = await db('beds24_config')
      .where({ hotel_id: PROPERTY_ID })
      .first();

    if (!config) {
      res.status(404).json({
        error: 'Beds24 configuration not found',
      });
      return;
    }

    const refreshToken = decrypt(config.refresh_token);
    const service = new RoomSyncService(refreshToken);

    const rooms = await service.getUnmappedBeds24Rooms(config.beds24_hotel_id);

    res.json(rooms);
  } catch (error) {
    next(error);
  }
}

/**
 * Get PMS rooms with mapping status
 */
export async function getPmsRoomsWithMappingHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const rooms = await db('rooms')
      .select('id', 'room_number', 'type', 'status', 'cm_room_id as beds24_room_id')
      .orderBy('room_number', 'asc');

    res.json(rooms);
  } catch (error) {
    next(error);
  }
}

/**
 * Map PMS room to Beds24 room
 */
export async function mapRoomHandler(
  req: Request<{}, {}, { pmsRoomId: string; beds24RoomId: string }>,
  res: Response,
  next: NextFunction,
) {
  try {
    const { pmsRoomId, beds24RoomId } = req.body;

    if (!pmsRoomId || !beds24RoomId) {
      res.status(400).json({
        error: 'pmsRoomId and beds24RoomId are required',
      });
      return;
    }

    const config = await db('beds24_config')
      .where({ hotel_id: PROPERTY_ID })
      .first();

    if (!config) {
      res.status(404).json({
        error: 'Beds24 configuration not found',
      });
      return;
    }

    const refreshToken = decrypt(config.refresh_token);
    const service = new RoomSyncService(refreshToken);

    const result = await service.mapRoomToBeds24(pmsRoomId, beds24RoomId);

    if (!result.success) {
      res.status(400).json({
        error: result.error,
      });
      return;
    }

    res.json({ success: true, message: 'Room mapped successfully' });
  } catch (error) {
    next(error);
  }
}

/**
 * Unmap PMS room from Beds24
 */
export async function unmapRoomHandler(
  req: Request<{ roomId: string }>,
  res: Response,
  next: NextFunction,
) {
  try {
    const { roomId } = req.params;

    const config = await db('beds24_config')
      .where({ hotel_id: PROPERTY_ID })
      .first();

    if (!config) {
      res.status(404).json({
        error: 'Beds24 configuration not found',
      });
      return;
    }

    const refreshToken = decrypt(config.refresh_token);
    const service = new RoomSyncService(refreshToken);

    await service.unmapRoomFromBeds24(roomId);

    res.json({ success: true, message: 'Room unmapped successfully' });
  } catch (error) {
    next(error);
  }
}

/**
 * Auto-create PMS rooms from Beds24
 */
export async function autoCreateRoomsHandler(
  req: Request<{}, {}, { defaultPrice?: number; defaultFloor?: number }>,
  res: Response,
  next: NextFunction,
) {
  try {
    const config = await db('beds24_config')
      .where({ hotel_id: PROPERTY_ID })
      .first();

    if (!config) {
      res.status(404).json({
        error: 'Beds24 configuration not found',
      });
      return;
    }

    const refreshToken = decrypt(config.refresh_token);
    const service = new RoomSyncService(refreshToken);

    const options: {
      roomTypeMapping?: Record<string, 'Single' | 'Double' | 'Suite'>;
      defaultPrice?: number;
      defaultFloor?: number;
    } = {};

    if (req.body.defaultPrice !== undefined) {
      options.defaultPrice = req.body.defaultPrice;
    }
    if (req.body.defaultFloor !== undefined) {
      options.defaultFloor = req.body.defaultFloor;
    }

    const result = await service.autoCreateRoomsFromBeds24(config.beds24_hotel_id, options);

    res.json(result);
  } catch (error) {
    next(error);
  }
}

