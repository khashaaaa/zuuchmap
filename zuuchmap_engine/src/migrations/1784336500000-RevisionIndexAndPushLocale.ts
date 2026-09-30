import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Three unrelated repairs, none of which touches a row.
 *
 * 1. `IDX_post_pending_revision` was a btree over the *value* of the jsonb
 *    column. A btree index row cannot exceed 2704 bytes, and a revision holds
 *    the whole proposed post — so an owner editing a live listing with a long
 *    description got a 500 from Postgres ("index row size exceeds btree
 *    maximum"). Nothing ever looks a revision up by value: the moderation queue
 *    only asks `pending_revision IS NOT NULL`, which the partial predicate
 *    answers on its own. Keyed on `id` it is the same index without the limit.
 *
 * 2. `user.email` was indexed twice: once by the entity's `@Index()` and once
 *    by `IDX_user_email` from 1784332900000. The second is dropped only where
 *    the first exists, so no database is left with none.
 *
 * 3. `push_device.locale` — the language a device's app is in, so a push is
 *    written in it (utils/push-messages.ts). Null reads as Mongolian, which is
 *    what every push was before.
 */
export class RevisionIndexAndPushLocale1784336500000
  implements MigrationInterface
{
  name = 'RevisionIndexAndPushLocale1784336500000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_post_pending_revision"`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_post_pending_revision" ON "post" ("id") WHERE "pending_revision" IS NOT NULL`,
    );

    await queryRunner.query(`
      DO $$
      BEGIN
        IF (SELECT COUNT(*) FROM pg_indexes
             WHERE schemaname = current_schema() AND tablename = 'user'
               AND indexdef LIKE '%(email)') > 1 THEN
          DROP INDEX IF EXISTS "IDX_user_email";
        END IF;
      END $$;
    `);

    await queryRunner.query(
      `ALTER TABLE "push_device" ADD COLUMN IF NOT EXISTS "locale" character varying`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "push_device" DROP COLUMN IF EXISTS "locale"`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_user_email" ON "user" ("email")`,
    );
    // The by-value index is not restored: it is the defect this migration
    // removes, and recreating it fails outright on any row too large for it.
  }
}
