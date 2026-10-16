import 'reflect-metadata';
import '../config/load-env';
import { DataSource, type DataSourceOptions } from 'typeorm';
import { env } from '../config/env';
import { FUZZY_THRESHOLD } from '../post/search-terms';

export function dataSourceOptions(): DataSourceOptions {
  const e = env();
  return {
    type: 'postgres',
    host: e.PG_HOST,
    port: e.PG_PORT,
    username: e.PG_USER,
    password: e.PG_PASSWORD,
    database: e.PG_DATABASE,
    ssl: e.PG_SSL ? { rejectUnauthorized: true } : false,
    // Search's fuzzy arm (`:term <% lower(title)`) reads this threshold; see FUZZY_THRESHOLD.
    // JIT off: browse's large-cost plans paid ~20 ms compiling for queries that run in a few.
    extra: { options: `-c pg_trgm.word_similarity_threshold=${FUZZY_THRESHOLD} -c jit=off` },
    synchronize: false,
    migrationsRun: false,
    migrations: [__dirname + '/../migrations/*{.ts,.js}'],
  };
}

export default new DataSource(dataSourceOptions());
