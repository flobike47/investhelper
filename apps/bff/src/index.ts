import { buildServer } from './server.js';
import { config } from './config.js';
import { redis } from './cache.js';

const app = await buildServer();

try {
  await app.listen({ port: config.port, host: config.host });
  app.log.info(
    `🟢 BFF up on http://${config.host}:${config.port} (env=${process.env.NODE_ENV ?? 'development'})`,
  );
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

let shuttingDown = false;
const shutdown = async (signal: string) => {
  if (shuttingDown) return;
  shuttingDown = true;
  app.log.info(`Received ${signal}, shutting down...`);
  try {
    await app.close();
    await redis.quit();
  } catch (e) {
    app.log.error({ err: e }, 'error during shutdown');
  }
  process.exit(0);
};
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// Erreurs non capturées : log et arrêt propre (au lieu d'une fermeture
// brutale qui laisse Redis ou Fastify dans un état pendouillant).
process.on('uncaughtException', (err) => {
  app.log.fatal({ err }, 'uncaughtException');
  shutdown('uncaughtException');
});
process.on('unhandledRejection', (reason) => {
  app.log.error({ reason }, 'unhandledRejection');
});
