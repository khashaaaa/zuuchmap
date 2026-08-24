import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Drops `user.biometric`.
 *
 * A leftover of the retired OTP flow, which accepted `biometric: true` as proof
 * of identity with nothing behind it. Since that endpoint became a tombstone
 * nothing has written this column — no service, no DTO, no auth path — and it
 * is NULL for every row. Its only remaining readers were two fields on the
 * `/user/check` response, removed alongside this.
 *
 * Biometrics still gate the locally-stored token on the device. That is a
 * client-side lock and always was; the server has no business recording it,
 * which is exactly why this column never got written.
 */
export class DropBiometricColumn1784335000000 implements MigrationInterface {
  name = 'DropBiometricColumn1784335000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN IF EXISTS "biometric"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "user" ADD "biometric" character varying`);
  }
}
