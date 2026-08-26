import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Two moderation aids on `post`.
 *
 * `previous_snapshot` — when an APPROVED post is edited by its owner and drops
 * back into the queue, the pre-edit content is kept here so the admin reviews
 * a diff instead of re-reading a post they already approved once. Set by the
 * owner-edit path (first edit of a round wins), cleared by approve/reject.
 *
 * `rejection_field` — the form field a rejection is about, so the client can
 * open the edit form with that field highlighted instead of leaving the
 * provider to guess which of twelve inputs the reason refers to.
 */
export class PostSnapshotAndRejectionField1784335300000 implements MigrationInterface {
  name = 'PostSnapshotAndRejectionField1784335300000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "post" ADD COLUMN IF NOT EXISTS "previous_snapshot" jsonb`,
    );
    await queryRunner.query(
      `ALTER TABLE "post" ADD COLUMN IF NOT EXISTS "rejection_field" character varying`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "post" DROP COLUMN IF EXISTS "rejection_field"`,
    );
    await queryRunner.query(
      `ALTER TABLE "post" DROP COLUMN IF EXISTS "previous_snapshot"`,
    );
  }
}
