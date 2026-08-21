import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Indexes for the hot public-query predicates that had none:
 *
 * - post.district — every browse filter alongside the already-indexed province.
 * - post.expires_at — `expires_at > NOW()` guards every public list/map query
 *   and the nightly expiry cron's UPDATE.
 * - post.views — analytics top-posts ranking (`ORDER BY views DESC`).
 * - booking(start_date, end_date) — the accept-time overlap check; the existing
 *   booking indexes cover only status/post/customer/provider.
 */
export class PerfIndexes1784333500000 implements MigrationInterface {
  name = 'PerfIndexes1784333500000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_post_district" ON "post" ("district")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_post_expires_at" ON "post" ("expires_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_post_views" ON "post" ("views")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_booking_dates" ON "booking" ("start_date", "end_date")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_booking_dates"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_post_views"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_post_expires_at"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_post_district"`);
  }
}
