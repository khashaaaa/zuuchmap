import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Makes the default browse sort index-servable, and drops two indexes that
 * were carrying write cost for no read benefit.
 *
 * The browse ordered by `CASE WHEN featured_until > NOW() THEN 0 ELSE 1 END`.
 * NOW() is not immutable, so no index can satisfy that ORDER BY: Postgres had
 * to read every matching row and sort it to return twenty. Measured at 62k
 * posts, the unfiltered browse became a parallel sequential scan of 41,691
 * rows (24 ms, 10k buffers) and a category browse cost 14.6 ms against 0.68 ms
 * for the same query ordered by a plain column.
 *
 * `is_featured` materialises that predicate so the ordering is a stored column.
 * It is written wherever `featured_until` is (admin feature/unfeature) and
 * refreshed hourly by a sweep, so a lapsed window keeps its placement for at
 * most an hour. Ranking only — nothing is hidden or shown based on it, and the
 * clients still derive the badge from `featured_until` itself, which stays
 * exact.
 *
 * The dropped pair — `(category)` and `(approval_status)` — are strict prefixes
 * of `(category, approval_status)` and `(approval_status, date_created)`, which
 * remain. Removing them in a transaction and re-running the read paths at 62k
 * rows changed no plan for the worse; the text search improved, because the
 * planner stopped building a bitmap AND over 46,917 rows to reach 2,807.
 */
export class FeaturedRankIndex1784335500000 implements MigrationInterface {
  name = 'FeaturedRankIndex1784335500000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "post" ADD "is_featured" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `UPDATE "post" SET "is_featured" = true
        WHERE "featured_until" IS NOT NULL AND "featured_until" > now()`,
    );
    // Column order mirrors the query: equality on approval_status, then the
    // two sort keys in their sort direction, so the scan stops at the page.
    await queryRunner.query(
      `CREATE INDEX "IDX_post_browse_order"
         ON "post" ("approval_status", "is_featured" DESC, "date_created" DESC)`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_60fc2bf4245759a0671aee7730"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_6458284fd3105a3705e94e8ee6"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX "IDX_6458284fd3105a3705e94e8ee6" ON "post" ("approval_status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_60fc2bf4245759a0671aee7730" ON "post" ("category")`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_post_browse_order"`);
    await queryRunner.query(`ALTER TABLE "post" DROP COLUMN "is_featured"`);
  }
}
