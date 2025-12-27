import type { Request, Response, NextFunction } from 'express';
import db from '../../config/database.js';
import type {
  CreateRoomRequest,
  UpdateRoomRequest,
  UpdateHousekeepingRequest,
  RoomResponse,
  HousekeepingResponse,
  Beds24RoomType,
} from './rooms_types.js';
import {
  queueRoomAvailabilitySyncHook,
  queueRoomRatesSyncHook,
} from '../../integrations/beds24/hooks/sync_hooks.js';

// Get all rooms
export async function getRoomsHandler(
  req: Request,
  res: Response<RoomResponse[]>,
  next: NextFunction,
) {
  try {
    const { status, type, search } = req.query;

    let query = db('rooms').select('*').orderBy('room_number', 'asc');

    if (status) {
      query = query.where('status', status as string);
    }

    if (type) {
      query = query.where('type', type as string);
    }

    if (search) {
      query = query.where('room_number', 'ilike', `%${search}%`);
    }

    const rooms = await query;

    const roomsWithFeatures = rooms.map((room) => ({
      ...room,
      features: Array.isArray(room.features) ? room.features : [],
      units: Array.isArray(room.units) ? room.units : (typeof room.units === 'string' ? JSON.parse(room.units || '[]') : []),
    }));

    res.json(roomsWithFeatures as any);
  } catch (error) {
    next(error);
  }
}

// Get single room
export async function getRoomHandler(
  req: Request<{ id: string }>,
  res: Response<RoomResponse>,
  next: NextFunction,
) {
  try {
    const { id } = req.params;

    const room = await db('rooms').where({ id }).first();

    if (!room) {
      res.status(404).json({
        error: 'Room not found',
      } as any);
      return;
    }

    const roomWithFeatures = {
      ...room,
      features: Array.isArray(room.features) ? room.features : [],
      units: Array.isArray(room.units) ? room.units : (typeof room.units === 'string' ? JSON.parse(room.units || '[]') : []),
    };

    res.json(roomWithFeatures as any);
  } catch (error) {
    next(error);
  }
}

// Create room
export async function createRoomHandler(
  req: Request<{}, RoomResponse, CreateRoomRequest>,
  res: Response<RoomResponse>,
  next: NextFunction,
) {
  try {
    const { 
      room_number, 
      type, 
      room_type, 
      status = 'Available', 
      price_per_night, 
      floor, 
      features = [], 
      description,
      unit_allocation = 'perBooking',
      // Beds24-compatible fields
      qty,
      min_price,
      max_price,
      rack_rate,
      cleaning_fee,
      security_deposit,
      max_people,
      max_adult,
      max_children,
      min_stay,
      max_stay,
      tax_percentage,
      tax_per_person,
      room_size,
      highlight_color,
      sell_priority,
      include_reports,
      restriction_strategy,
      overbooking_protection,
      block_after_checkout_days,
      control_priority,
      units = [], // Array of unit objects
    } = req.body;

    // Validation
    if (!room_number || !type || !room_type || !price_per_night || !floor) {
      res.status(400).json({
        error: 'room_number, type, room_type, price_per_night, and floor are required',
      } as any);
      return;
    }

    // Check if room number already exists
    const existing = await db('rooms').where({ room_number }).first();
    if (existing) {
      res.status(409).json({
        error: 'Room with this number already exists',
      } as any);
      return;
    }

    // Validate legacy type
    if (!['Single', 'Double', 'Suite'].includes(type)) {
      res.status(400).json({
        error: 'Invalid room type',
      } as any);
      return;
    }

    // Validate Beds24 room_type
    const validBeds24RoomTypes: Beds24RoomType[] = [
      'single', 'double', 'twin', 'twinDouble', 'triple', 'quadruple',
      'apartment', 'family', 'suite', 'studio', 'dormitoryRoom', 'bedInDormitory',
      'bungalow', 'chalet', 'holidayHome', 'villa', 'mobileHome', 'tent',
      'campSite', 'activity', 'tour', 'carRental'
    ];
    if (!validBeds24RoomTypes.includes(room_type)) {
      res.status(400).json({
        error: 'Invalid Beds24 room_type',
      } as any);
      return;
    }

    // Validate unit_allocation
    if (unit_allocation && !['perBooking', 'perGuest'].includes(unit_allocation)) {
      res.status(400).json({
        error: 'Invalid unit_allocation. Must be "perBooking" or "perGuest"',
      } as any);
      return;
    }

    // Validate status
    if (!['Available', 'Occupied', 'Cleaning', 'Out of Service'].includes(status)) {
      res.status(400).json({
        error: 'Invalid room status',
      } as any);
      return;
    }

    // Create room
    const [room] = await db('rooms')
      .insert({
        room_number,
        type,
        room_type,
        status,
        price_per_night,
        floor,
        features: JSON.stringify(features),
        description,
        unit_allocation: unit_allocation || 'perBooking',
        // Beds24-compatible fields
        qty,
        min_price,
        max_price,
        rack_rate,
        cleaning_fee,
        security_deposit,
        max_people,
        max_adult,
        max_children,
        min_stay,
        max_stay,
        tax_percentage,
        tax_per_person,
        room_size,
        highlight_color,
        sell_priority,
        include_reports,
        restriction_strategy,
        overbooking_protection,
        block_after_checkout_days,
        control_priority,
        units: JSON.stringify(units || []),
      })
      .returning('*');

    // Create housekeeping record for the room
    await db('housekeeping').insert({
      room_id: room.id,
      status: status === 'Cleaning' ? 'In Progress' : status === 'Occupied' ? 'Dirty' : 'Clean',
    });

    // Parse JSONB fields
    const roomWithFeatures = {
      ...room,
      features: Array.isArray(room.features) ? room.features : [],
      units: Array.isArray(room.units) ? room.units : (typeof room.units === 'string' ? JSON.parse(room.units || '[]') : []),
    };

    res.status(201).json(roomWithFeatures as any);
  } catch (error) {
    next(error);
  }
}

// Update room
export async function updateRoomHandler(
  req: Request<{ id: string }, RoomResponse, UpdateRoomRequest>,
  res: Response<RoomResponse>,
  next: NextFunction,
) {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Check if room exists
    const existing = await db('rooms').where({ id }).first();
    if (!existing) {
      res.status(404).json({
        error: 'Room not found',
      } as any);
      return;
    }

    // If room_number is being updated, check for duplicates
    if (updates.room_number && updates.room_number !== existing.room_number) {
      const duplicate = await db('rooms').where({ room_number: updates.room_number }).first();
      if (duplicate) {
        res.status(409).json({
          error: 'Room with this number already exists',
        } as any);
        return;
      }
    }

    // Validate Beds24 room_type if provided
    if (updates.room_type !== undefined) {
      const validBeds24RoomTypes: Beds24RoomType[] = [
        'single', 'double', 'twin', 'twinDouble', 'triple', 'quadruple',
        'apartment', 'family', 'suite', 'studio', 'dormitoryRoom', 'bedInDormitory',
        'bungalow', 'chalet', 'holidayHome', 'villa', 'mobileHome', 'tent',
        'campSite', 'activity', 'tour', 'carRental'
      ];
      if (!validBeds24RoomTypes.includes(updates.room_type)) {
        res.status(400).json({
          error: 'Invalid Beds24 room_type',
        } as any);
        return;
      }
    }

    // Validate unit_allocation if provided
    if (updates.unit_allocation !== undefined && !['perBooking', 'perGuest'].includes(updates.unit_allocation)) {
      res.status(400).json({
        error: 'Invalid unit_allocation. Must be "perBooking" or "perGuest"',
      } as any);
      return;
    }

    // Prepare update data
    const updateData: any = {
      updated_at: new Date(),
    };

    if (updates.room_number !== undefined) updateData.room_number = updates.room_number;
    if (updates.type !== undefined) updateData.type = updates.type;
    if (updates.room_type !== undefined) updateData.room_type = updates.room_type;
    if (updates.status !== undefined) updateData.status = updates.status;
    if (updates.price_per_night !== undefined) updateData.price_per_night = updates.price_per_night;
    if (updates.floor !== undefined) updateData.floor = updates.floor;
    if (updates.features !== undefined) updateData.features = JSON.stringify(updates.features);
    if (updates.description !== undefined) updateData.description = updates.description;
    if (updates.unit_allocation !== undefined) updateData.unit_allocation = updates.unit_allocation;
    
    // Beds24-compatible fields
    if (updates.qty !== undefined) updateData.qty = updates.qty;
    if (updates.min_price !== undefined) updateData.min_price = updates.min_price;
    if (updates.max_price !== undefined) updateData.max_price = updates.max_price;
    if (updates.rack_rate !== undefined) updateData.rack_rate = updates.rack_rate;
    if (updates.cleaning_fee !== undefined) updateData.cleaning_fee = updates.cleaning_fee;
    if (updates.security_deposit !== undefined) updateData.security_deposit = updates.security_deposit;
    if (updates.max_people !== undefined) updateData.max_people = updates.max_people;
    if (updates.max_adult !== undefined) updateData.max_adult = updates.max_adult;
    if (updates.max_children !== undefined) updateData.max_children = updates.max_children;
    if (updates.min_stay !== undefined) updateData.min_stay = updates.min_stay;
    if (updates.max_stay !== undefined) updateData.max_stay = updates.max_stay;
    if (updates.tax_percentage !== undefined) updateData.tax_percentage = updates.tax_percentage;
    if (updates.tax_per_person !== undefined) updateData.tax_per_person = updates.tax_per_person;
    if (updates.room_size !== undefined) updateData.room_size = updates.room_size;
    if (updates.highlight_color !== undefined) updateData.highlight_color = updates.highlight_color;
    if (updates.sell_priority !== undefined) updateData.sell_priority = updates.sell_priority;
    if (updates.include_reports !== undefined) updateData.include_reports = updates.include_reports;
    if (updates.restriction_strategy !== undefined) updateData.restriction_strategy = updates.restriction_strategy;
    if (updates.overbooking_protection !== undefined) updateData.overbooking_protection = updates.overbooking_protection;
    if (updates.block_after_checkout_days !== undefined) updateData.block_after_checkout_days = updates.block_after_checkout_days;
    if (updates.control_priority !== undefined) updateData.control_priority = updates.control_priority;
    if (updates.units !== undefined) updateData.units = JSON.stringify(updates.units);

    // Update room
    const [room] = await db('rooms')
      .where({ id })
      .update(updateData)
      .returning('*');

    // Update housekeeping status if room status changed
    if (updates.status) {
      let housekeepingStatus = 'Clean';
      if (updates.status === 'Cleaning') housekeepingStatus = 'In Progress';
      else if (updates.status === 'Occupied') housekeepingStatus = 'Dirty';

      await db('housekeeping')
        .where({ room_id: id })
        .update({
          status: housekeepingStatus,
          updated_at: new Date(),
        });
    }

    const roomWithFeatures = {
      ...room,
      features: Array.isArray(room.features) ? room.features : [],
      units: Array.isArray(room.units) ? room.units : (typeof room.units === 'string' ? JSON.parse(room.units || '[]') : []),
    };

    // Queue Beds24 sync if room is mapped (non-blocking)
    if (room.beds24_room_id) {
      // Sync availability if status changed
      if (updates.status !== undefined) {
        queueRoomAvailabilitySyncHook(id).catch((err) => {
          console.error('Failed to queue room availability sync:', err);
        });
      }
      // Sync rates if price changed
      if (updates.price_per_night !== undefined) {
        queueRoomRatesSyncHook(id).catch((err) => {
          console.error('Failed to queue room rates sync:', err);
        });
      }
    }

    res.json(roomWithFeatures as any);
  } catch (error) {
    next(error);
  }
}

// Delete room
export async function deleteRoomHandler(
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction,
) {
  try {
    const { id } = req.params;

    const room = await db('rooms').where({ id }).first();
    if (!room) {
      res.status(404).json({
        error: 'Room not found',
      });
      return;
    }

    // Check if room has active reservations
    const activeReservations = await db('reservations')
      .where({ room_id: id })
      .whereIn('status', ['Confirmed', 'Checked-in'])
      .whereNull('deleted_at')
      .first();

    if (activeReservations) {
      res.status(400).json({
        error: 'Cannot delete room with active reservations',
      });
      return;
    }

    // Delete room (CASCADE will delete housekeeping)
    await db('rooms').where({ id }).delete();

    res.status(204).send();
  } catch (error) {
    next(error);
  }
}

// Get housekeeping for a room or unit
export async function getRoomHousekeepingHandler(
  req: Request<{ id: string }>,
  res: Response<HousekeepingResponse>,
  next: NextFunction,
) {
  try {
    const { id } = req.params;

    // Check if this is a unit ID (format: "roomTypeId-unit-index") or a room ID (UUID)
    const isUnitId = id.includes('-unit-');
    
    let housekeeping = null;
    if (isUnitId) {
      housekeeping = await db('housekeeping').where({ unit_id: id }).first();
    } else {
      housekeeping = await db('housekeeping').where({ room_id: id }).first();
    }

    if (!housekeeping) {
      // Create housekeeping record if it doesn't exist
      if (isUnitId) {
        // For units, just create with default status
        const [newHousekeeping] = await db('housekeeping')
          .insert({
            unit_id: id,
            room_id: null,
            status: 'Clean',
          })
          .returning('*');

        res.json(newHousekeeping as any);
        return;
      } else {
        // For legacy rooms, check if room exists
        const room = await db('rooms').where({ id }).first();
        if (!room) {
          res.status(404).json({
            error: 'Room not found',
          } as any);
          return;
        }

        const [newHousekeeping] = await db('housekeeping')
          .insert({
            room_id: id,
            unit_id: null,
            status: 'Clean',
          })
          .returning('*');

        res.json(newHousekeeping as any);
        return;
      }
    }

    res.json(housekeeping as any);
  } catch (error) {
    next(error);
  }
}

// Update housekeeping for a room or unit
export async function updateRoomHousekeepingHandler(
  req: Request<{ id: string }, HousekeepingResponse, UpdateHousekeepingRequest>,
  res: Response<HousekeepingResponse>,
  next: NextFunction,
) {
  try {
    const { id } = req.params;
    const { status, assigned_staff_id, assigned_staff_name, notes } = req.body;

    if (!status) {
      res.status(400).json({
        error: 'status is required',
      } as any);
      return;
    }

    // Validate status
    if (!['Clean', 'Dirty', 'In Progress'].includes(status)) {
      res.status(400).json({
        error: 'Invalid housekeeping status',
      } as any);
      return;
    }

    // Check if this is a unit ID (format: "roomTypeId-unit-index") or a room ID (UUID)
    const isUnitId = id.includes('-unit-');
    
    let room = null;
    let housekeeping = null;

    if (isUnitId) {
      // This is a unit ID - housekeeping is local only, no Beds24 sync
      // Extract room type ID from unit ID
      const roomTypeId = id.split('-unit-')[0];
      const roomType = await db('room_types').where({ id: roomTypeId }).whereNull('deleted_at').first();
      
      if (!roomType) {
        res.status(404).json({
          error: 'Room type not found for unit',
        } as any);
        return;
      }

      // Check if housekeeping record exists for this unit
      housekeeping = await db('housekeeping').where({ unit_id: id }).first();
    } else {
      // This is a legacy room ID (UUID) - check if room exists
      room = await db('rooms').where({ id }).first();
      if (!room) {
        res.status(404).json({
          error: 'Room not found',
        } as any);
        return;
      }

      // Check if housekeeping record exists
      housekeeping = await db('housekeeping').where({ room_id: id }).first();
    }

    const updateData: any = {
      status,
      updated_at: new Date(),
    };

    if (status === 'Clean') {
      updateData.last_cleaned = new Date();
    }

    if (assigned_staff_id !== undefined) {
      // If empty string, set to null. Otherwise try to use as UUID or leave as null
      updateData.assigned_staff_id = assigned_staff_id && assigned_staff_id.trim() !== '' 
        ? assigned_staff_id 
        : null;
    }

    if (assigned_staff_name !== undefined) {
      updateData.assigned_staff_name = assigned_staff_name || null;
    }

    if (notes !== undefined) {
      updateData.notes = notes || null;
    }

    if (housekeeping) {
      // Update existing
      const whereClause = isUnitId ? { unit_id: id } : { room_id: id };
      const [updated] = await db('housekeeping')
        .where(whereClause)
        .update(updateData)
        .returning('*');

      // Queue Beds24 availability sync only for legacy rooms (not units)
      // Housekeeping for units is local only, not synced with Beds24
      if (!isUnitId && room && room.beds24_room_id && (status === 'Dirty' || status === 'In Progress')) {
        queueRoomAvailabilitySyncHook(id).catch((err) => {
          console.error('Failed to queue room availability sync:', err);
        });
      }

      res.json(updated as any);
    } else {
      // Create new
      const insertData: any = {
        ...updateData,
      };

      if (isUnitId) {
        insertData.unit_id = id;
        insertData.room_id = null;
      } else {
        insertData.room_id = id;
        insertData.unit_id = null;
      }

      const [created] = await db('housekeeping')
        .insert(insertData)
        .returning('*');

      // Queue Beds24 availability sync only for legacy rooms (not units)
      // Housekeeping for units is local only, not synced with Beds24
      if (!isUnitId && room && room.beds24_room_id && (status === 'Dirty' || status === 'In Progress')) {
        queueRoomAvailabilitySyncHook(id).catch((err) => {
          console.error('Failed to queue room availability sync:', err);
        });
      }

      res.status(201).json(created as any);
    }
  } catch (error) {
    next(error);
  }
}

// Get all housekeeping records
export async function getAllHousekeepingHandler(
  req: Request,
  res: Response<HousekeepingResponse[]>,
  next: NextFunction,
) {
  try {
    const { status, search } = req.query;

    let query = db('housekeeping')
      .select('housekeeping.*')
      .orderBy('housekeeping.created_at', 'desc');

    if (status) {
      query = query.where('housekeeping.status', status as string);
    }

    if (search) {
      // Search in both legacy rooms and room type units
      query = query
        .leftJoin('rooms', 'housekeeping.room_id', 'rooms.id')
        .leftJoin('room_types', db.raw("housekeeping.unit_id LIKE room_types.id || '-unit-%'"))
        .where(function() {
          this.where('rooms.room_number', 'ilike', `%${search}%`)
            .orWhere('room_types.name', 'ilike', `%${search}%`);
        })
        .select('housekeeping.*'); // Ensure we only select housekeeping columns
    }

    const housekeeping = await query;

    res.json(housekeeping as any);
  } catch (error) {
    next(error);
  }
}

