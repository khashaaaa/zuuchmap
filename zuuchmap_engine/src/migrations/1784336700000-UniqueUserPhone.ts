import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * One account per phone number.
 *
 * Sign-in looks the number up and creates the user when it is missing, and
 * nothing stopped two finishing verifications from both creating it — a
 * concurrency test produced three accounts for one number, after which every
 * sign-in picked one of them at random. The unique index is what lets
 * `completeSession` insert with ON CONFLICT DO NOTHING.
 *
 * Duplicates already present are not merged here: which row keeps the posts,
 * bookings and messages is a judgement call. The migration refuses and names
 * them instead, which stops the deploy before anything else changes.
 */
export class UniqueUserPhone1784336700000 implements MigrationInterface {
  name = 'UniqueUserPhone1784336700000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const dupes: { phone_number: string; n: string }[] =
      await queryRunner.query(`
      SELECT phone_number, count(*) AS n FROM "user"
       WHERE phone_number IS NOT NULL
       GROUP BY phone_number HAVING count(*) > 1`);
    if (dupes.length) {
      throw new Error(
        `Duplicate user.phone_number, merge these by hand first: ${dupes
          .map((d) => `${d.phone_number}×${d.n}`)
          .join(', ')}`,
      );
    }
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_01eea41349b6c9275aec646eee"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_user_phone_number" ON "user" ("phone_number")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_user_phone_number"`);
    await queryRunner.query(
      `CREATE INDEX "IDX_01eea41349b6c9275aec646eee" ON "user" ("phone_number")`,
    );
  }
}
