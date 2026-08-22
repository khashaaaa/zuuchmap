import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Two new admin-editable knobs on category schemas:
 *
 * - `emphasized`  — clients render posts of this category with the
 *   attention-drawing card style that used to be hardcoded to 'sos' in the
 *   app (CustomerPostList). Backfilled true for sos so nothing changes
 *   visually; from here on it's an admin decision per category.
 * - `post_expiry_days` — days until a new post in this category expires.
 *   NULL means the system default (30). Validated 1–365 by CategoryService.
 */
export class CategoryEmphasisAndExpiry1784333700000 implements MigrationInterface {
  name = 'CategoryEmphasisAndExpiry1784333700000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "category_schema" ADD COLUMN IF NOT EXISTS "emphasized" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "category_schema" ADD COLUMN IF NOT EXISTS "post_expiry_days" integer`,
    );
    await queryRunner.query(
      `UPDATE "category_schema" SET "emphasized" = true WHERE "key" = 'sos'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "category_schema" DROP COLUMN IF EXISTS "post_expiry_days"`);
    await queryRunner.query(`ALTER TABLE "category_schema" DROP COLUMN IF EXISTS "emphasized"`);
  }
}
