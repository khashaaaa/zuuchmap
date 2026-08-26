import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Dead-code removal follow-up:
 *  - user.device_info — only writer was the removed POST /user/otp/enroll-biometric
 *    flow; never read anywhere.
 *  - trusted_device.label — never written or read (the session-list UI it was
 *    reserved for was never built).
 */
export class DropDeadColumns1784334200000 implements MigrationInterface {
  name = 'DropDeadColumns1784334200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user" DROP COLUMN IF EXISTS "device_info"`,
    );
    await queryRunner.query(
      `ALTER TABLE "trusted_device" DROP COLUMN IF EXISTS "label"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "device_info" jsonb`,
    );
    await queryRunner.query(
      `ALTER TABLE "trusted_device" ADD COLUMN IF NOT EXISTS "label" character varying`,
    );
  }
}
