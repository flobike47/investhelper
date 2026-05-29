import type { FastifyInstance } from 'fastify';
import { cachedJson, TTL } from '../cache.js';
import { fx } from '../providers/fx.js';

export async function registerFxRoutes(app: FastifyInstance) {
  app.get('/fx', async () =>
    cachedJson('fx:eur', TTL.fx, () => fx.ratesToEur()),
  );
}
