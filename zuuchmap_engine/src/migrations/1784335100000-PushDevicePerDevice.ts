import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Moves push tokens from one column on `user` to one row per device.
 *
 * `user.push_token` could only hold the most recently registered device, which
 * broke two ways: a second sign-in silently muted the first device, and a sign
 * *out* on any device cleared the column for the whole account — muting devices
 * that were still logged in, with nothing to indicate it.
 *
 * Existing tokens are carried across so nobody has to re-register to keep
 * receiving pushes; only rows that actually look like Expo tokens come with us,
 * since anything else was never deliverable.
 */
export class PushDevicePerDevice1784335100000 implements MigrationInterface {
  name = 'PushDevicePerDevice1784335100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "push_device" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "token" character varying NOT NULL,
        "platform" character varying,
        "last_seen_at" TIMESTAMP NOT NULL DEFAULT now(),
        "date_created" TIMESTAMP NOT NULL DEFAULT now(),
        "date_updated" TIMESTAMP NOT NULL DEFAULT now(),
        "userId" uuid NOT NULL,
        CONSTRAINT "PK_push_device_id" PRIMARY KEY ("id")
      )`);
    await queryRunner.query(
      `ALTER TABLE "push_device" ADD CONSTRAINT "FK_push_device_user"
         FOREIGN KEY ("userId") REFERENCES "user"(id) ON DELETE CASCADE`,
    );
    // A token identifies a physical install, so it belongs to exactly one row —
    // when a device changes hands the row moves rather than duplicating.
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_push_device_token" ON "push_device" ("token")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_push_device_user" ON "push_device" ("userId")`,
    );

    await queryRunner.query(`
      INSERT INTO "push_device" ("token", "userId")
      SELECT "push_token", "id" FROM "user"
       WHERE "push_token" LIKE 'ExponentPushToken%'
      ON CONFLICT ("token") DO NOTHING`);

    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "push_token"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "user" ADD "push_token" character varying`);
    // Only one token per user can survive the trip back; keep the most recent.
    await queryRunner.query(`
      UPDATE "user" u SET "push_token" = d.token
        FROM (
          SELECT DISTINCT ON ("userId") "userId", token
            FROM "push_device" ORDER BY "userId", last_seen_at DESC
        ) d
       WHERE d."userId" = u.id`);
    await queryRunner.query(`DROP TABLE "push_device"`);
  }
}
