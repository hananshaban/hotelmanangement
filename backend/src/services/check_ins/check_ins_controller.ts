/**
 * Check-ins Controller
 * 
 * HTTP request handlers for check-in/checkout operations and room management.
 */

import type { Request, Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from '../auth/auth_middleware.js';
import type {
  CheckInRequest,
  CheckInResponse,
  CheckOutRequest,
  RoomChangeRequest,
  CheckInsListResponse,
  EligibleRoomsResponse,
} from './check_ins_types.js';
import {
  checkInGuest,
  checkOutGuest,
  changeRoom,
  getCheckInDetails,
  listCheckIns,
  getEligibleRooms,
} from './check_ins_service.js';
import { logCreate, logUpdate, logAction } from '../audit/audit_utils.js';

/**
 * POST /api/check-ins
 * Create a new check-in
 */
export async function createCheckInHandler(
  req: AuthenticatedRequest,
  res: Response<CheckInResponse>,
  next: NextFunction,
) {
  try {
    const hotelId = req.hotelId;
    const userId = req.user?.userId;

    if (!hotelId) {
      res.status(400).json({
        error: 'Hotel context required',
        code: 'HOTEL_CONTEXT_REQUIRED',
      } as any);
      return;
    }

    if (!userId) {
      res.status(401).json({
        error: 'Unauthorized',
      } as any);
      return;
    }

    const request: CheckInRequest = req.body;

    // Validate required fields
    if (!request.reservation_id || !request.actual_room_id) {
      res.status(400).json({
        error: 'Missing required fields: reservation_id, actual_room_id',
      } as any);
      return;
    }

    // Perform check-in
    const checkIn = await checkInGuest(request, hotelId, userId);

    // Audit log
    await logCreate(req, 'check_in', checkIn.id, checkIn);

    res.status(201).json(checkIn);
  } catch (error: any) {
    if (error.message.includes('not found') || error.message.includes('eligible')) {
      res.status(404).json({
        error: error.message,
      } as any);
      return;
    }
    if (
      error.message.includes('Cannot check in') ||
      error.message.includes('already') ||
      error.message.includes('occupied')
    ) {
      res.status(409).json({
        error: error.message,
      } as any);
      return;
    }
    next(error);
  }
}

/**
 * GET /api/check-ins/:id
 * Get check-in details
 */
export async function getCheckInHandler(
  req: AuthenticatedRequest,
  res: Response<CheckInResponse>,
  next: NextFunction,
) {
  try {
    const { id } = req.params;
    const hotelId = req.hotelId;

    if (!hotelId) {
      res.status(400).json({
        error: 'Hotel context required',
        code: 'HOTEL_CONTEXT_REQUIRED',
      } as any);
      return;
    }

    const checkIn = await getCheckInDetails(id!, hotelId!);
    res.json(checkIn);
  } catch (error: any) {
    if (error.message.includes('not found')) {
      res.status(404).json({
        error: error.message,
      } as any);
      return;
    }
    next(error);
  }
}

/**
 * GET /api/check-ins
 * List check-ins with filters
 */
export async function listCheckInsHandler(
  req: AuthenticatedRequest,
  res: Response<CheckInsListResponse>,
  next: NextFunction,
) {
  try {
    const hotelId = req.hotelId;

    if (!hotelId) {
      res.status(400).json({
        error: 'Hotel context required',
        code: 'HOTEL_CONTEXT_REQUIRED',
      } as any);
      return;
    }

    // Extract query parameters
    const {
      status,
      room_id,
      reservation_id,
      checked_in_by,
      check_in_from,
      check_in_to,
      checkout_from,
      checkout_to,
      page = '1',
      page_size = '20',
    } = req.query;

    // Build filters
    const filters: any = {
      hotel_id: hotelId,
    };

    if (status) filters.status = status as string;
    if (room_id) filters.room_id = room_id as string;
    if (reservation_id) filters.reservation_id = reservation_id as string;
    if (checked_in_by) filters.checked_in_by = checked_in_by as string;
    if (check_in_from) filters.check_in_from = check_in_from as string;
    if (check_in_to) filters.check_in_to = check_in_to as string;
    if (checkout_from) filters.checkout_from = checkout_from as string;
    if (checkout_to) filters.checkout_to = checkout_to as string;

    const result = await listCheckIns(
      filters,
      parseInt(page as string, 10),
      parseInt(page_size as string, 10),
    );

    res.json(result);
  } catch (error) {
    next(error);
  }
}

/**
 * PATCH /api/check-ins/:id/checkout
 * Check out a guest
 */
export async function checkOutHandler(
  req: AuthenticatedRequest,
  res: Response<CheckInResponse>,
  next: NextFunction,
) {
  try {
    const { id } = req.params;
    const hotelId = req.hotelId;

    if (!hotelId) {
      res.status(400).json({
        error: 'Hotel context required',
        code: 'HOTEL_CONTEXT_REQUIRED',
      } as any);
      return;
    }

    const request: CheckOutRequest = {
      checkin_id: id!,
      actual_checkout_time: req.body.actual_checkout_time,
      notes: req.body.notes,
    };

    const checkIn = await checkOutGuest(request, hotelId!);

    // Audit log
    await logUpdate(req, 'check_in', checkIn.id, {}, checkIn);

    res.json(checkIn);
  } catch (error: any) {
    if (error.message.includes('not found')) {
      res.status(404).json({
        error: error.message,
      } as any);
      return;
    }
    if (error.message.includes('Cannot check out')) {
      res.status(409).json({
        error: error.message,
      } as any);
      return;
    }
    next(error);
  }
}

/**
 * POST /api/check-ins/:id/change-room
 * Change guest's room during stay
 */
export async function changeRoomHandler(
  req: AuthenticatedRequest,
  res: Response<CheckInResponse>,
  next: NextFunction,
) {
  try {
    const { id } = req.params;
    const hotelId = req.hotelId;
    const userId = req.user?.userId;

    if (!hotelId) {
      res.status(400).json({
        error: 'Hotel context required',
        code: 'HOTEL_CONTEXT_REQUIRED',
      } as any);
      return;
    }

    if (!userId) {
      res.status(401).json({
        error: 'Unauthorized',
      } as any);
      return;
    }

    const request: RoomChangeRequest = {
      checkin_id: id!,
      new_room_id: req.body.new_room_id,
      change_reason: req.body.change_reason,
      notes: req.body.notes,
    };

    // Validate required fields
    if (!request.new_room_id || !request.change_reason) {
      res.status(400).json({
        error: 'Missing required fields: new_room_id, change_reason',
      } as any);
      return;
    }

    const checkIn = await changeRoom(request, hotelId!, userId);

    // Audit log
    await logAction(
      req,
      'change_room',
      'check_in',
      checkIn.id,
      {
        description: `Changed room from ${checkIn.room_assignments?.[checkIn.room_assignments.length - 2]?.to_room_number || 'unknown'} to ${checkIn.actual_room_number}`,
      },
    );

    res.json(checkIn);
  } catch (error: any) {
    if (error.message.includes('not found')) {
      res.status(404).json({
        error: error.message,
      } as any);
      return;
    }
    if (
      error.message.includes('Cannot') ||
      error.message.includes('occupied') ||
      error.message.includes('Out of Service')
    ) {
      res.status(409).json({
        error: error.message,
      } as any);
      return;
    }
    next(error);
  }
}

/**
 * GET /api/reservations/:id/eligible-rooms
 * Get rooms eligible for check-in based on reservation
 */
export async function getEligibleRoomsHandler(
  req: AuthenticatedRequest,
  res: Response<EligibleRoomsResponse>,
  next: NextFunction,
) {
  try {
    const { id } = req.params;
    const hotelId = req.hotelId;

    if (!hotelId) {
      res.status(400).json({
        error: 'Hotel context required',
        code: 'HOTEL_CONTEXT_REQUIRED',
      } as any);
      return;
    }

    const eligibleRooms = await getEligibleRooms(id!, hotelId!);
    res.json(eligibleRooms);
  } catch (error: any) {
    if (error.message.includes('not found')) {
      res.status(404).json({
        error: error.message,
      } as any);
      return;
    }
    if (error.message.includes('Cannot get eligible rooms')) {
      res.status(409).json({
        error: error.message,
      } as any);
      return;
    }
    next(error);
  }
}

/**
 * POST /api/reservations/:id/check-in
 * Shortcut endpoint: check in from reservation
 * 
 * Combines getting eligible rooms and checking in with the first available room
 * (or specified room_id from request body).
 */
export async function checkInFromReservationHandler(
  req: AuthenticatedRequest,
  res: Response<CheckInResponse>,
  next: NextFunction,
) {
  try {
    const { id } = req.params;
    const hotelId = req.hotelId;
    const userId = req.user?.userId;

    if (!hotelId) {
      res.status(400).json({
        error: 'Hotel context required',
        code: 'HOTEL_CONTEXT_REQUIRED',
      } as any);
      return;
    }

    if (!userId) {
      res.status(401).json({
        error: 'Unauthorized',
      } as any);
      return;
    }

    // Get room_id from request body or auto-select first available
    let actualRoomId = req.body.actual_room_id;

    if (!actualRoomId) {
      // Auto-select first available room
      const eligibleRooms = await getEligibleRooms(id!, hotelId!);
      
      if (eligibleRooms.available_rooms.length === 0) {
        res.status(409).json({
          error: 'No available rooms for this reservation',
        } as any);
        return;
      }

      // Prefer reserved room if available, otherwise first available
      const matchedRoom = eligibleRooms.reserved_room_id
        ? eligibleRooms.available_rooms.find(r => r.id === eligibleRooms.reserved_room_id)
        : null;
      actualRoomId = matchedRoom?.id || eligibleRooms.available_rooms[0]?.id;
    }

    const request: CheckInRequest = {
      reservation_id: id!,
      actual_room_id: actualRoomId!,
      notes: req.body.notes,
      check_in_time: req.body.check_in_time,
    };

    const checkIn = await checkInGuest(request, hotelId!, userId);

    // Audit log
    await logCreate(req, 'check_in', checkIn.id, checkIn);

    res.status(201).json(checkIn);
  } catch (error: any) {
    if (error.message.includes('not found') || error.message.includes('eligible')) {
      res.status(404).json({
        error: error.message,
      } as any);
      return;
    }
    if (
      error.message.includes('Cannot check in') ||
      error.message.includes('already') ||
      error.message.includes('occupied')
    ) {
      res.status(409).json({
        error: error.message,
      } as any);
      return;
    }
    next(error);
  }
}


