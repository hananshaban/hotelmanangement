// src/features/health-check/health-check-routes.ts
import { Router } from 'express';

import { healthCheckHandler } from './health_check_controller.js';

const router = Router();

router.get('/', healthCheckHandler);

export { router as healthCheckRoutes };