import type { FastifyInstance } from 'fastify';
import { cachedFxRates } from '../marketCache.js';

export async function registerFxRoutes(app: FastifyInstance) {
  app.get('/fx', async () => cachedFxRates());
}
