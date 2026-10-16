import '../config/load-env';
import { DataSource } from 'typeorm';
import { env } from '../config/env';
import { dataSourceOptions } from '../database/data-source';
import { resetSchema } from '../database/reset';

/**
 * Rebuilds the dev database from the migrations (every row is lost). Run after editing the schema
 * migration; `npm run db:reset -w @zuuchmap/engine` then reseeds.
 */
async function main(): Promise<void> {
  if (env().NODE_ENV === 'production') throw new Error('db:reset refuses to run with NODE_ENV=production');
  const ds = new DataSource(dataSourceOptions());
  await ds.initialize();
  try {
    await resetSchema(ds);
    console.log(`Reset ${env().PG_DATABASE}`);
  } finally {
    await ds.destroy();
  }
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
