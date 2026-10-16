import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { config } from 'dotenv';

/**
 * Tests never share the dev database: `seed:dev` fills that one with a market's worth of rows,
 * and the e2e specs count and page. They run against `<PG_DATABASE>_test` (or PG_TEST_DATABASE),
 * which `global-setup.ts` creates and migrates. Without a `.env` (CI) `.env.example` supplies
 * the compose defaults.
 */
export function useTestDatabase(): string {
  const root = resolve(__dirname, '..');
  config({ path: resolve(root, existsSync(resolve(root, '.env')) ? '.env' : '.env.example'), quiet: true });
  const base = process.env.PG_DATABASE ?? 'zuuchmap';
  const name = process.env.PG_TEST_DATABASE ?? (base.endsWith('_test') ? base : `${base}_test`);
  process.env.PG_DATABASE = name;
  return name;
}

useTestDatabase();
