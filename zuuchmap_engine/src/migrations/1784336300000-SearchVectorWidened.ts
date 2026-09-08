import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Widen `post.search_vector` past title + details.
 *
 * The post form collects the things people actually search for — manufacturer,
 * model, capacity — as structured attributes, and the location as its own
 * fields. None of them were in the vector, so "Komatsu", "PC-200" or a district
 * name found nothing unless the provider had also typed it into the title. The
 * filters covered category and province; nothing covered "the brand I want".
 *
 * `attributes::text` rather than `jsonb_to_tsvector` so every part of the
 * document goes through the same punctuation collapse as the query side — the
 * jsonb parser keeps `-200` as its own lexeme, which `200:*` then cannot match.
 * It pulls the attribute *keys* in as lexemes too; they are a fixed, small
 * vocabulary and cost a search nothing.
 *
 * `utils/search-terms.ts` mirrors this document in JS for saved searches —
 * change the two together.
 */
export class SearchVectorWidened1784336300000 implements MigrationInterface {
  name = 'SearchVectorWidened1784336300000';

  private static readonly WIDE = `to_tsvector('simple', regexp_replace(coalesce("title", '') || ' ' || coalesce("details", '') || ' ' || coalesce("location", '') || ' ' || coalesce("address", '') || ' ' || coalesce("attributes"::text, ''), '[^[:alnum:]]+', ' ', 'g'))`;

  private static readonly NARROW = `to_tsvector('simple', regexp_replace(coalesce("title", '') || ' ' || coalesce("details", ''), '[^[:alnum:]]+', ' ', 'g'))`;

  private async rebuild(
    queryRunner: QueryRunner,
    expression: string,
  ): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_post_search_vector"`);
    await queryRunner.query(
      `ALTER TABLE "post" DROP COLUMN IF EXISTS "search_vector"`,
    );
    await queryRunner.query(
      `ALTER TABLE "post" ADD "search_vector" tsvector GENERATED ALWAYS AS (${expression}) STORED`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_post_search_vector" ON "post" USING GIN ("search_vector")`,
    );
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.rebuild(queryRunner, SearchVectorWidened1784336300000.WIDE);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await this.rebuild(queryRunner, SearchVectorWidened1784336300000.NARROW);
  }
}
