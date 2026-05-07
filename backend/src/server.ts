import './config/env.js';
import { buildApp } from './app.js';
import { env } from './config/env.js';
import { ensureUtilitySchema } from './shared/database/bootstrap.js';
import { closeSqlPool, getSqlPool } from './shared/database/sql-server.js';

const start = async () => {
  const app = await buildApp();

  try {
    await getSqlPool();
    await ensureUtilitySchema();
    app.log.info('SQL Server connected');

    await app.listen({ port: env.PORT, host: env.HOST });
    app.log.info(`Server running on http://${env.HOST}:${env.PORT}`);
  } catch (error) {
    app.log.error(error);
    await closeSqlPool();
    process.exit(1);
  }
};

const shutdown = async () => {
  await closeSqlPool();
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason);
});
process.on('uncaughtException', async (error) => {
  console.error('Uncaught exception:', error);
  await closeSqlPool().catch(() => undefined);
  process.exit(1);
});

start();
