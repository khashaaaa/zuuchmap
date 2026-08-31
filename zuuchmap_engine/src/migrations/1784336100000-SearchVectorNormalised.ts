import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Rebuild `post.search_vector` over punctuation-normalised text.
 *
 * The default parser kept punctuation inside a token (`pc`, `-200`, `5.5`,
 * `foo@bar.mn`, `self-dumper`) while the query side stripped it, so a search
 * for "PC-200" or "ГАЗ-53" could never match the listing that contained it.
 * Collapsing every non-alphanumeric run to a space before `to_tsvector` makes
 * the stored lexemes exactly the pieces `utils/search-terms.ts` splits into on
 * both the query and the saved-search side.
 */
export class SearchVectorNormalised1784336100000 implements MigrationInterface {
  name = 'SearchVectorNormalised1784336100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_post_search_vector"`);
    await queryRunner.query(`ALTER TABLE "post" DROP COLUMN "search_vector"`);
    await queryRunner.query(
      `ALTER TABLE "post" ADD "search_vector" tsvector GENERATED ALWAYS AS (to_tsvector('simple', regexp_replace(coalesce("title", '') || ' ' || coalesce("details", ''), '[^[:alnum:]]+', ' ', 'g'))) STORED`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_post_search_vector" ON "post" USING GIN ("search_vector")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_post_search_vector"`);
    await queryRunner.query(`ALTER TABLE "post" DROP COLUMN "search_vector"`);
    await queryRunner.query(
      `ALTER TABLE "post" ADD "search_vector" tsvector GENERATED ALWAYS AS (to_tsvector('simple', coalesce("title", '') || ' ' || coalesce("details", ''))) STORED`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_post_search_vector" ON "post" USING GIN ("search_vector")`,
    );
  }
}
