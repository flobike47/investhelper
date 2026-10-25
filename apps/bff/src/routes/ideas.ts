import type { FastifyInstance } from 'fastify';
import { requireUser } from '../auth.js';
import { computeIdeas } from '../ideas.js';
import { parseHorizon } from './signals.js';

/** Nombre d'idées affichées. */
const TOP_N = 5;

export async function registerIdeasRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { horizon?: string } }>('/ideas', async (req) => {
    const user = requireUser(req);
    return computeIdeas(user.id, parseHorizon(req.query.horizon), TOP_N, req.log);
  });
}
