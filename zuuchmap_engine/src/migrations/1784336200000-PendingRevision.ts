import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `post.pending_revision` — a content edit waiting for moderation on a post
 * that stays live meanwhile.
 *
 * Before this, editing an APPROVED post rewrote the row and set it back to
 * PENDING, so the listing left browse until an admin looked at it again. Since
 * price and contact number count as content, the most routine correction a
 * provider makes took their listing off the market for as long as the queue
 * was. Providers learned not to correct anything, and browse filled with
 * prices nobody trusted.
 *
 * Now the row keeps the approved version and the proposal is parked here.
 * Approve writes it onto the row; reject drops it and the live version stays.
 *
 * The index is partial: only a few rows are ever non-null, and the moderation
 * queue's only question is which ones.
 */
export class PendingRevision1784336200000 implements MigrationInterface {
  name = 'PendingRevision1784336200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "post" ADD COLUMN IF NOT EXISTS "pending_revision" jsonb`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_post_pending_revision" ON "post" ("pending_revision") WHERE "pending_revision" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_post_pending_revision"`);
    await queryRunner.query(
      `ALTER TABLE "post" DROP COLUMN IF EXISTS "pending_revision"`,
    );
  }
}
