import type { Request, Response, NextFunction } from 'express';
import { verifyToken, type JwtPayload } from './auth_utils.js';
import db from '../../config/database.js';

export interface AuthenticatedRequest extends Request {
  user?: JwtPayload;
  hotelId?: string;
}

export function authenticateToken(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      res.status(401).json({
        error: 'Access token required',
      });
      return;
    }

    const decoded = verifyToken(token);
    req.user = decoded;
    next();
  } catch (error) {
    // Return 401 for expired/invalid tokens (not 403)
    // This allows frontend to distinguish between auth errors and permission errors
    const errorMessage = error instanceof Error ? error.message : 'Invalid or expired token';
    const isExpired = errorMessage.toLowerCase().includes('expired');
    
    res.status(401).json({
      error: isExpired ? 'Token expired' : 'Invalid token',
      code: isExpired ? 'TOKEN_EXPIRED' : 'TOKEN_INVALID',
    });
  }
}

export function requireRole(...allowedRoles: string[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({
        error: 'Unauthorized',
      });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        error: 'Insufficient permissions',
      });
      return;
    }

    next();
  };
}

// Default hotel ID for backward compatibility (Phase 1)
// TODO: Remove this default in Phase 3 when frontend sends X-Hotel-Id header
const DEFAULT_HOTEL_ID = '00000000-0000-0000-0000-000000000000';

/**
 * Hotel Context Middleware
 * 
 * Validates the X-Hotel-Id header and ensures the user has access to the hotel.
 * SUPER_ADMIN users have implicit access to all hotels.
 * 
 * Must be applied after authenticateToken middleware.
 * 
 * TEMPORARY: Falls back to default hotel ID if header is missing (Phase 1 compatibility)
 */
export async function hotelContext(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) {
  try {
    if (!req.user) {
      res.status(401).json({
        error: 'Unauthorized',
      });
      return;
    }

    // Extract hotel ID from header or use default (Phase 1 backward compatibility)
    let hotelId = req.headers['x-hotel-id'] as string;

    // TEMPORARY: Fallback to default hotel if header is missing
    // This provides backward compatibility until frontend is updated (Phase 3)
    if (!hotelId) {
      console.warn('[hotelContext] X-Hotel-Id header missing, using default hotel (Phase 1 compatibility)');
      hotelId = DEFAULT_HOTEL_ID;
    }

    // Validate hotel exists and is not soft-deleted
    const hotel = await db('hotels')
      .where({ id: hotelId })
      .whereNull('deleted_at')
      .first();

    if (!hotel) {
      res.status(404).json({
        error: 'Hotel not found',
        code: 'HOTEL_NOT_FOUND',
      });
      return;
    }

    // SUPER_ADMIN has implicit access to all hotels
    if (req.user.role === 'SUPER_ADMIN') {
      req.hotelId = hotelId;
      next();
      return;
    }

    // For other users, check user_hotels junction table
    const userHotel = await db('user_hotels')
      .where({
        user_id: req.user.userId,
        hotel_id: hotelId,
      })
      .first();

    if (!userHotel) {
      res.status(403).json({
        error: 'You do not have access to this hotel',
        code: 'HOTEL_ACCESS_DENIED',
      });
      return;
    }

    // Attach hotel ID to request for use in controllers
    req.hotelId = hotelId;
    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Optional hotel context middleware
 * 
 * Similar to hotelContext but allows requests without X-Hotel-Id header.
 * Useful for endpoints that can work with or without hotel context (e.g., user profile).
 */
export async function optionalHotelContext(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) {
  try {
    const hotelId = req.headers['x-hotel-id'] as string;

    if (!hotelId) {
      // No hotel context, just continue
      next();
      return;
    }

    // If hotel ID is provided, validate it
    const hotel = await db('hotels')
      .where({ id: hotelId })
      .whereNull('deleted_at')
      .first();

    if (!hotel) {
      res.status(404).json({
        error: 'Hotel not found',
        code: 'HOTEL_NOT_FOUND',
      });
      return;
    }

    // SUPER_ADMIN has implicit access to all hotels
    if (req.user?.role === 'SUPER_ADMIN') {
      req.hotelId = hotelId;
      next();
      return;
    }

    // For other users, check access
    if (req.user) {
      const userHotel = await db('user_hotels')
        .where({
          user_id: req.user.userId,
          hotel_id: hotelId,
        })
        .first();

      if (!userHotel) {
        res.status(403).json({
          error: 'You do not have access to this hotel',
          code: 'HOTEL_ACCESS_DENIED',
        });
        return;
      }
    }

    req.hotelId = hotelId;
    next();
  } catch (error) {
    next(error);
  }
}

