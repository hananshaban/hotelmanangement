import { Router } from 'express';
import { authenticateToken, requireRole } from '../auth/auth_middleware.js';
import {
  getExpensesHandler,
  getExpenseHandler,
  createExpenseHandler,
  updateExpenseHandler,
  deleteExpenseHandler,
  getExpenseStatsHandler,
} from './expenses_controller.js';

const router = Router();

// All routes require authentication
router.use(authenticateToken);

// Expense routes
router.get('/expenses', getExpensesHandler);
router.get('/expenses/stats', getExpenseStatsHandler);
router.get('/expenses/:id', getExpenseHandler);
router.post('/expenses', requireRole('ADMIN', 'SUPER_ADMIN', 'MANAGER', 'FRONT_DESK'), createExpenseHandler);
router.put('/expenses/:id', requireRole('ADMIN', 'SUPER_ADMIN', 'MANAGER', 'FRONT_DESK'), updateExpenseHandler);
router.delete('/expenses/:id', requireRole('ADMIN', 'SUPER_ADMIN'), deleteExpenseHandler);

export { router as expensesRoutes };



