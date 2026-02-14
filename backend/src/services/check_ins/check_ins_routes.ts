/**
 * Check-ins Routes
 * 
 * API endpoints for check-in/checkout operations and room management.
 */

import { Router } from 'express';
import { authenticateToken, requireRole, hotelContext } from '../auth/auth_middleware.js';
import {
  createCheckInHandler,
  getCheckInHandler,
  listCheckInsHandler,
  checkOutHandler,
  changeRoomHandler,
  getEligibleRoomsHandler,
  checkInFromReservationHandler,
} from './check_ins_controller.js';

const router = Router();

// All routes require authentication and hotel context
router.use(authenticateToken);
router.use(hotelContext);

// Check-in routes
router.post(
  '/check-ins',
  requireRole('ADMIN', 'SUPER_ADMIN', 'MANAGER', 'FRONT_DESK'),
  createCheckInHandler
);

router.get(
  '/check-ins',
  listCheckInsHandler
);

router.get(
  '/check-ins/:id',
  getCheckInHandler
);

router.patch(
  '/check-ins/:id/checkout',
  requireRole('ADMIN', 'SUPER_ADMIN', 'MANAGER', 'FRONT_DESK'),
  checkOutHandler
);

router.post(
  '/check-ins/:id/change-room',
  requireRole('ADMIN', 'SUPER_ADMIN', 'MANAGER', 'FRONT_DESK'),
  changeRoomHandler
);

// Helper endpoints that extend reservations API
router.get(
  '/reservations/:id/eligible-rooms',
  getEligibleRoomsHandler
);

router.post(
  '/reservations/:id/check-in',
  requireRole('ADMIN', 'SUPER_ADMIN', 'MANAGER', 'FRONT_DESK'),
  checkInFromReservationHandler
);

export { router as checkInsRoutes };



