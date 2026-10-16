import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DataSource } from 'typeorm';

const MIGRATIONS = join(__dirname, '..', 'migrations');

/** A hash of every migration file, so a database built from an older copy can tell. */
export function schemaHash(): string {
  const hash = createHash('sha256');
  for (const file of readdirSync(MIGRATIONS).filter((f) => /\.(ts|js)$/.test(f)).sort()) {
    hash.update(file).update(readFileSync(join(MIGRATIONS, file)));
  }
  return hash.digest('hex').slice(0, 16);
}

/** The hash the database was last reset with, or null. */
export async function appliedSchemaHash(ds: DataSource): Promise<string | null> {
  const [row] = await ds.query<Array<{ c: string | null }>>(
    `SELECT obj_description('public'::regnamespace, 'pg_namespace') AS c`,
  );
  const m = /^schema:(\w+)$/.exec(row.c ?? '');
  return m ? m[1] : null;
}

/**
 * Drops everything in `public` and migrates from nothing. Until launch the schema migration is
 * edited in place, so an existing database is rebuilt rather than migrated forward.
 */
export async function resetSchema(ds: DataSource): Promise<void> {
  await ds.query('DROP SCHEMA public CASCADE');
  await ds.query('CREATE SCHEMA public');
  await ds.runMigrations({ transaction: 'each' });
  await ds.query(`COMMENT ON SCHEMA public IS 'schema:${schemaHash()}'`);
}
