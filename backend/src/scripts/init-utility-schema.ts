import '../config/env.js';
import { ensureUtilitySchema } from '../shared/database/bootstrap.js';
import { closeSqlPool, getSqlPool } from '../shared/database/sql-server.js';

async function main() {
  await getSqlPool();
  await ensureUtilitySchema();
  console.log('Utility schema initialized successfully.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await closeSqlPool();
  });
