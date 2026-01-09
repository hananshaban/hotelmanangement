import { Router } from 'express';
import { authenticateToken, requireRole } from '../auth/auth_middleware.js';
import {
  getInvoicesHandler,
  getInvoiceHandler,
  createInvoiceHandler,
  updateInvoiceHandler,
  deleteInvoiceHandler,
} from './invoices_controller.js';

const router = Router();

// All routes require authentication
router.use(authenticateToken);

// Invoice routes
router.get('/invoices', getInvoicesHandler);
router.get('/invoices/:id', getInvoiceHandler);
router.post('/invoices', requireRole('ADMIN', 'SUPER_ADMIN', 'MANAGER', 'FRONT_DESK'), createInvoiceHandler);
router.put('/invoices/:id', requireRole('ADMIN', 'SUPER_ADMIN', 'MANAGER', 'FRONT_DESK'), updateInvoiceHandler);
router.delete('/invoices/:id', requireRole('ADMIN', 'SUPER_ADMIN'), deleteInvoiceHandler);

export { router as invoicesRoutes };



