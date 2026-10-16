import type { DataSourceOptions } from 'typeorm';
import { useTestDatabase } from './test-env';

/**
 * Creates the test database when missing and rebuilds it whenever the migration files changed
 * (the schema migration is edited in place until launch, so migrating forward would miss edits).
 */
export default async function globalSetup(): Promise<void> {
  const name = useTestDatabase();
  const { DataSource } = await import('typeorm');
  const { dataSourceOptions } = await import('../src/database/data-source');
  const { appliedSchemaHash, resetSchema, schemaHash } = await import('../src/database/reset');
  const admin = new DataSource({ ...dataSourceOptions(), database: 'postgres' } as DataSourceOptions);
  await admin.initialize();
  try {
    const found = await admin.query<unknown[]>('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
    if (found.length === 0) await admin.query(`CREATE DATABASE "${name.replace(/"/g, '')}"`);
  } finally {
    await admin.destroy();
  }
  const ds = new DataSource(dataSourceOptions());
  await ds.initialize();
  try {
    if ((await appliedSchemaHash(ds)) !== schemaHash()) await resetSchema(ds);
  } finally {
    await ds.destroy();
  }
}
