import type { Request, Response, NextFunction } from 'express';
import db from '../../config/database.js';
import type {
  CreateRoomTypeRequest,
  UpdateRoomTypeRequest,
  RoomTypeResponse,
  RoomTypeAvailability,
  AvailableRoomTypesQuery,
  RoomType,
} from './room_types_types.js';
import type { Beds24RoomType } from '../rooms/rooms_types.js';
import { RoomTypeAvailabilityService } from './room_type_availability_service.js';
import { logCreate, logUpdate, logDelete } from '../audit/audit_utils.js';

const availabilityService = new RoomTypeAvailabilityService();

// ============================================================================
// Helpers
// ============================================================================

function slugifyRoomTypeName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function mapBeds24ToLegacyRoomType(roomType: Beds24RoomType): 'Single' | 'Double' | 'Suite' {
  switch (roomType) {
    case 'single':
      return 'Single';
    case 'suite':
      return 'Suite';
    default:
      return 'Double';
  }
}

/**
 * Generate physical room records in `rooms` (and housekeeping entries)
 * for a given room type.
 *
 * Notes:
 * - Uses deterministic room numbers: {slugified-name}-{index}
 * - Skips room_numbers that already exist for this hotel to avoid conflicts
 */
async function generateRoomsForRoomType(
  roomType: RoomType,
  hotelId: string,
): Promise<void> {
  const baseSlug = slugifyRoomTypeName(roomType.name);
  const legacyType = mapBeds24ToLegacyRoomType(roomType.room_type);

  for (let i = 1; i <= roomType.qty; i += 1) {
    const roomNumber = `${baseSlug}-${i}`;

    // Skip if a room with this number already exists for this hotel
    const existingRoom = await db('rooms')
      .where({ hotel_id: hotelId, room_number: roomNumber })
      .first();

    if (existingRoom) {
      continue;
    }

    const [room] = await db('rooms')
      .insert({
        hotel_id: hotelId,
        room_number: roomNumber,
        type: legacyType,
        room_type: roomType.room_type,
        room_type_id: roomType.id,
        status: 'Available',
        price_per_night: roomType.price_per_night,
        floor: roomType.floor ?? 1,
        features: JSON.stringify(roomType.features || []),
        description: roomType.description || null,
      })
      .returning(['id', 'status']);

    // Create housekeeping record for the room
    await db('housekeeping').insert({
      hotel_id: hotelId,
      room_id: room.id,
      status: room.status === 'Occupied' ? 'Dirty' : room.status === 'Cleaning' ? 'In Progress' : 'Clean',
    });
  }
}

/**
 * Sync physical rooms when room type qty or name changes.
 *
 * - If qty increases: create additional rooms with new suffixes
 * - If qty decreases: delete removable rooms (no check_ins history), highest suffix first
 * - If name changes: rename room_number prefix for rooms without check_ins history
 */
async function syncRoomsOnRoomTypeChange(
  existing: RoomType,
  updated: RoomType,
  hotelId: string,
): Promise<void> {
  const oldQty = existing.qty;
  const newQty = updated.qty;
  const nameChanged = existing.name !== updated.name;

  // Fetch all rooms linked to this room type for this hotel
  const rooms = await db('rooms')
    .where({ hotel_id: hotelId, room_type_id: existing.id })
    .orderBy('room_number', 'asc');

  // Handle name change: rename rooms without any check_ins history
  if (nameChanged) {
    const oldSlug = slugifyRoomTypeName(existing.name);
    const newSlug = slugifyRoomTypeName(updated.name);

    // Only update rooms that follow the old slug pattern and have no check_ins
    // to avoid touching historical data
    for (const room of rooms) {
      if (typeof room.room_number !== 'string') continue;
      if (!room.room_number.startsWith(`${oldSlug}-`)) continue;

      const hasCheckIns = await db('check_ins')
        .where({ actual_room_id: room.id })
        .first();
      if (hasCheckIns) continue;

      const suffix = room.room_number.substring(oldSlug.length);
      const newRoomNumber = `${newSlug}${suffix}`;

      // Avoid collisions
      const conflict = await db('rooms')
        .where({ hotel_id: hotelId, room_number: newRoomNumber })
        .whereNot({ id: room.id })
        .first();
      if (conflict) continue;

      await db('rooms')
        .where({ id: room.id })
        .update({
          room_number: newRoomNumber,
          updated_at: db.fn.now(),
        });
    }
  }

  // Handle qty changes
  if (newQty > oldQty) {
    // Create additional rooms
    const baseSlug = slugifyRoomTypeName(updated.name);
    const legacyType = mapBeds24ToLegacyRoomType(updated.room_type);

    // Determine existing indices from room_number suffixes to avoid collisions
    const usedIndices = new Set<number>();
    for (const room of rooms) {
      if (typeof room.room_number !== 'string') continue;
      const match = room.room_number.match(/^.+-(\d+)$/);
      if (match) {
        const idx = parseInt(match[1], 10);
        if (!Number.isNaN(idx)) usedIndices.add(idx);
      }
    }

    let created = 0;
    let nextIndex = 1;
    while (created < newQty - oldQty) {
      if (usedIndices.has(nextIndex)) {
        nextIndex += 1;
        continue;
      }

      const roomNumber = `${baseSlug}-${nextIndex}`;
      const [room] = await db('rooms')
        .insert({
          hotel_id: hotelId,
          room_number: roomNumber,
          type: legacyType,
          room_type: updated.room_type,
          room_type_id: existing.id,
          status: 'Available',
          price_per_night: updated.price_per_night,
          floor: updated.floor ?? 1,
          features: JSON.stringify(updated.features || []),
          description: updated.description || null,
        })
        .returning(['id', 'status']);

      await db('housekeeping').insert({
        hotel_id: hotelId,
        room_id: room.id,
        status: 'Clean',
      });

      usedIndices.add(nextIndex);
      created += 1;
      nextIndex += 1;
    }
  } else if (newQty < oldQty) {
    // Remove excess rooms, but only those without any check_ins history
    const targetCount = newQty;

    // Re-fetch rooms to include any created earlier in this function
    const allRooms = await db('rooms')
      .where({ hotel_id: hotelId, room_type_id: existing.id })
      .orderBy('room_number', 'desc'); // delete highest suffix first

    for (const room of allRooms) {
      if (allRooms.length <= targetCount) {
        break;
      }

      const hasCheckIns = await db('check_ins')
        .where({ actual_room_id: room.id })
        .first();
      if (hasCheckIns) {
        continue;
      }

      // Delete housekeeping first (if not cascaded), then room
      await db('housekeeping')
        .where({ room_id: room.id, hotel_id: hotelId })
        .delete();

      await db('rooms')
        .where({ id: room.id })
        .delete();
    }
  }
}

/**
 * Get all room types
 */
export async function getRoomTypesHandler(
  req: Request,
  res: Response<RoomTypeResponse[]>,
  next: NextFunction,
) {
  try {
    const { search, room_type, include_deleted } = req.query;
    const hotelId = (req as any).hotelId;

    let query = db('room_types')
      .select('*')
      .where('hotel_id', hotelId)
      .whereNull('deleted_at')
      .orderBy('name', 'asc');

    if (include_deleted === 'true') {
      query = db('room_types')
        .select('*')
        .where('hotel_id', hotelId)
        .orderBy('name', 'asc');
    }

    if (search) {
      query = query.where('name', 'ilike', `%${search}%`);
    }

    if (room_type) {
      query = query.where('room_type', room_type as string);
    }

    const roomTypes = await query;

    const roomTypesWithParsed = roomTypes.map((rt) => ({
      ...rt,
      features: Array.isArray(rt.features) ? rt.features : (typeof rt.features === 'string' ? JSON.parse(rt.features || '[]') : []),
      units: Array.isArray(rt.units) ? rt.units : (typeof rt.units === 'string' ? JSON.parse(rt.units || '[]') : []),
    }));

    res.json(roomTypesWithParsed as RoomTypeResponse[]);
  } catch (error) {
    next(error);
  }
}

/**
 * Get single room type
 */
export async function getRoomTypeHandler(
  req: Request<{ id: string }>,
  res: Response<RoomTypeResponse>,
  next: NextFunction,
) {
  try {
    const { id } = req.params;
    const hotelId = (req as any).hotelId;

    const roomType = await db('room_types')
      .where({ id, hotel_id: hotelId })
      .whereNull('deleted_at')
      .first();

    if (!roomType) {
      res.status(404).json({
        error: 'Room type not found',
      } as any);
      return;
    }

    const roomTypeWithParsed = {
      ...roomType,
      features: Array.isArray(roomType.features) ? roomType.features : (typeof roomType.features === 'string' ? JSON.parse(roomType.features || '[]') : []),
      units: Array.isArray(roomType.units) ? roomType.units : (typeof roomType.units === 'string' ? JSON.parse(roomType.units || '[]') : []),
    };

    res.json(roomTypeWithParsed as RoomTypeResponse);
  } catch (error) {
    next(error);
  }
}

/**
 * Create room type
 */
export async function createRoomTypeHandler(
  req: Request<{}, RoomTypeResponse, CreateRoomTypeRequest>,
  res: Response<RoomTypeResponse>,
  next: NextFunction,
) {
  try {
    const data = req.body;
    const hotelId = (req as any).hotelId;

    // Validation
    if (!data.name || !data.room_type || !data.qty || !data.price_per_night) {
      res.status(400).json({
        error: 'name, room_type, qty, and price_per_night are required',
      } as any);
      return;
    }

    if (data.qty < 1 || data.qty > 99) {
      res.status(400).json({
        error: 'qty must be between 1 and 99',
      } as any);
      return;
    }

    // Create room type
    const [roomType] = await db('room_types')
      .insert({
        hotel_id: hotelId,
        name: data.name,
        room_type: data.room_type,
        qty: data.qty,
        price_per_night: data.price_per_night,
        min_price: data.min_price || null,
        max_price: data.max_price || null,
        rack_rate: data.rack_rate || data.price_per_night,
        cleaning_fee: data.cleaning_fee || 0,
        security_deposit: data.security_deposit || 0,
        max_people: data.max_people || null,
        max_adult: data.max_adult || null,
        max_children: data.max_children || null,
        min_stay: data.min_stay || null,
        max_stay: data.max_stay || null,
        tax_percentage: data.tax_percentage || null,
        tax_per_person: data.tax_per_person || null,
        room_size: data.room_size || null,
        floor: data.floor || null,
        highlight_color: data.highlight_color || null,
        sell_priority: data.sell_priority || null,
        include_reports: data.include_reports !== undefined ? data.include_reports : true,
        restriction_strategy: data.restriction_strategy || null,
        overbooking_protection: data.overbooking_protection || null,
        block_after_checkout_days: data.block_after_checkout_days || 0,
        control_priority: data.control_priority || null,
        unit_allocation: data.unit_allocation || 'perBooking',
        features: JSON.stringify(data.features || []),
        description: data.description || null,
        units: JSON.stringify(data.units || []),
        cm_room_id: data.cm_room_id || null,
      })
      .returning('*');

    const roomTypeWithParsed: RoomType = {
      ...(roomType as RoomType),
      features: Array.isArray(roomType.features)
        ? roomType.features
        : (typeof roomType.features === 'string' ? JSON.parse(roomType.features || '[]') : []),
      units: Array.isArray(roomType.units)
        ? roomType.units
        : (typeof roomType.units === 'string' ? JSON.parse(roomType.units || '[]') : []),
    };

    // Generate physical rooms for this room type so operational flows can work
    await generateRoomsForRoomType(roomTypeWithParsed, hotelId);

    res.status(201).json(roomTypeWithParsed as RoomTypeResponse);

    // Audit log: room type created
    logCreate(req, 'room_type', roomType.id, {
      name: roomType.name,
      room_type: roomType.room_type,
      qty: roomType.qty,
      price_per_night: roomType.price_per_night,
    }).catch((err) => console.error('Audit log failed:', err));

    // Queue QloApps sync (non-blocking)
    // Note: Room types are typically synced FROM QloApps TO PMS, not the other way
    // This hook is included for completeness but may trigger skipped actions
    import('../../integrations/qloapps/hooks/sync_hooks.js')
      .then(({ queueQloAppsRoomTypeSyncHook }) => 
        queueQloAppsRoomTypeSyncHook(roomType.id)
      )
      .catch((err) => console.error('QloApps room type sync hook failed:', err));
  } catch (error) {
    next(error);
  }
}

/**
 * Update room type
 */
export async function updateRoomTypeHandler(
  req: Request<{ id: string }, RoomTypeResponse, UpdateRoomTypeRequest>,
  res: Response<RoomTypeResponse>,
  next: NextFunction,
) {
  try {
    const { id } = req.params;
    const data = req.body;
    const hotelId = (req as any).hotelId;

    // Check if room type exists in this hotel
    const existing = await db('room_types')
      .where({ id, hotel_id: hotelId })
      .whereNull('deleted_at')
      .first();

    if (!existing) {
      res.status(404).json({
        error: 'Room type not found',
      } as any);
      return;
    }

    // Validate qty if provided
    if (data.qty !== undefined && (data.qty < 1 || data.qty > 99)) {
      res.status(400).json({
        error: 'qty must be between 1 and 99',
      } as any);
      return;
    }

    // Build update object
    const updateData: any = {
      updated_at: new Date(),
    };

    if (data.name !== undefined) updateData.name = data.name;
    if (data.room_type !== undefined) updateData.room_type = data.room_type;
    if (data.qty !== undefined) updateData.qty = data.qty;
    if (data.price_per_night !== undefined) updateData.price_per_night = data.price_per_night;
    if (data.min_price !== undefined) updateData.min_price = data.min_price;
    if (data.max_price !== undefined) updateData.max_price = data.max_price;
    if (data.rack_rate !== undefined) updateData.rack_rate = data.rack_rate;
    if (data.cleaning_fee !== undefined) updateData.cleaning_fee = data.cleaning_fee;
    if (data.security_deposit !== undefined) updateData.security_deposit = data.security_deposit;
    if (data.max_people !== undefined) updateData.max_people = data.max_people;
    if (data.max_adult !== undefined) updateData.max_adult = data.max_adult;
    if (data.max_children !== undefined) updateData.max_children = data.max_children;
    if (data.min_stay !== undefined) updateData.min_stay = data.min_stay;
    if (data.max_stay !== undefined) updateData.max_stay = data.max_stay;
    if (data.tax_percentage !== undefined) updateData.tax_percentage = data.tax_percentage;
    if (data.tax_per_person !== undefined) updateData.tax_per_person = data.tax_per_person;
    if (data.room_size !== undefined) updateData.room_size = data.room_size;
    if (data.floor !== undefined) updateData.floor = data.floor;
    if (data.highlight_color !== undefined) updateData.highlight_color = data.highlight_color;
    if (data.sell_priority !== undefined) updateData.sell_priority = data.sell_priority;
    if (data.include_reports !== undefined) updateData.include_reports = data.include_reports;
    if (data.restriction_strategy !== undefined) updateData.restriction_strategy = data.restriction_strategy;
    if (data.overbooking_protection !== undefined) updateData.overbooking_protection = data.overbooking_protection;
    if (data.block_after_checkout_days !== undefined) updateData.block_after_checkout_days = data.block_after_checkout_days;
    if (data.control_priority !== undefined) updateData.control_priority = data.control_priority;
    if (data.unit_allocation !== undefined) updateData.unit_allocation = data.unit_allocation;
    if (data.features !== undefined) updateData.features = JSON.stringify(data.features);
    if (data.description !== undefined) updateData.description = data.description;
    if (data.units !== undefined) updateData.units = JSON.stringify(data.units);
    if (data.cm_room_id !== undefined) updateData.cm_room_id = data.cm_room_id;

    const existingParsed: RoomType = {
      ...(existing as RoomType),
      features: Array.isArray(existing.features)
        ? existing.features
        : (typeof existing.features === 'string' ? JSON.parse(existing.features || '[]') : []),
      units: Array.isArray(existing.units)
        ? existing.units
        : (typeof existing.units === 'string' ? JSON.parse(existing.units || '[]') : []),
    };

    // Update room type
    const [roomType] = await db('room_types')
      .where({ id })
      .update(updateData)
      .returning('*');

    const roomTypeWithParsed: RoomType = {
      ...(roomType as RoomType),
      features: Array.isArray(roomType.features)
        ? roomType.features
        : (typeof roomType.features === 'string' ? JSON.parse(roomType.features || '[]') : []),
      units: Array.isArray(roomType.units)
        ? roomType.units
        : (typeof roomType.units === 'string' ? JSON.parse(roomType.units || '[]') : []),
    };

    // Sync physical rooms if qty or name changed
    if (
      roomTypeWithParsed.qty !== existingParsed.qty ||
      roomTypeWithParsed.name !== existingParsed.name
    ) {
      await syncRoomsOnRoomTypeChange(existingParsed, roomTypeWithParsed, hotelId);
    }

    res.json(roomTypeWithParsed as RoomTypeResponse);

    // Audit log: room type updated
    logUpdate(req, 'room_type', id, {
      name: existing.name,
      room_type: existing.room_type,
      qty: existing.qty,
      price_per_night: existing.price_per_night,
    }, {
      name: roomType.name,
      room_type: roomType.room_type,
      qty: roomType.qty,
      price_per_night: roomType.price_per_night,
    }).catch((err) => console.error('Audit log failed:', err));

    // Queue QloApps sync (non-blocking) - only for price/capacity changes
    const significantFieldsChanged = 
      data.price_per_night !== undefined || 
      data.max_adult !== undefined || 
      data.max_children !== undefined ||
      data.max_people !== undefined;
    
    if (significantFieldsChanged) {
      import('../../integrations/qloapps/hooks/sync_hooks.js')
        .then(({ queueQloAppsRoomTypeSyncHook }) => 
          queueQloAppsRoomTypeSyncHook(id)
        )
        .catch((err) => console.error('QloApps room type sync hook failed:', err));
    }
  } catch (error) {
    next(error);
  }
}

/**
 * Delete room type (soft delete)
 */
export async function deleteRoomTypeHandler(
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction,
) {
  try {
    const { id } = req.params;
    const hotelId = (req as any).hotelId;

    // Check if room type exists in this hotel
    const existing = await db('room_types')
      .where({ id, hotel_id: hotelId })
      .whereNull('deleted_at')
      .first();

    if (!existing) {
      res.status(404).json({
        error: 'Room type not found',
      } as any);
      return;
    }

    // Check if there are active reservations in this hotel
    const activeReservations = await db('reservations')
      .where({ room_type_id: id, hotel_id: hotelId })
      .whereNotIn('status', ['Cancelled', 'Checked-out'])
      .whereNull('deleted_at')
      .count('* as count')
      .first();

    const activeCount = activeReservations?.count ? parseInt(String(activeReservations.count), 10) : 0;
    if (activeCount > 0) {
      res.status(400).json({
        error: 'Cannot delete room type with active reservations',
      } as any);
      return;
    }

    // Soft delete
    await db('room_types')
      .where({ id })
      .update({ deleted_at: new Date() });

    res.status(204).send();

    // Audit log: room type deleted
    logDelete(req, 'room_type', id, {
      name: existing.name,
      room_type: existing.room_type,
      qty: existing.qty,
      price_per_night: existing.price_per_night,
    }).catch((err) => console.error('Audit log failed:', err));
  } catch (error) {
    next(error);
  }
}

/**
 * Get availability for a room type
 */
export async function getRoomTypeAvailabilityHandler(
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction,
) {
  try {
    const { id } = req.params;
    const { start_date, end_date } = req.query;
    const hotelId = (req as any).hotelId;

    // Verify room type belongs to this hotel
    const roomType = await db('room_types')
      .where({ id, hotel_id: hotelId })
      .whereNull('deleted_at')
      .first();

    if (!roomType) {
      res.status(404).json({
        error: 'Room type not found',
      });
      return;
    }

    if (!start_date || !end_date) {
      res.status(400).json({
        error: 'start_date and end_date are required (YYYY-MM-DD)',
      });
      return;
    }

    const startDate = new Date(start_date as string);
    const endDate = new Date(end_date as string);

    if (endDate <= startDate) {
      res.status(400).json({
        error: 'end_date must be after start_date',
      });
      return;
    }

    const availability = await availabilityService.getAvailabilityForRange(
      id,
      startDate,
      endDate
    );

    // Convert Map to object for JSON response
    const availabilityObj: Record<string, number> = {};
    availability.forEach((value, key) => {
      availabilityObj[key] = value;
    });

    res.json({
      room_type_id: id,
      start_date: start_date,
      end_date: end_date,
      availability: availabilityObj,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get available room types for date range
 */
export async function getAvailableRoomTypesHandler(
  req: Request<{}, any, {}, AvailableRoomTypesQuery>,
  res: Response,
  next: NextFunction,
) {
  try {
    const { check_in, check_out, min_price, max_price, room_type, max_people, units_requested = 1 } = req.query;
    const hotelId = (req as any).hotelId;

    if (!check_in || !check_out) {
      res.status(400).json({
        error: 'check_in and check_out are required (YYYY-MM-DD)',
      });
      return;
    }

    // Validate date strings
    const checkInStr = String(check_in).trim();
    const checkOutStr = String(check_out).trim();

    if (!checkInStr || !checkOutStr) {
      res.status(400).json({
        error: 'check_in and check_out cannot be empty',
      });
      return;
    }

    const checkInDate = new Date(checkInStr);
    const checkOutDate = new Date(checkOutStr);

    // Validate that dates are valid
    if (isNaN(checkInDate.getTime()) || isNaN(checkOutDate.getTime())) {
      res.status(400).json({
        error: 'Invalid date format. Use YYYY-MM-DD',
      });
      return;
    }

    if (checkOutDate <= checkInDate) {
      res.status(400).json({
        error: 'check_out must be after check_in',
      });
      return;
    }

    const filters: {
      minPrice?: number;
      maxPrice?: number;
      roomType?: string;
      maxPeople?: number;
      unitsRequested?: number;
      hotelId?: string;
    } = {
      unitsRequested: parseInt(String(units_requested)) || 1,
      hotelId: hotelId,
    };
    if (min_price) {
      filters.minPrice = parseFloat(String(min_price));
    }
    if (max_price) {
      filters.maxPrice = parseFloat(String(max_price));
    }
    if (room_type) {
      filters.roomType = String(room_type);
    }
    if (max_people) {
      filters.maxPeople = parseInt(String(max_people));
    }
    const availableRoomTypes = await availabilityService.getAvailableRoomTypes(
      checkInDate,
      checkOutDate,
      filters
    );

    res.json({
      check_in: check_in,
      check_out: check_out,
      room_types: availableRoomTypes,
    });
  } catch (error) {
    next(error);
  }
}

