import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 1 monetization columns.
 *
 * `post.featured_until` is a window, not a boolean, so a paid placement lapses
 * on its own without a scheduled job having to un-set anything — the ordering
 * predicate simply stops matching. The partial index covers only live windows,
 * which is the only range the browse query ever compares against.
 *
 * `user.plan` defaults to FREE for every existing row, so the post quota
 * applies uniformly from the moment it ships.
 */
export class MonetizationPhase11784334600000 implements MigrationInterface {
  name = 'MonetizationPhase11784334600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "post" ADD "featured_until" TIMESTAMP`);
    await queryRunner.query(`ALTER TABLE "user" ADD "plan" character varying NOT NULL DEFAULT 'FREE'`);
    await queryRunner.query(`ALTER TABLE "user" ADD "plan_expires_at" TIMESTAMP`);
    await queryRunner.query(
      `CREATE INDEX "IDX_post_featured_until" ON "post" ("featured_until") WHERE "featured_until" IS NOT NULL`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_user_plan" ON "user" ("plan")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_user_plan"`);
    await queryRunner.query(`DROP INDEX "IDX_post_featured_until"`);
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "plan_expires_at"`);
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "plan"`);
    await queryRunner.query(`ALTER TABLE "post" DROP COLUMN "featured_until"`);
  }
}
