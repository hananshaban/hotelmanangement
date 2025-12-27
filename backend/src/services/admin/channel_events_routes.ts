import { Router } from 'express';
import { authenticateToken, requireRole } from '../auth/auth_middleware.js';
import {
  getChannelEventsHandler,
  getChannelEventHandler,
  retryChannelEventHandler,
} from './channel_events_controller.js';

const router = Router();

// All admin routes require authentication and ADMIN/SUPER_ADMIN role
router.use(authenticateToken);
router.use(requireRole('ADMIN', 'SUPER_ADMIN'));

// List channel events (DLQ listing)
router.get('/events', getChannelEventsHandler);

// Get single channel event
router.get('/events/:id', getChannelEventHandler);

// Retry failed event
router.post('/events/:id/retry', retryChannelEventHandler);

export const adminRoutes = router;

