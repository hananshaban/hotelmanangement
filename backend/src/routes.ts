// src/routes.ts
import { Router } from 'express';

import { healthCheckRoutes } from './services/health_check/health_check_routes.js';

export const apiV1Router = Router();

apiV1Router.use('/health-check', healthCheckRoutes);