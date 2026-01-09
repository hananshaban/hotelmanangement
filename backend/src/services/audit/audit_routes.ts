import { Router } from 'express';
import { authenticateToken, requireRole } from '../auth/auth_middleware.js';
import {
  getAuditLogsHandler,
  getAuditLogHandler,
} from './audit_controller.js';

const router = Router();

// All audit log routes require authentication
// Only ADMIN, MANAGER, and SUPER_ADMIN can view audit logs
router.get(
  '/audit-logs',
  authenticateToken,
  requireRole('SUPER_ADMIN', 'ADMIN', 'MANAGER'),
  getAuditLogsHandler,
);

router.get(
  '/audit-logs/:id',
  authenticateToken,
  requireRole('SUPER_ADMIN', 'ADMIN', 'MANAGER'),
  getAuditLogHandler,
);

export { router as auditRoutes };



