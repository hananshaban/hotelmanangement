import type { Request, Response, NextFunction } from 'express';
import db from '../../config/database.js';
import type {
  CreateReservationRequest,
  UpdateReservationRequest,
  ReservationResponse,
} from './reservations_types.js';
import {
  queueReservationSyncHook,
  queueReservationCancelHook,
  queueRoomAvailabilitySyncHook,
} from '../../integrations/beds24/hooks/sync_hooks.js';
import { RoomTypeAvailabilityService } from '../room_types/room_type_availability_service.js';

const availabilityService = new RoomTypeAvailabilityService();

// Helper function to check for overlapping reservations
async function hasOverlappingReservation(
  roomId: string,
  checkIn: Date,
  checkOut: Date,
  excludeReservationId?: string,
): Promise<boolean> {
  const overlapping = await db('reservations')
    .where({ room_id: roomId })
    .whereNotIn('status', ['Cancelled'])
    .whereNull('deleted_at')
    .where(function () {
      this.where(function () {
        // Check-in is within existing reservation
        this.where('check_in', '<=', checkIn).where('check_out', '>', checkIn);
      })
        .orWhere(function () {
          // Check-out is within existing reservation
          this.where('check_in', '<', checkOut).where('check_out', '>=', checkOut);
        })
        .orWhere(function () {
          // Reservation completely contains existing reservation
          this.where('check_in', '>=', checkIn).where('check_out', '<=', checkOut);
        })
        .orWhere(function () {
          // Reservation is completely within existing reservation
          this.where('check_in', '<=', checkIn).where('check_out', '>=', checkOut);
        });
    });

  if (excludeReservationId) {
    return overlapping.some((res) => res.id !== excludeReservationId);
  }

  return overlapping.length > 0;
}

// Helper function to calculate total amount
async function calculateTotalAmount(
  roomId: string,
  checkIn: Date,
  checkOut: Date,
): Promise<number> {
  const room = await db('rooms').where({ id: roomId }).first();
  if (!room) {
    throw new Error('Room not found');
  }

  const nights = Math.ceil((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24));
  return parseFloat(room.price_per_night) * nights;
}

// Get all reservations
export async function getReservationsHandler(
  req: Request,
  res: Response<ReservationResponse[]>,
  next: NextFunction,
) {
  try {
    const { status, search, check_in, check_out } = req.query;

    let query = db('reservations')
      .select(
        'reservations.*',
        'rooms.room_number',
        'room_types.name as room_type_name',
        'room_types.room_type as room_type',
        'primary_guest.name as primary_guest_name',
        'primary_guest.email as primary_guest_email',
        'primary_guest.phone as primary_guest_phone',
      )
      .leftJoin('rooms', 'reservations.room_id', 'rooms.id')
      .leftJoin('room_types', 'reservations.room_type_id', 'room_types.id')
      .join('guests as primary_guest', 'reservations.primary_guest_id', 'primary_guest.id')
      .whereNull('reservations.deleted_at')
      .orderBy('reservations.created_at', 'desc');

    if (status) {
      query = query.where('reservations.status', status as string);
    }

    if (check_in) {
      query = query.where('reservations.check_in', '>=', check_in as string);
    }

    if (check_out) {
      query = query.where('reservations.check_out', '<=', check_out as string);
    }

    if (search) {
      query = query.where(function () {
        this.where('rooms.room_number', 'ilike', `%${search}%`)
          .orWhere('room_types.name', 'ilike', `%${search}%`)
          .orWhere('primary_guest.name', 'ilike', `%${search}%`)
          .orWhere('reservations.id', 'ilike', `%${search}%`);
      });
    }

    const reservations = await query;

    // Get secondary guests for reservations that have them
    const reservationIds = reservations.map((r) => r.id);
    const secondaryGuests = await db('reservation_guests')
      .select('reservation_guests.*', 'guests.name', 'guests.email', 'guests.phone')
      .join('guests', 'reservation_guests.guest_id', 'guests.id')
      .whereIn('reservation_guests.reservation_id', reservationIds)
      .where('reservation_guests.guest_type', 'Secondary');

    // Map secondary guests to reservations
    const reservationsWithGuests = reservations.map((res) => {
      const secondary = secondaryGuests.find((sg) => sg.reservation_id === res.id);
      return {
        id: res.id,
        room_id: res.room_id,
        room_type_id: res.room_type_id,
        room_number: res.room_number || res.room_type_name,
        room_type_name: res.room_type_name,
        assigned_unit_id: res.assigned_unit_id || null,
        units_requested: res.units_requested || 1,
        primary_guest_id: res.primary_guest_id,
        primary_guest_name: res.primary_guest_name,
        primary_guest_email: res.primary_guest_email,
        primary_guest_phone: res.primary_guest_phone,
        secondary_guest_id: secondary?.guest_id,
        secondary_guest_name: secondary?.name,
        secondary_guest_email: secondary?.email,
        secondary_guest_phone: secondary?.phone,
        check_in: res.check_in,
        check_out: res.check_out,
        status: res.status,
        total_amount: parseFloat(res.total_amount),
        source: res.source,
        beds24_booking_id: res.beds24_booking_id,
        special_requests: res.special_requests,
        created_at: res.created_at,
        updated_at: res.updated_at,
      };
    });

    res.json(reservationsWithGuests as any);
  } catch (error) {
    next(error);
  }
}

// Get single reservation
export async function getReservationHandler(
  req: Request<{ id: string }>,
  res: Response<ReservationResponse>,
  next: NextFunction,
) {
  try {
    const { id } = req.params;

    const reservation = await db('reservations')
      .select(
        'reservations.*',
        'rooms.room_number',
        'room_types.name as room_type_name',
        'room_types.room_type as room_type',
        'primary_guest.name as primary_guest_name',
        'primary_guest.email as primary_guest_email',
        'primary_guest.phone as primary_guest_phone',
      )
      .leftJoin('rooms', 'reservations.room_id', 'rooms.id')
      .leftJoin('room_types', 'reservations.room_type_id', 'room_types.id')
      .join('guests as primary_guest', 'reservations.primary_guest_id', 'primary_guest.id')
      .where('reservations.id', id)
      .whereNull('reservations.deleted_at')
      .first();

    if (!reservation) {
      res.status(404).json({
        error: 'Reservation not found',
      } as any);
      return;
    }

    // Get secondary guest if exists
    const secondaryGuest = await db('reservation_guests')
      .select('reservation_guests.guest_id', 'guests.name', 'guests.email', 'guests.phone')
      .join('guests', 'reservation_guests.guest_id', 'guests.id')
      .where('reservation_guests.reservation_id', id)
      .where('reservation_guests.guest_type', 'Secondary')
      .first();

    const response: ReservationResponse = {
      id: reservation.id,
      room_id: reservation.room_id,
      room_type_id: reservation.room_type_id,
      room_number: reservation.room_number || reservation.room_type_name || null,
      room_type_name: reservation.room_type_name,
      assigned_unit_id: reservation.assigned_unit_id || null,
      units_requested: reservation.units_requested || 1,
      primary_guest_id: reservation.primary_guest_id,
      primary_guest_name: reservation.primary_guest_name,
      primary_guest_email: reservation.primary_guest_email,
      primary_guest_phone: reservation.primary_guest_phone,
      secondary_guest_id: secondaryGuest?.guest_id,
      secondary_guest_name: secondaryGuest?.name,
      secondary_guest_email: secondaryGuest?.email,
      secondary_guest_phone: secondaryGuest?.phone,
      check_in: reservation.check_in,
      check_out: reservation.check_out,
      status: reservation.status,
      total_amount: parseFloat(reservation.total_amount),
      source: reservation.source,
      beds24_booking_id: reservation.beds24_booking_id,
      special_requests: reservation.special_requests,
      created_at: reservation.created_at,
      updated_at: reservation.updated_at,
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
}

// Create reservation
export async function createReservationHandler(
  req: Request<{}, ReservationResponse, CreateReservationRequest>,
  res: Response<ReservationResponse>,
  next: NextFunction,
) {
  try {
    const {
      room_id, // Legacy: individual room
      room_type_id, // New: room type
      assigned_unit_id,
      units_requested = 1,
      primary_guest_id,
      secondary_guest_id,
      check_in,
      check_out,
      status = 'Confirmed',
      source = 'Direct',
      special_requests,
      force = false,
    } = req.body;

    // Validation: require either room_id (legacy) or room_type_id (new)
    if ((!room_id && !room_type_id) || !primary_guest_id || !check_in || !check_out) {
      res.status(400).json({
        error: 'Either room_id or room_type_id, primary_guest_id, check_in, and check_out are required',
      } as any);
      return;
    }

    const checkInDate = new Date(check_in);
    const checkOutDate = new Date(check_out);

    if (checkOutDate <= checkInDate) {
      res.status(400).json({
        error: 'check_out must be after check_in',
      } as any);
      return;
    }

    // Handle room_type_id (new Beds24-style) or room_id (legacy)
    let roomTypeId: string | null = null;
    let roomId: string | null = null;
    let pricePerNight = 0;

    if (room_type_id) {
      // New: Room type based reservation
      const roomType = await db('room_types').where({ id: room_type_id }).whereNull('deleted_at').first();
      if (!roomType) {
        res.status(404).json({
          error: 'Room type not found',
        } as any);
        return;
      }
      roomTypeId = room_type_id;
      pricePerNight = parseFloat(roomType.price_per_night);

      // Check availability for room type
      if (!force) {
        const hasAvailability = await availabilityService.hasAvailability(
          room_type_id,
          checkInDate,
          checkOutDate,
          units_requested
        );
        if (!hasAvailability) {
          res.status(409).json({
            error: `Not enough units available. Requested: ${units_requested}`,
          } as any);
          return;
        }
      }
    } else if (room_id) {
      // Legacy: Individual room based reservation
      const room = await db('rooms').where({ id: room_id }).first();
      if (!room) {
        res.status(404).json({
          error: 'Room not found',
        } as any);
        return;
      }
      roomId = room_id;
      pricePerNight = parseFloat(room.price_per_night);

      // Check for overlapping reservations (unless force is true)
      if (!force) {
        const hasOverlap = await hasOverlappingReservation(room_id, checkInDate, checkOutDate);
        if (hasOverlap) {
          res.status(409).json({
            error: 'Room already has a reservation during this period',
          } as any);
          return;
        }
      }
    }

    // Check if primary guest exists
    const primaryGuest = await db('guests').where({ id: primary_guest_id }).first();
    if (!primaryGuest) {
      res.status(404).json({
        error: 'Primary guest not found',
      } as any);
      return;
    }

    // Calculate total amount
    const nights = Math.ceil((checkOutDate.getTime() - checkInDate.getTime()) / (1000 * 60 * 60 * 24));
    const totalAmount = pricePerNight * nights * units_requested;

    // Create reservation in transaction
    const reservation = await db.transaction(async (trx) => {
      // Create reservation
      const [newReservation] = await trx('reservations')
        .insert({
          room_id: roomId, // Legacy: nullable
          room_type_id: roomTypeId, // New: nullable
          assigned_unit_id: assigned_unit_id || null,
          units_requested: units_requested || 1,
          primary_guest_id,
          check_in: checkInDate.toISOString().split('T')[0],
          check_out: checkOutDate.toISOString().split('T')[0],
          status,
          total_amount: totalAmount,
          source,
          special_requests,
        })
        .returning('*');

      // Create primary guest link
      await trx('reservation_guests').insert({
        reservation_id: newReservation.id,
        guest_id: primary_guest_id,
        guest_type: 'Primary',
      });

      // Create secondary guest link if provided
      if (secondary_guest_id) {
        const secondaryGuest = await trx('guests').where({ id: secondary_guest_id }).first();
        if (!secondaryGuest) {
          throw new Error('Secondary guest not found');
        }

        await trx('reservation_guests').insert({
          reservation_id: newReservation.id,
          guest_id: secondary_guest_id,
          guest_type: 'Secondary',
        });
      }

      // Update room status if status is Checked-in (legacy: only for individual rooms)
      if (status === 'Checked-in' && roomId) {
        await trx('rooms').where({ id: roomId }).update({ status: 'Occupied' });
        await trx('housekeeping')
          .where({ room_id: roomId })
          .update({ status: 'Dirty', updated_at: new Date() });
      }
      // Note: For room types, we don't update individual room status
      // Room type availability is calculated dynamically

      return newReservation;
    });

    // Fetch full reservation with guest details
    const fullReservation = await db('reservations')
      .select(
        'reservations.*',
        'rooms.room_number',
        'room_types.name as room_type_name',
        'room_types.room_type as room_type',
        'primary_guest.name as primary_guest_name',
        'primary_guest.email as primary_guest_email',
        'primary_guest.phone as primary_guest_phone',
      )
      .leftJoin('rooms', 'reservations.room_id', 'rooms.id')
      .leftJoin('room_types', 'reservations.room_type_id', 'room_types.id')
      .join('guests as primary_guest', 'reservations.primary_guest_id', 'primary_guest.id')
      .where('reservations.id', reservation.id)
      .first();

    // Get secondary guest if exists
    const secondaryGuest = await db('reservation_guests')
      .select('reservation_guests.guest_id', 'guests.name', 'guests.email', 'guests.phone')
      .join('guests', 'reservation_guests.guest_id', 'guests.id')
      .where('reservation_guests.reservation_id', reservation.id)
      .where('reservation_guests.guest_type', 'Secondary')
      .first();

    const response: ReservationResponse = {
      id: fullReservation.id,
      room_id: fullReservation.room_id,
      room_type_id: fullReservation.room_type_id,
      room_number: fullReservation.room_number || fullReservation.room_type_name || null,
      room_type_name: fullReservation.room_type_name,
      assigned_unit_id: fullReservation.assigned_unit_id || null,
      units_requested: fullReservation.units_requested || 1,
      primary_guest_id: fullReservation.primary_guest_id,
      primary_guest_name: fullReservation.primary_guest_name,
      primary_guest_email: fullReservation.primary_guest_email,
      primary_guest_phone: fullReservation.primary_guest_phone,
      secondary_guest_id: secondaryGuest?.guest_id,
      secondary_guest_name: secondaryGuest?.name,
      secondary_guest_email: secondaryGuest?.email,
      secondary_guest_phone: secondaryGuest?.phone,
      check_in: fullReservation.check_in,
      check_out: fullReservation.check_out,
      status: fullReservation.status,
      total_amount: parseFloat(fullReservation.total_amount),
      source: fullReservation.source,
      beds24_booking_id: fullReservation.beds24_booking_id,
      special_requests: fullReservation.special_requests,
      created_at: fullReservation.created_at,
      updated_at: fullReservation.updated_at,
    };

    res.status(201).json(response);

    // Queue sync to Beds24 (non-blocking, fire-and-forget)
    // This ensures reservations created in PMS are synced to Beds24
    queueReservationSyncHook(reservation.id, 'create').catch((err) => {
      console.error(
        `[ReservationController] Failed to queue sync for reservation ${reservation.id}:`,
        err
      );
      // Don't throw - sync failures shouldn't break reservation creation
      // The reservation is already created and returned to the user
    });
  } catch (error) {
    next(error);
  }
}

// Update reservation
export async function updateReservationHandler(
  req: Request<{ id: string }, ReservationResponse, UpdateReservationRequest>,
  res: Response<ReservationResponse>,
  next: NextFunction,
) {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Check if reservation exists
    const existing = await db('reservations')
      .where({ id })
      .whereNull('deleted_at')
      .first();

    if (!existing) {
      res.status(404).json({
        error: 'Reservation not found',
      } as any);
      return;
    }

    const updateData: any = {
      updated_at: new Date(),
    };

    let checkInDate = existing.check_in ? new Date(existing.check_in) : null;
    let checkOutDate = existing.check_out ? new Date(existing.check_out) : null;
    let roomId = existing.room_id;

    if (updates.check_in) {
      checkInDate = new Date(updates.check_in);
      updateData.check_in = checkInDate.toISOString().split('T')[0];
    }

    if (updates.check_out) {
      checkOutDate = new Date(updates.check_out);
      updateData.check_out = checkOutDate.toISOString().split('T')[0];
    }

    if (updates.room_id) {
      roomId = updates.room_id;
      updateData.room_id = updates.room_id;
    }

    if (updates.status !== undefined) {
      updateData.status = updates.status;
    }

    if (updates.special_requests !== undefined) {
      updateData.special_requests = updates.special_requests;
    }

    // Validate dates if both are provided
    if (checkInDate && checkOutDate && checkOutDate <= checkInDate) {
      res.status(400).json({
        error: 'check_out must be after check_in',
      } as any);
      return;
    }

    // Check for overlapping reservations if dates or room changed
    if ((updates.check_in || updates.check_out || updates.room_id) && checkInDate && checkOutDate) {
      const hasOverlap = await hasOverlappingReservation(roomId, checkInDate, checkOutDate, id);
      if (hasOverlap) {
        res.status(409).json({
          error: 'Room already has a reservation during this period',
        } as any);
        return;
      }

      // Recalculate total amount if dates or room changed
      const totalAmount = await calculateTotalAmount(roomId, checkInDate, checkOutDate);
      updateData.total_amount = totalAmount;
    }

    // Update reservation in transaction
    await db.transaction(async (trx) => {
      await trx('reservations').where({ id }).update(updateData);

      // Update room status based on reservation status
      if (updates.status) {
        const room = await trx('rooms').where({ id: roomId }).first();
        if (room) {
          if (updates.status === 'Checked-in') {
            await trx('rooms').where({ id: roomId }).update({ status: 'Occupied' });
            await trx('housekeeping')
              .where({ room_id: roomId })
              .update({ status: 'Dirty', updated_at: new Date() });
          } else if (updates.status === 'Checked-out') {
            await trx('rooms').where({ id: roomId }).update({ status: 'Cleaning' });
            await trx('housekeeping')
              .where({ room_id: roomId })
              .update({ status: 'Dirty', updated_at: new Date() });
          } else if (updates.status === 'Cancelled' && room.status === 'Occupied') {
            // Only update if room was occupied by this reservation
            await trx('rooms').where({ id: roomId }).update({ status: 'Available' });
          }
        }
      }
    });

    // Queue Beds24 sync (non-blocking)
    if (existing.source !== 'Beds24') {
      queueReservationSyncHook(id, 'update').catch((err) => {
        console.error('Failed to queue reservation sync:', err);
      });
      // Sync room availability if room or dates changed
      if (updates.room_id || updates.check_in || updates.check_out) {
        queueRoomAvailabilitySyncHook(roomId).catch((err) => {
          console.error('Failed to queue room availability sync:', err);
        });
      }
    }

    // Fetch updated reservation
    const updated = await db('reservations')
      .select(
        'reservations.*',
        'rooms.room_number',
        'primary_guest.name as primary_guest_name',
        'primary_guest.email as primary_guest_email',
        'primary_guest.phone as primary_guest_phone',
      )
      .join('rooms', 'reservations.room_id', 'rooms.id')
      .join('guests as primary_guest', 'reservations.primary_guest_id', 'primary_guest.id')
      .where('reservations.id', id)
      .first();

    // Get secondary guest
    const secondaryGuest = await db('reservation_guests')
      .select('reservation_guests.guest_id', 'guests.name', 'guests.email', 'guests.phone')
      .join('guests', 'reservation_guests.guest_id', 'guests.id')
      .where('reservation_guests.reservation_id', id)
      .where('reservation_guests.guest_type', 'Secondary')
      .first();

    const response: ReservationResponse = {
      id: updated.id,
      room_id: updated.room_id,
      room_number: updated.room_number,
      primary_guest_id: updated.primary_guest_id,
      primary_guest_name: updated.primary_guest_name,
      primary_guest_email: updated.primary_guest_email,
      primary_guest_phone: updated.primary_guest_phone,
      secondary_guest_id: secondaryGuest?.guest_id,
      secondary_guest_name: secondaryGuest?.name,
      secondary_guest_email: secondaryGuest?.email,
      secondary_guest_phone: secondaryGuest?.phone,
      check_in: updated.check_in,
      check_out: updated.check_out,
      status: updated.status,
      total_amount: parseFloat(updated.total_amount),
      source: updated.source,
      beds24_booking_id: updated.beds24_booking_id,
      special_requests: updated.special_requests,
      created_at: updated.created_at,
      updated_at: updated.updated_at,
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
}

// Delete reservation (soft delete)
export async function deleteReservationHandler(
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction,
) {
  try {
    const { id } = req.params;

    const reservation = await db('reservations')
      .where({ id })
      .whereNull('deleted_at')
      .first();

    if (!reservation) {
      res.status(404).json({
        error: 'Reservation not found',
      });
      return;
    }

    // Soft delete
    await db('reservations').where({ id }).update({
      deleted_at: new Date(),
      status: 'Cancelled',
    });

    // Update room status if it was occupied
    if (reservation.status === 'Checked-in') {
      await db('rooms').where({ id: reservation.room_id }).update({ status: 'Available' });
    }

    // Queue Beds24 sync for cancellation (non-blocking)
    if (reservation.source !== 'Beds24') {
      queueReservationCancelHook(id).catch((err) => {
        console.error('Failed to queue reservation cancel sync:', err);
      });
      // Sync room availability
      queueRoomAvailabilitySyncHook(reservation.room_id).catch((err) => {
        console.error('Failed to queue room availability sync:', err);
      });
    }

    res.status(204).send();
  } catch (error) {
    next(error);
  }
}

// Check room availability
export async function checkAvailabilityHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const { check_in, check_out, room_id } = req.query;

    if (!check_in || !check_out) {
      res.status(400).json({
        error: 'check_in and check_out are required',
      });
      return;
    }

    const checkInDate = new Date(check_in as string);
    const checkOutDate = new Date(check_out as string);

    if (checkOutDate <= checkInDate) {
      res.status(400).json({
        error: 'check_out must be after check_in',
      });
      return;
    }

    let query = db('rooms')
      .select('rooms.*')
      .leftJoin('reservations', function () {
        this.on('rooms.id', '=', 'reservations.room_id')
          .andOn('reservations.check_in', '<', db.raw('?', [checkOutDate.toISOString().split('T')[0]]))
          .andOn('reservations.check_out', '>', db.raw('?', [checkInDate.toISOString().split('T')[0]]))
          .andOn('reservations.status', '!=', db.raw('?', ['Cancelled']))
          .andOnNull('reservations.deleted_at');
      })
      .whereNull('reservations.id')
      .where('rooms.status', '!=', 'Out of Service');

    if (room_id) {
      query = query.where('rooms.id', room_id as string);
    }

    const availableRooms = await query;

    res.json({
      available: availableRooms.length > 0,
      rooms: availableRooms,
      check_in: check_in,
      check_out: check_out,
    });
  } catch (error) {
    next(error);
  }
}

