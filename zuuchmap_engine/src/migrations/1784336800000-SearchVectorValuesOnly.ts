import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Index attribute *values*, not keys.
 *
 * SearchVectorWidened put `attributes::text` into the vector whole, on the
 * argument that the keys were a small vocabulary that cost a search nothing.
 * They are matched by prefix, so they cost plenty: "man" (MAN trucks) hit every
 * post carrying a `manufacturer` key — 152 of 358 approved — and "true",
 * "with", "operator", "condition" each matched a third to half the corpus.
 *
 * The regexp drops every `"key":` and the JSON literal (`true` `false` `null`)
 * right after it, leaving string and number values to the same punctuation
 * collapse as before. `utils/search-terms.ts` `postDocument` applies the same
 * pattern for saved searches — change the two together.
 */
export class SearchVectorValuesOnly1784336800000 implements MigrationInterface {
  name = 'SearchVectorValuesOnly1784336800000';

  private static readonly ATTRS_VALUES = `regexp_replace(coalesce("attributes"::text, ''), '"(?:[^"\\\\]|\\\\.)*"\\s*:\\s*(?:true|false|null)?', ' ', 'g')`;

  private static vector(attrs: string): string {
    return `to_tsvector('simple', regexp_replace(coalesce("title", '') || ' ' || coalesce("details", '') || ' ' || coalesce("location", '') || ' ' || coalesce("address", '') || ' ' || ${attrs}, '[^[:alnum:]]+', ' ', 'g'))`;
  }

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
    await this.rebuild(
      queryRunner,
      SearchVectorValuesOnly1784336800000.vector(
        SearchVectorValuesOnly1784336800000.ATTRS_VALUES,
      ),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await this.rebuild(
      queryRunner,
      SearchVectorValuesOnly1784336800000.vector(
        `coalesce("attributes"::text, '')`,
      ),
    );
  }
}
