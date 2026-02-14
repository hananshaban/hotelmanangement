// src/services/hotels/hotels_routes.ts
import { Router } from 'express';
import {
  getHotelsHandler,
  getHotelHandler,
  createHotelHandler,
  updateHotelHandler,
  deleteHotelHandler,
} from './hotels_controller.js';
import { authenticateToken, requireRole } from '../auth/auth_middleware.js';
import db from '../../config/database.js';

export const hotelsRoutes = Router();

// DEBUG ENDPOINT: Get all hotels without filters (temporary)
hotelsRoutes.get('/debug/all', authenticateToken, async (req, res) => {
  try {
    const allHotels = await db('hotels').select('*');
    const user = (req as any).user;
    res.json({
      user: {
        userId: user?.userId,
        email: user?.email,
        role: user?.role,
      },
      totalHotels: allHotels.length,
      hotels: allHotels.map(h => ({
        id: h.id,
        name: h.hotel_name,
        deleted_at: h.deleted_at,
      })),
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get all hotels (accessible to current user)
hotelsRoutes.get('/', authenticateToken, getHotelsHandler);

// Get single hotel
hotelsRoutes.get('/:id', authenticateToken, getHotelHandler);

// Create hotel (ADMIN and SUPER_ADMIN only)
hotelsRoutes.post(
  '/',
  authenticateToken,
  requireRole('ADMIN', 'SUPER_ADMIN'),
  createHotelHandler,
);

// Update hotel (ADMIN and SUPER_ADMIN only)
hotelsRoutes.put(
  '/:id',
  authenticateToken,
  requireRole('ADMIN', 'SUPER_ADMIN'),
  updateHotelHandler,
);

// Delete hotel (SUPER_ADMIN only)
hotelsRoutes.delete(
  '/:id',
  authenticateToken,
  requireRole('SUPER_ADMIN'),
  deleteHotelHandler,
);

