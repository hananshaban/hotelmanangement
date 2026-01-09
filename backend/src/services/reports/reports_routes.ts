import { Router } from 'express';
import { authenticateToken } from '../auth/auth_middleware.js';
import { getReportStatsHandler } from './reports_controller.js';

const router = Router();

// All routes require authentication
router.use(authenticateToken);

// Report routes
router.get('/reports/stats', getReportStatsHandler);

export { router as reportsRoutes };



