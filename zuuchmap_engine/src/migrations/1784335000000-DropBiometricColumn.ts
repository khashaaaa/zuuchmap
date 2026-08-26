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
 * Gating the stored token behind a device unlock would be a client-side lock,
 * and the server would have no business recording it either way — which is
 * exactly why this column never got written. (No such gate is implemented: the
 * app keeps its token in AsyncStorage.)
 */
export class DropBiometricColumn1784335000000 implements MigrationInterface {
  name = 'DropBiometricColumn1784335000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user" DROP COLUMN IF EXISTS "biometric"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user" ADD "biometric" character varying`,
    );
  }
}
