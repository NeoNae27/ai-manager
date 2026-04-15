import { Router } from 'express';
import type { HealthService } from '../../application/health-service.js';
import { toHealthResponse } from '../dto/providers.js';

export const createHealthRouter = (healthService: HealthService): Router => {
  const router = Router();

  router.get('/', async (_request, response) => {
    const health = await healthService.getStatus();
    response.json(toHealthResponse(health));
  });

  return router;
};
