/**
 * Check-ins Service
 * 
 * Core business logic for check-in/checkout operations, room changes,
 * and room assignment audit trail.
 */

import db from '../../config/database.js';
import type { Knex } from 'knex';
import type {
  CheckInRequest,
  CheckInResponse,
  CheckOutRequest,
  RoomChangeRequest,
  RoomAssignment,
  CheckInFilters,
  CheckInsListResponse,
  EligibleRoomsResponse,
  ReservationSummary,
  RoomDetails,
} from './check_ins_types.js';
import {
  queueQloAppsCheckInSyncHook,
  queueQloAppsCheckOutSyncHook,
  queueQloAppsRoomChangeSyncHook,
} from '../../integrations/qloapps/hooks/sync_hooks.js';

/**
 * Check in a guest
 * 
 * Creates check-in record, updates reservation status, and creates initial room assignment.
 * Validates:
 * - Reservation exists and is in 'Confirmed' status
 * - Room exists and is available
 * - Room matches the reserved room type (if applicable)
 */
export async function checkInGuest(
  request: CheckInRequest,
  hotelId: string,
  checkedInBy: string,
): Promise<CheckInResponse> {
  return await db.transaction(async (trx: Knex.Transaction) => {
    // 1. Validate reservation exists and is eligible for check-in
    const reservation = await trx('reservations')
      .where({ id: request.reservation_id, hotel_id: hotelId })
      .whereNull('deleted_at')
      .first();

    if (!reservation) {
      throw new Error('Reservation not found');
    }

    if (reservation.status !== 'Confirmed') {
      throw new Error(`Cannot check in reservation with status: ${reservation.status}. Must be Confirmed.`);
    }

    if (reservation.checkin_id) {
      throw new Error('Reservation already has an active check-in');
    }

    // 2. Validate room exists and is available
    const room = await trx('rooms')
      .where({ id: request.actual_room_id, hotel_id: hotelId })
      .first();

    if (!room) {
      throw new Error('Room not found');
    }

    if (room.status === 'Out of Service') {
      throw new Error('Cannot check in to a room that is Out of Service');
    }

    // 3. Check if room matches reserved room type (if applicable)
    if (reservation.room_type_id && room.room_type_id !== reservation.room_type_id) {
      // Allow but log warning (business might allow upgrades/downgrades)
      console.warn(
        `[CheckIn] Room type mismatch: reserved ${reservation.room_type_id}, assigned ${room.room_type_id}`
      );
    }

    // 4. Validate room is not already occupied by another check-in
    const existingCheckIn = await trx('check_ins')
      .where({
        actual_room_id: request.actual_room_id,
        status: 'checked_in',
      })
      .first();

    if (existingCheckIn) {
      throw new Error('Room is already occupied by another check-in');
    }

    // 5. Create check-in record
    const checkInTime = request.check_in_time
      ? new Date(request.check_in_time)
      : new Date();

    const expectedCheckoutTime = new Date(reservation.check_out);

    const [checkIn] = await trx('check_ins')
      .insert({
        hotel_id: hotelId,
        reservation_id: request.reservation_id,
        actual_room_id: request.actual_room_id,
        check_in_time: checkInTime,
        expected_checkout_time: expectedCheckoutTime,
        checked_in_by: checkedInBy,
        notes: request.notes,
        status: 'checked_in',
      })
      .returning('*');

    // 6. Create initial room assignment record (audit trail)
    const [roomAssignment] = await trx('room_assignments')
      .insert({
        hotel_id: hotelId,
        checkin_id: checkIn.id,
        from_room_id: null, // Initial assignment has no "from" room
        to_room_id: request.actual_room_id,
        assignment_type: 'initial',
        change_reason: null,
        notes: request.notes,
        assigned_by: checkedInBy,
      })
      .returning('*');

    // 7. Update reservation: set status to 'Checked-in' and link to check-in
    await trx('reservations')
      .where({ id: request.reservation_id })
      .update({
        status: 'Checked-in',
        checkin_id: checkIn.id,
        updated_at: trx.fn.now(),
      });

    // 8. Update room status to 'Occupied'
    await trx('rooms')
      .where({ id: request.actual_room_id })
      .update({
        status: 'Occupied',
        updated_at: trx.fn.now(),
      });

    // 9. Fetch complete check-in details to return
    const checkInDetails = await getCheckInDetails(checkIn.id, hotelId, trx);
    
    // 10. Queue QloApps sync (after transaction commits)
    // This is non-blocking and happens outside the transaction
    setImmediate(() => {
      queueQloAppsCheckInSyncHook(checkIn.id, 'checkin').catch((err) => {
        console.error(`[CheckIn] Failed to queue QloApps sync for check-in ${checkIn.id}:`, err);
      });
    });
    
    return checkInDetails;
  });
}

/**
 * Check out a guest
 * 
 * Updates check-in status to checked_out, updates reservation status,
 * and sets room status to Cleaning.
 */
export async function checkOutGuest(
  request: CheckOutRequest,
  hotelId: string,
): Promise<CheckInResponse> {
  return await db.transaction(async (trx: Knex.Transaction) => {
    // 1. Validate check-in exists
    const checkIn = await trx('check_ins')
      .where({ id: request.checkin_id, hotel_id: hotelId })
      .first();

    if (!checkIn) {
      throw new Error('Check-in not found');
    }

    if (checkIn.status !== 'checked_in') {
      throw new Error(`Cannot check out. Check-in status is: ${checkIn.status}`);
    }

    // 2. Update check-in record
    const actualCheckoutTime = request.actual_checkout_time
      ? new Date(request.actual_checkout_time)
      : new Date();

    await trx('check_ins')
      .where({ id: request.checkin_id })
      .update({
        actual_checkout_time: actualCheckoutTime,
        status: 'checked_out',
        notes: request.notes
          ? checkIn.notes
            ? `${checkIn.notes}\n\nCheckout: ${request.notes}`
            : request.notes
          : checkIn.notes,
        updated_at: trx.fn.now(),
      });

    // 3. Update reservation status to 'Checked-out'
    await trx('reservations')
      .where({ id: checkIn.reservation_id })
      .update({
        status: 'Checked-out',
        updated_at: trx.fn.now(),
      });

    // 4. Update room status to 'Cleaning' (ready for housekeeping)
    await trx('rooms')
      .where({ id: checkIn.actual_room_id })
      .update({
        status: 'Cleaning',
        updated_at: trx.fn.now(),
      });

    // 5. Update housekeeping status to 'Dirty'
    await trx('housekeeping')
      .where({ room_id: checkIn.actual_room_id })
      .update({
        status: 'Dirty',
        updated_at: trx.fn.now(),
      });

    // 6. Fetch and return updated check-in details
    const checkInDetails = await getCheckInDetails(request.checkin_id, hotelId, trx);
    
    // 7. Queue QloApps sync (after transaction commits)
    // This is non-blocking and happens outside the transaction
    setImmediate(() => {
      queueQloAppsCheckOutSyncHook(request.checkin_id).catch((err) => {
        console.error(`[CheckOut] Failed to queue QloApps sync for checkout ${request.checkin_id}:`, err);
      });
    });
    
    return checkInDetails;
  });
}

/**
 * Change guest's room during their stay
 * 
 * Creates new room assignment, updates check-in record, and manages room statuses.
 */
export async function changeRoom(
  request: RoomChangeRequest,
  hotelId: string,
  assignedBy: string,
): Promise<CheckInResponse> {
  return await db.transaction(async (trx: Knex.Transaction) => {
    // 1. Validate check-in exists and is active
    const checkIn = await trx('check_ins')
      .where({ id: request.checkin_id, hotel_id: hotelId })
      .first();

    if (!checkIn) {
      throw new Error('Check-in not found');
    }

    if (checkIn.status !== 'checked_in') {
      throw new Error(`Cannot change room. Check-in status is: ${checkIn.status}`);
    }

    // 2. Validate new room exists and is available
    const newRoom = await trx('rooms')
      .where({ id: request.new_room_id, hotel_id: hotelId })
      .first();

    if (!newRoom) {
      throw new Error('New room not found');
    }

    if (newRoom.status === 'Out of Service') {
      throw new Error('Cannot move guest to a room that is Out of Service');
    }

    // 3. Validate new room is not occupied
    const occupiedCheckIn = await trx('check_ins')
      .where({
        actual_room_id: request.new_room_id,
        status: 'checked_in',
      })
      .whereNot({ id: request.checkin_id })
      .first();

    if (occupiedCheckIn) {
      throw new Error('New room is already occupied');
    }

    // 4. Get current room for audit trail
    const oldRoomId = checkIn.actual_room_id;

    // 5. Determine assignment type based on change reason
    let assignmentType: 'change' | 'upgrade' | 'downgrade' = 'change';
    if (request.change_reason === 'upgrade') {
      assignmentType = 'upgrade';
    } else if (request.change_reason === 'downgrade') {
      assignmentType = 'downgrade';
    }

    // 6. Create room assignment record (audit trail)
    await trx('room_assignments')
      .insert({
        hotel_id: hotelId,
        checkin_id: request.checkin_id,
        from_room_id: oldRoomId,
        to_room_id: request.new_room_id,
        assignment_type: assignmentType,
        change_reason: request.change_reason,
        notes: request.notes,
        assigned_by: assignedBy,
      });

    // 7. Update check-in with new room
    await trx('check_ins')
      .where({ id: request.checkin_id })
      .update({
        actual_room_id: request.new_room_id,
        updated_at: trx.fn.now(),
      });

    // 8. Update old room status to 'Cleaning'
    await trx('rooms')
      .where({ id: oldRoomId })
      .update({
        status: 'Cleaning',
        updated_at: trx.fn.now(),
      });

    // 9. Update old room housekeeping status to 'Dirty'
    await trx('housekeeping')
      .where({ room_id: oldRoomId })
      .update({
        status: 'Dirty',
        updated_at: trx.fn.now(),
      });

    // 10. Update new room status to 'Occupied'
    await trx('rooms')
      .where({ id: request.new_room_id })
      .update({
        status: 'Occupied',
        updated_at: trx.fn.now(),
      });

    // 11. Fetch and return updated check-in details
    const checkInDetails = await getCheckInDetails(request.checkin_id, hotelId, trx);
    
    // 12. Queue QloApps sync (after transaction commits)
    // This is non-blocking and happens outside the transaction
    setImmediate(() => {
      queueQloAppsRoomChangeSyncHook(request.checkin_id).catch((err) => {
        console.error(`[RoomChange] Failed to queue QloApps sync for room change ${request.checkin_id}:`, err);
      });
    });
    
    return checkInDetails;
  });
}

/**
 * Get check-in details with related data
 */
export async function getCheckInDetails(
  checkinId: string,
  hotelId: string,
  trx?: Knex.Transaction,
): Promise<CheckInResponse> {
  const query = trx || db;

  // Fetch check-in with room details
  const checkIn = await query('check_ins')
    .where({ 'check_ins.id': checkinId, 'check_ins.hotel_id': hotelId })
    .leftJoin('rooms', 'check_ins.actual_room_id', 'rooms.id')
    .leftJoin('users', 'check_ins.checked_in_by', 'users.id')
    .select(
      'check_ins.*',
      'rooms.room_number as actual_room_number',
      query.raw('CONCAT(users.first_name, \' \', users.last_name) as checked_in_by_name')
    )
    .first();

  if (!checkIn) {
    throw new Error('Check-in not found');
  }

  // Fetch reservation summary
  const reservation = await query('reservations')
    .where({ 'reservations.id': checkIn.reservation_id })
    .leftJoin('guests as pg', 'reservations.primary_guest_id', 'pg.id')
    .leftJoin('room_types', 'reservations.room_type_id', 'room_types.id')
    .leftJoin('rooms as reserved_room', 'reservations.reserved_room_id', 'reserved_room.id')
    .select(
      'reservations.id',
      'reservations.check_in',
      'reservations.check_out',
      'reservations.status',
      'reservations.special_requests',
      'reservations.room_type_id',
      'reservations.reserved_room_id',
      'room_types.name as room_type_name',
      'reserved_room.room_number as reserved_room_number',
      'pg.id as primary_guest_id',
      'pg.name as primary_guest_name',
      'pg.email as primary_guest_email',
      'pg.phone as primary_guest_phone'
    )
    .first();

  // Fetch room assignments (audit trail)
  const roomAssignments = await query('room_assignments')
    .where({ checkin_id: checkinId })
    .leftJoin('rooms as from_room', 'room_assignments.from_room_id', 'from_room.id')
    .leftJoin('rooms as to_room', 'room_assignments.to_room_id', 'to_room.id')
    .leftJoin('users', 'room_assignments.assigned_by', 'users.id')
    .select(
      'room_assignments.*',
      'from_room.room_number as from_room_number',
      'to_room.room_number as to_room_number',
      query.raw('CONCAT(users.first_name, \' \', users.last_name) as assigned_by_name')
    )
    .orderBy('room_assignments.assigned_at', 'asc');

  // Build response
  const response: CheckInResponse = {
    id: checkIn.id,
    hotel_id: checkIn.hotel_id,
    reservation_id: checkIn.reservation_id,
    actual_room_id: checkIn.actual_room_id,
    actual_room_number: checkIn.actual_room_number,
    check_in_time: checkIn.check_in_time.toISOString(),
    expected_checkout_time: checkIn.expected_checkout_time?.toISOString() || null,
    actual_checkout_time: checkIn.actual_checkout_time?.toISOString() || null,
    checked_in_by: checkIn.checked_in_by,
    checked_in_by_name: checkIn.checked_in_by_name || null,
    notes: checkIn.notes,
    status: checkIn.status,
    created_at: checkIn.created_at.toISOString(),
    updated_at: checkIn.updated_at.toISOString(),
  };

  // Add reservation summary
  if (reservation) {
    response.reservation = {
      id: reservation.id,
      primary_guest_id: reservation.primary_guest_id,
      primary_guest_name: reservation.primary_guest_name,
      primary_guest_email: reservation.primary_guest_email,
      primary_guest_phone: reservation.primary_guest_phone,
      check_in: reservation.check_in,
      check_out: reservation.check_out,
      status: reservation.status,
      room_type_id: reservation.room_type_id,
      room_type_name: reservation.room_type_name || null,
      reserved_room_id: reservation.reserved_room_id,
      reserved_room_number: reservation.reserved_room_number || null,
      special_requests: reservation.special_requests,
    };
  }

  // Add room assignments
  if (roomAssignments.length > 0) {
    response.room_assignments = roomAssignments.map((ra: any) => ({
      id: ra.id,
      hotel_id: ra.hotel_id,
      checkin_id: ra.checkin_id,
      from_room_id: ra.from_room_id,
      to_room_id: ra.to_room_id,
      assignment_type: ra.assignment_type,
      change_reason: ra.change_reason,
      notes: ra.notes,
      assigned_by: ra.assigned_by,
      assigned_by_name: ra.assigned_by_name || null,
      assigned_at: ra.assigned_at.toISOString(),
      from_room_number: ra.from_room_number || undefined,
      to_room_number: ra.to_room_number,
    }));
  }

  return response;
}

/**
 * List check-ins with filters and pagination
 */
export async function listCheckIns(
  filters: CheckInFilters,
  page: number = 1,
  pageSize: number = 20,
): Promise<CheckInsListResponse> {
  const offset = (page - 1) * pageSize;

  let query = db('check_ins')
    .leftJoin('rooms', 'check_ins.actual_room_id', 'rooms.id')
    .leftJoin('users', 'check_ins.checked_in_by', 'users.id')
    .leftJoin('reservations', 'check_ins.reservation_id', 'reservations.id')
    .leftJoin('guests as pg', 'reservations.primary_guest_id', 'pg.id');

  // Apply filters
  if (filters.hotel_id) {
    query = query.where('check_ins.hotel_id', filters.hotel_id);
  }
  if (filters.status) {
    query = query.where('check_ins.status', filters.status);
  }
  if (filters.room_id) {
    query = query.where('check_ins.actual_room_id', filters.room_id);
  }
  if (filters.reservation_id) {
    query = query.where('check_ins.reservation_id', filters.reservation_id);
  }
  if (filters.checked_in_by) {
    query = query.where('check_ins.checked_in_by', filters.checked_in_by);
  }
  if (filters.check_in_from) {
    query = query.where('check_ins.check_in_time', '>=', filters.check_in_from);
  }
  if (filters.check_in_to) {
    query = query.where('check_ins.check_in_time', '<=', filters.check_in_to);
  }
  if (filters.checkout_from) {
    query = query.where('check_ins.actual_checkout_time', '>=', filters.checkout_from);
  }
  if (filters.checkout_to) {
    query = query.where('check_ins.actual_checkout_time', '<=', filters.checkout_to);
  }

  // Get total count
  const countQuery = query.clone().count('check_ins.id as total').first();
  const { total } = (await countQuery) as any;

  // Get paginated results
  const checkIns = await query
    .select(
      'check_ins.*',
      'rooms.room_number as actual_room_number',
      db.raw('CONCAT(users.first_name, \' \', users.last_name) as checked_in_by_name'),
      'reservations.check_in as reservation_check_in',
      'reservations.check_out as reservation_check_out',
      'reservations.status as reservation_status',
      'pg.id as primary_guest_id',
      'pg.name as primary_guest_name',
      'pg.email as primary_guest_email',
      'pg.phone as primary_guest_phone'
    )
    .orderBy('check_ins.check_in_time', 'desc')
    .limit(pageSize)
    .offset(offset);

  // Transform to response format
  const checkInsResponse: CheckInResponse[] = checkIns.map((ci: any) => ({
    id: ci.id,
    hotel_id: ci.hotel_id,
    reservation_id: ci.reservation_id,
    actual_room_id: ci.actual_room_id,
    actual_room_number: ci.actual_room_number,
    check_in_time: ci.check_in_time.toISOString(),
    expected_checkout_time: ci.expected_checkout_time?.toISOString() || null,
    actual_checkout_time: ci.actual_checkout_time?.toISOString() || null,
    checked_in_by: ci.checked_in_by,
    checked_in_by_name: ci.checked_in_by_name || null,
    notes: ci.notes,
    status: ci.status,
    created_at: ci.created_at.toISOString(),
    updated_at: ci.updated_at.toISOString(),
    reservation: {
      id: ci.reservation_id,
      primary_guest_id: ci.primary_guest_id,
      primary_guest_name: ci.primary_guest_name,
      primary_guest_email: ci.primary_guest_email,
      primary_guest_phone: ci.primary_guest_phone,
      check_in: ci.reservation_check_in,
      check_out: ci.reservation_check_out,
      status: ci.reservation_status,
    } as ReservationSummary,
  }));

  return {
    check_ins: checkInsResponse,
    total: parseInt(total, 10),
    page,
    page_size: pageSize,
    total_pages: Math.ceil(parseInt(total, 10) / pageSize),
  };
}

/**
 * Get eligible rooms for check-in
 * 
 * Returns available rooms matching the reserved room type for the check-in dates.
 */
export async function getEligibleRooms(
  reservationId: string,
  hotelId: string,
): Promise<EligibleRoomsResponse> {
  // Fetch reservation details
  const reservation = await db('reservations')
    .where({ 'reservations.id': reservationId, 'reservations.hotel_id': hotelId })
    .whereNull('reservations.deleted_at')
    .leftJoin('room_types', 'reservations.room_type_id', 'room_types.id')
    .leftJoin('rooms as reserved_room', 'reservations.reserved_room_id', 'reserved_room.id')
    .select(
      'reservations.*',
      'room_types.name as room_type_name',
      'room_types.room_type as room_type_enum',
      'reserved_room.room_number as reserved_room_number'
    )
    .first();

  if (!reservation) {
    throw new Error('Reservation not found');
  }

  if (reservation.status !== 'Confirmed') {
    throw new Error(`Cannot get eligible rooms. Reservation status is: ${reservation.status}`);
  }

  // Find all available rooms for the hotel (no room_type filter to avoid empty results)
  const rooms = await db('rooms')
    .where({ hotel_id: hotelId })
    .whereNotIn('status', ['Out of Service'])
    .select(
      'rooms.id',
      'rooms.room_number',
      'rooms.type',
      'rooms.room_type',
      'rooms.status',
      'rooms.floor',
      'rooms.features',
      'rooms.description',
      'rooms.price_per_night'
    )
    .orderBy('rooms.room_number', 'asc');

  // Diagnostics: if no rooms are found for this hotel, check if rooms exist in other hotels
  if (rooms.length === 0) {
    const anyRooms = await db('rooms')
      .count<{ count: string }>('id as count')
      .first();

    const totalRooms = anyRooms ? parseInt(anyRooms.count, 10) : 0;

    if (totalRooms === 0) {
      // No rooms at all in the system – likely initial setup issue
      throw new Error('Cannot get eligible rooms. No rooms are configured in the system.');
    }

    // Rooms exist, but none for this hotel_id – likely hotel/room mismatch
    throw new Error(
      `Cannot get eligible rooms. No rooms are registered for this hotel (hotel_id=${hotelId}).`,
    );
  }

  // Filter out rooms that are occupied during the reservation dates
  const availableRooms: RoomDetails[] = [];

  for (const room of rooms) {
    const occupiedCheckIn = await db('check_ins')
      .where({ actual_room_id: room.id, status: 'checked_in' })
      .where(function () {
        this.where(function () {
          // Check-in time overlaps with reservation
          this.where('check_in_time', '<=', reservation.check_in)
            .where(function () {
              this.where('actual_checkout_time', '>', reservation.check_in)
                .orWhereNull('actual_checkout_time');
            });
        }).orWhere(function () {
          // Check-out time overlaps with reservation
          this.where('check_in_time', '<', reservation.check_out)
            .where(function () {
              this.where('actual_checkout_time', '>=', reservation.check_out)
                .orWhereNull('actual_checkout_time');
            });
        }).orWhere(function () {
          // Reservation fully contains the check-in
          this.where('check_in_time', '>=', reservation.check_in)
            .where('check_in_time', '<', reservation.check_out);
        });
      })
      .first();

    if (!occupiedCheckIn) {
      // Check if room matches the reserved room type
      const isPreferred = reservation.room_type_enum 
        ? room.room_type === reservation.room_type_enum 
        : false;

      availableRooms.push({
        id: room.id,
        room_number: room.room_number,
        type: room.type,
        room_type: room.room_type,
        status: room.status,
        floor: room.floor,
        features: room.features || [],
        description: room.description,
        price_per_night: parseFloat(room.price_per_night),
        is_preferred: isPreferred,
      });
    }
  }

  // Sort rooms: preferred rooms first, then by room number
  availableRooms.sort((a, b) => {
    if (a.is_preferred && !b.is_preferred) return -1;
    if (!a.is_preferred && b.is_preferred) return 1;
    return a.room_number.localeCompare(b.room_number);
  });

  return {
    reservation_id: reservationId,
    reserved_room_type_id: reservation.room_type_id,
    reserved_room_type_name: reservation.room_type_name || null,
    reserved_room_id: reservation.reserved_room_id,
    reserved_room_number: reservation.reserved_room_number || null,
    check_in_date: reservation.check_in,
    check_out_date: reservation.check_out,
    available_rooms: availableRooms,
  };
}

