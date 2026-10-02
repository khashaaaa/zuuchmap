import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * pg_trgm, for the fuzzy step of browse search (`utils/search-terms.ts`
 * `searchSql`, mode `fuzzy`): a search that matched nothing as typed retries
 * with each term allowed to be a near-spelling of a title word, so
 * "экскаваор" finds "Экскаваторын …".
 *
 * pg_trgm is a trusted extension (PostgreSQL 13+), so the database owner can
 * create it without superuser. No index: the fuzzy step runs only after a
 * search returned nothing, and `word_similarity(...) >= 0.5` cannot use one —
 * the indexable `<%` operator is pinned to the 0.6 session threshold, which
 * missed "самасвал" and "цемнт".
 */
export class SearchFuzzy1784337000000 implements MigrationInterface {
  name = 'SearchFuzzy1784337000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP EXTENSION IF EXISTS pg_trgm`);
  }
}
