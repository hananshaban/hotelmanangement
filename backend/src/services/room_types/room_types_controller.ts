import type { Request, Response, NextFunction } from 'express';
import db from '../../config/database.js';
import type {
  CreateRoomTypeRequest,
  UpdateRoomTypeRequest,
  RoomTypeResponse,
  RoomTypeAvailability,
  AvailableRoomTypesQuery,
} from './room_types_types.js';
import { RoomTypeAvailabilityService } from './room_type_availability_service.js';

const availabilityService = new RoomTypeAvailabilityService();

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

    let query = db('room_types')
      .select('*')
      .whereNull('deleted_at')
      .orderBy('name', 'asc');

    if (include_deleted === 'true') {
      query = db('room_types').select('*').orderBy('name', 'asc');
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

    const roomType = await db('room_types')
      .where({ id })
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
        beds24_room_id: data.beds24_room_id || null,
      })
      .returning('*');

    const roomTypeWithParsed = {
      ...roomType,
      features: Array.isArray(roomType.features) ? roomType.features : (typeof roomType.features === 'string' ? JSON.parse(roomType.features || '[]') : []),
      units: Array.isArray(roomType.units) ? roomType.units : (typeof roomType.units === 'string' ? JSON.parse(roomType.units || '[]') : []),
    };

    res.status(201).json(roomTypeWithParsed as RoomTypeResponse);
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

    // Check if room type exists
    const existing = await db('room_types')
      .where({ id })
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
    if (data.beds24_room_id !== undefined) updateData.beds24_room_id = data.beds24_room_id;

    // Update room type
    const [roomType] = await db('room_types')
      .where({ id })
      .update(updateData)
      .returning('*');

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
 * Delete room type (soft delete)
 */
export async function deleteRoomTypeHandler(
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction,
) {
  try {
    const { id } = req.params;

    // Check if room type exists
    const existing = await db('room_types')
      .where({ id })
      .whereNull('deleted_at')
      .first();

    if (!existing) {
      res.status(404).json({
        error: 'Room type not found',
      } as any);
      return;
    }

    // Check if there are active reservations
    const activeReservations = await db('reservations')
      .where({ room_type_id: id })
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

    if (!check_in || !check_out) {
      res.status(400).json({
        error: 'check_in and check_out are required (YYYY-MM-DD)',
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

    const filters: {
      minPrice?: number;
      maxPrice?: number;
      roomType?: string;
      maxPeople?: number;
      unitsRequested?: number;
    } = {
      unitsRequested: parseInt(String(units_requested)) || 1,
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

