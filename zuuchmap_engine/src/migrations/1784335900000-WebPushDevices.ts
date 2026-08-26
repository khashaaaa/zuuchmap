import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Web push, alongside Expo, in the same `push_device` table.
 *
 * Notifications were Expo push plus an in-app socket, so a provider who works
 * from the website received nothing at all once the tab was closed — no
 * booking request, no approval, no message. One table keeps the fan-out a
 * single query and a single dispatch path regardless of transport.
 *
 * `token` already carries a unique index and now holds either an
 * ExponentPushToken or a subscription endpoint URL. Both identify exactly one
 * place to deliver to, so the constraint keeps meaning what it meant.
 */
export class WebPushDevices1784335900000 implements MigrationInterface {
  name = 'WebPushDevices1784335900000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Default 'EXPO' backfills every existing row correctly: until now that is
    // the only kind of device that could have been registered.
    await queryRunner.query(
      `ALTER TABLE "push_device" ADD "provider" character varying NOT NULL DEFAULT 'EXPO'`,
    );
    await queryRunner.query(
      `ALTER TABLE "push_device" ADD "web_subscription" jsonb`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "push_device" WHERE "provider" = 'WEB'`,
    );
    await queryRunner.query(
      `ALTER TABLE "push_device" DROP COLUMN "web_subscription"`,
    );
    await queryRunner.query(`ALTER TABLE "push_device" DROP COLUMN "provider"`);
  }
}
