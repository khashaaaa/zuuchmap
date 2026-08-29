import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `last_message_at` becomes the activity time for every conversation, not
 * only those with a message. The inbox used to order on
 * COALESCE(last_message_at, date_created), which no index can serve; with the
 * column always set it orders on the column and the (participant,
 * last_message_at) indexes do the work.
 */
export class ConversationActivity1784336000000 implements MigrationInterface {
  name = 'ConversationActivity1784336000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "conversation" SET "last_message_at" = "date_created" WHERE "last_message_at" IS NULL`,
    );
  }

  public async down(): Promise<void> {
    // Nothing to undo: a creation-time activity stamp is still a true value.
  }
}
