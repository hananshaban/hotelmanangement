import { Router } from 'express';
import { authenticateToken, requireRole } from '../auth/auth_middleware.js';
import {
  getMaintenanceRequestsHandler,
  getMaintenanceRequestHandler,
  createMaintenanceRequestHandler,
  updateMaintenanceRequestHandler,
  deleteMaintenanceRequestHandler,
} from './maintenance_controller.js';

const router = Router();

// All routes require authentication
router.use(authenticateToken);

// Maintenance request routes
router.get('/maintenance-requests', getMaintenanceRequestsHandler);
router.get('/maintenance-requests/:id', getMaintenanceRequestHandler);
router.post('/maintenance-requests', requireRole('ADMIN', 'SUPER_ADMIN', 'MANAGER', 'FRONT_DESK', 'MAINTENANCE'), createMaintenanceRequestHandler);
router.put('/maintenance-requests/:id', requireRole('ADMIN', 'SUPER_ADMIN', 'MANAGER', 'MAINTENANCE'), updateMaintenanceRequestHandler);
router.delete('/maintenance-requests/:id', requireRole('ADMIN', 'SUPER_ADMIN'), deleteMaintenanceRequestHandler);

export { router as maintenanceRoutes };



