import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Weight `post.search_vector` so browse can rank a search by relevance.
 *
 * Results were ordered newest-first whatever matched where, so a word in a
 * title counted no more than the same word buried in a description: "засвар"
 * had seven title matches and showed one of them in its top five. The vector
 * is now three parts — title (A), attribute values (B), details + location +
 * address (C) — and `ts_rank` reads the weights.
 *
 * The lexemes are exactly those of SearchVectorValuesOnly — only positions and
 * weights change — so `utils/search-terms.ts` `postDocument` still mirrors it.
 */
export class SearchVectorWeighted1784336900000 implements MigrationInterface {
  name = 'SearchVectorWeighted1784336900000';

  private static readonly ATTRS_VALUES = `regexp_replace(coalesce("attributes"::text, ''), '"(?:[^"\\\\]|\\\\.)*"\\s*:\\s*(?:true|false|null)?', ' ', 'g')`;

  private static part(text: string, weight: string): string {
    return `setweight(to_tsvector('simple', regexp_replace(${text}, '[^[:alnum:]]+', ' ', 'g')), '${weight}')`;
  }

  private static readonly WEIGHTED = [
    SearchVectorWeighted1784336900000.part(`coalesce("title", '')`, 'A'),
    SearchVectorWeighted1784336900000.part(
      SearchVectorWeighted1784336900000.ATTRS_VALUES,
      'B',
    ),
    SearchVectorWeighted1784336900000.part(
      `coalesce("details", '') || ' ' || coalesce("location", '') || ' ' || coalesce("address", '')`,
      'C',
    ),
  ].join(' || ');

  private static readonly FLAT = `to_tsvector('simple', regexp_replace(coalesce("title", '') || ' ' || coalesce("details", '') || ' ' || coalesce("location", '') || ' ' || coalesce("address", '') || ' ' || ${SearchVectorWeighted1784336900000.ATTRS_VALUES}, '[^[:alnum:]]+', ' ', 'g'))`;

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
    await this.rebuild(queryRunner, SearchVectorWeighted1784336900000.WEIGHTED);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await this.rebuild(queryRunner, SearchVectorWeighted1784336900000.FLAT);
  }
}
