import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Count anonymous views.
 *
 * `PUT /posts/:id/views` was JWT-guarded, so the number on a provider's
 * dashboard counted signed-in non-owners only — while the landing, browse and
 * detail pages are public and most of the traffic that reaches a listing never
 * signs in. Providers were reading a fraction and being sold "full stats" on it.
 *
 * `user_id` becomes nullable and `visitor_key` arrives beside it. The existing
 * UNIQUE (user_id, post_type, post_id) keeps deduping signed-in views and
 * ignores the new rows for free — Postgres treats NULLs as distinct — while a
 * partial unique index does the same job for anonymous ones.
 */
export class AnonymousViews1784335800000 implements MigrationInterface {
  name = 'AnonymousViews1784335800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "viewedpost" ALTER COLUMN "user_id" DROP NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "viewedpost" ADD "visitor_key" character varying(64)`,
    );
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_viewedpost_visitor"
        ON "viewedpost" ("visitor_key", "post_type", "post_id")
        WHERE "visitor_key" IS NOT NULL`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_viewedpost_visitor"`);
    await queryRunner.query(`DELETE FROM "viewedpost" WHERE "user_id" IS NULL`);
    await queryRunner.query(
      `ALTER TABLE "viewedpost" DROP COLUMN "visitor_key"`,
    );
    await queryRunner.query(
      `ALTER TABLE "viewedpost" ALTER COLUMN "user_id" SET NOT NULL`,
    );
  }
}
