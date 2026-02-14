// src/services/hotels/hotels_controller.ts
import type { Request, Response, NextFunction } from 'express';
import db from '../../config/database.js';
import type { AuthenticatedRequest } from '../auth/auth_middleware.js';
import type { CreateHotelRequest, UpdateHotelRequest, HotelResponse } from './hotels_types.js';
import { logCreate, logUpdate, logDelete } from '../audit/audit_utils.js';

/**
 * Helper function to check if user is SUPER_ADMIN
 * Handles potential string variations and whitespace issues
 */
function isSuperAdmin(user: any): boolean {
  const role = user?.role?.trim().toUpperCase();
  return role === 'SUPER_ADMIN' || role === 'SUPER ADMIN' || role === 'SUPERADMIN';
}

/**
 * Get all hotels accessible to the current user
 * 
 * SUPER_ADMIN: sees all hotels
 * Other roles: sees only assigned hotels
 */
export async function getHotelsHandler(
  req: AuthenticatedRequest,
  res: Response<HotelResponse[]>,
  next: NextFunction,
) {
  try {
    const user = req.user;

    if (!user) {
      res.status(401).json({ error: 'Unauthorized' } as any);
      return;
    }

    // 🔍 DEBUG: Log user details
    console.log('[getHotelsHandler] Request from user:', {
      userId: user.userId,
      email: user.email,
      role: user.role,
      roleType: typeof user.role,
      roleLength: user.role?.length,
      roleBytes: Buffer.from(user.role || '').toString('hex'),
    });

    let hotels;
    const superAdmin = isSuperAdmin(user);

    console.log('[getHotelsHandler] Is SUPER_ADMIN?', superAdmin);

    if (superAdmin) {
      console.log('[getHotelsHandler] Querying ALL hotels (SUPER_ADMIN)');
      hotels = await db('hotels')
        .whereNull('deleted_at')
        .orderBy('hotel_name', 'asc');
      console.log(`[getHotelsHandler] Found ${hotels.length} hotels:`, 
        hotels.map(h => ({ id: h.id, name: h.hotel_name }))
      );
    } else {
      console.log(`[getHotelsHandler] Querying ASSIGNED hotels (role: ${user.role})`);
      hotels = await db('hotels')
        .join('user_hotels', 'hotels.id', 'user_hotels.hotel_id')
        .where('user_hotels.user_id', user.userId)
        .whereNull('hotels.deleted_at')
        .select('hotels.*')
        .orderBy('hotels.hotel_name', 'asc');
      console.log(`[getHotelsHandler] Found ${hotels.length} assigned hotels:`,
        hotels.map(h => ({ id: h.id, name: h.hotel_name }))
      );
    }

    // Exclude deleted_at from response
    const hotelsResponse = hotels.map(({ deleted_at, ...hotel }) => hotel);
    res.json(hotelsResponse);
  } catch (error) {
    console.error('[getHotelsHandler] Error:', error);
    next(error);
  }
}

/**
 * Get single hotel by ID
 * 
 * Requires user to have access to the hotel
 */
export async function getHotelHandler(
  req: AuthenticatedRequest,
  res: Response<HotelResponse>,
  next: NextFunction,
) {
  try {
    const { id } = req.params;
    const user = req.user;

    if (!user) {
      res.status(401).json({ error: 'Unauthorized' } as any);
      return;
    }

    const hotel = await db('hotels')
      .where({ id })
      .whereNull('deleted_at')
      .first();

    if (!hotel) {
      res.status(404).json({ error: 'Hotel not found' } as any);
      return;
    }

    // Check access
    if (!isSuperAdmin(user)) {
      const userHotel = await db('user_hotels')
        .where({
          user_id: user.userId,
          hotel_id: id,
        })
        .first();

      if (!userHotel) {
        res.status(403).json({
          error: 'You do not have access to this hotel',
        } as any);
        return;
      }
    }

    // Exclude deleted_at from response
    const { deleted_at, ...hotelResponse } = hotel;
    res.json(hotelResponse);
  } catch (error) {
    next(error);
  }
}

/**
 * Create new hotel
 * 
 * Requires ADMIN or SUPER_ADMIN role
 */
export async function createHotelHandler(
  req: AuthenticatedRequest,
  res: Response<HotelResponse>,
  next: NextFunction,
) {
  try {
    const data = req.body as CreateHotelRequest;
    const user = req.user;

    console.log('[createHotelHandler] Creating hotel:', {
      userId: user?.userId,
      userRole: user?.role,
      hotelName: data.hotel_name,
    });

    // Validation
    if (!data.hotel_name) {
      res.status(400).json({ error: 'Hotel name is required' } as any);
      return;
    }

    // Set defaults
    const hotelData = {
      hotel_name: data.hotel_name,
      hotel_address: data.hotel_address || null,
      hotel_city: data.hotel_city || null,
      hotel_state: data.hotel_state || null,
      hotel_country: data.hotel_country || null,
      hotel_postal_code: data.hotel_postal_code || null,
      hotel_phone: data.hotel_phone || null,
      hotel_email: data.hotel_email || null,
      hotel_website: data.hotel_website || null,
      hotel_logo_url: data.hotel_logo_url || null,
      currency: data.currency || 'USD',
      timezone: data.timezone || 'UTC',
      date_format: data.date_format || 'YYYY-MM-DD',
      time_format: data.time_format || 'HH:mm',
      check_in_time: data.check_in_time || '14:00',
      check_out_time: data.check_out_time || '11:00',
      tax_percentage: data.tax_percentage || 0,
      active_channel_manager: data.active_channel_manager || null,
      beds24_property_id: data.beds24_property_id || null,
    };

    const [hotel] = await db('hotels')
      .insert(hotelData)
      .returning('*');

    console.log('[createHotelHandler] Hotel created successfully:', {
      id: hotel.id,
      name: hotel.hotel_name,
      deleted_at: hotel.deleted_at,
    });

    // Exclude deleted_at from response
    const { deleted_at, ...hotelResponse } = hotel;
    res.status(201).json(hotelResponse);

    // Audit log
    logCreate(req, 'hotel', hotel.id, {
      hotel_name: hotel.hotel_name,
    }).catch((err) => console.error('Audit log failed:', err));
  } catch (error) {
    console.error('[createHotelHandler] Error:', error);
    next(error);
  }
}

/**
 * Update hotel
 * 
 * Requires ADMIN or SUPER_ADMIN role
 * Must have access to the hotel (or be SUPER_ADMIN)
 */
export async function updateHotelHandler(
  req: AuthenticatedRequest,
  res: Response<HotelResponse>,
  next: NextFunction,
) {
  try {
    const { id } = req.params;
    const data = req.body as UpdateHotelRequest;
    const user = req.user;

    if (!user) {
      res.status(401).json({ error: 'Unauthorized' } as any);
      return;
    }

    // Check hotel exists
    const existingHotel = await db('hotels')
      .where({ id })
      .whereNull('deleted_at')
      .first();

    if (!existingHotel) {
      res.status(404).json({ error: 'Hotel not found' } as any);
      return;
    }

    // Check access
    if (!isSuperAdmin(user)) {
      const userHotel = await db('user_hotels')
        .where({
          user_id: user.userId,
          hotel_id: id,
        })
        .first();

      if (!userHotel) {
        res.status(403).json({
          error: 'You do not have access to this hotel',
        } as any);
        return;
      }
    }

    // Build update object
    const updateData: any = {
      updated_at: new Date(),
    };

    if (data.hotel_name !== undefined) updateData.hotel_name = data.hotel_name;
    if (data.hotel_address !== undefined) updateData.hotel_address = data.hotel_address;
    if (data.hotel_city !== undefined) updateData.hotel_city = data.hotel_city;
    if (data.hotel_state !== undefined) updateData.hotel_state = data.hotel_state;
    if (data.hotel_country !== undefined) updateData.hotel_country = data.hotel_country;
    if (data.hotel_postal_code !== undefined) updateData.hotel_postal_code = data.hotel_postal_code;
    if (data.hotel_phone !== undefined) updateData.hotel_phone = data.hotel_phone;
    if (data.hotel_email !== undefined) updateData.hotel_email = data.hotel_email;
    if (data.hotel_website !== undefined) updateData.hotel_website = data.hotel_website;
    if (data.hotel_logo_url !== undefined) updateData.hotel_logo_url = data.hotel_logo_url;
    if (data.currency !== undefined) updateData.currency = data.currency;
    if (data.timezone !== undefined) updateData.timezone = data.timezone;
    if (data.date_format !== undefined) updateData.date_format = data.date_format;
    if (data.time_format !== undefined) updateData.time_format = data.time_format;
    if (data.check_in_time !== undefined) updateData.check_in_time = data.check_in_time;
    if (data.check_out_time !== undefined) updateData.check_out_time = data.check_out_time;
    if (data.tax_percentage !== undefined) updateData.tax_percentage = data.tax_percentage;
    if (data.active_channel_manager !== undefined) updateData.active_channel_manager = data.active_channel_manager;
    if (data.beds24_property_id !== undefined) updateData.beds24_property_id = data.beds24_property_id;

    const [updatedHotel] = await db('hotels')
      .where({ id })
      .update(updateData)
      .returning('*');

    // Exclude deleted_at from response
    const { deleted_at, ...hotelResponse } = updatedHotel;
    res.json(hotelResponse);

    // Audit log
    logUpdate(req, 'hotel', id!, existingHotel, updatedHotel)
      .catch((err) => console.error('Audit log failed:', err));
  } catch (error) {
    next(error);
  }
}

/**
 * Delete hotel (soft delete)
 * 
 * Requires SUPER_ADMIN role
 */
export async function deleteHotelHandler(
  req: AuthenticatedRequest,
  res: Response<{ success: boolean; message: string }>,
  next: NextFunction,
) {
  try {
    const { id } = req.params;

    // Check hotel exists
    const existingHotel = await db('hotels')
      .where({ id })
      .whereNull('deleted_at')
      .first();

    if (!existingHotel) {
      res.status(404).json({ error: 'Hotel not found' } as any);
      return;
    }

    // Soft delete
    await db('hotels')
      .where({ id })
      .update({
        deleted_at: new Date(),
        updated_at: new Date(),
      });

    res.json({
      success: true,
      message: 'Hotel deleted successfully',
    });

    // Audit log
    logDelete(req, 'hotel', id!, existingHotel)
      .catch((err) => console.error('Audit log failed:', err));
  } catch (error) {
    next(error);
  }
}

