import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phone verification via verify.mn (Mobile-Originated SMS) plus first-party
 * analytics. Replaces the in-memory OTP cache, which could not survive a pm2
 * cluster worker boundary and leaked its code over the wire.
 */
export class VerificationAndAnalytics1784333200000 implements MigrationInterface {
  name = 'VerificationAndAnalytics1784333200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "verification_session" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "provider_session_id" character varying,
        "phone_number" character varying NOT NULL,
        "code" character varying NOT NULL,
        "status" character varying NOT NULL DEFAULT 'PENDING',
        "device_hash" character varying,
        "last_checked_at" TIMESTAMP,
        "verified_at" TIMESTAMP,
        "expires_at" TIMESTAMP NOT NULL,
        "date_created" TIMESTAMP NOT NULL DEFAULT now(),
        "date_updated" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_verification_session_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_verification_session_provider" ON "verification_session" ("provider_session_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_verification_session_phone" ON "verification_session" ("phone_number")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_verification_session_phone_status" ON "verification_session" ("phone_number", "status")`,
    );

    await queryRunner.query(`
      CREATE TABLE "trusted_device" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "device_hash" character varying NOT NULL,
        "label" character varying,
        "last_seen_at" TIMESTAMP,
        "date_created" TIMESTAMP NOT NULL DEFAULT now(),
        "userId" uuid,
        CONSTRAINT "PK_trusted_device_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_trusted_device_user_hash" UNIQUE ("userId", "device_hash"),
        CONSTRAINT "FK_trusted_device_user" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_trusted_device_user" ON "trusted_device" ("userId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_trusted_device_hash" ON "trusted_device" ("device_hash")`,
    );

    await queryRunner.query(`
      CREATE TABLE "analytics_event" (
        "id" BIGSERIAL NOT NULL,
        "name" character varying NOT NULL,
        "anon_id" character varying,
        "path" character varying,
        "referrer" character varying,
        "platform" character varying,
        "props" jsonb,
        "occurred_at" TIMESTAMP NOT NULL DEFAULT now(),
        "userId" uuid,
        CONSTRAINT "PK_analytics_event_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_analytics_event_user" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_analytics_event_occurred" ON "analytics_event" ("occurred_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_analytics_event_name_occurred" ON "analytics_event" ("name", "occurred_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_analytics_event_anon" ON "analytics_event" ("anon_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_analytics_event_user" ON "analytics_event" ("userId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "analytics_event"`);
    await queryRunner.query(`DROP TABLE "trusted_device"`);
    await queryRunner.query(`DROP TABLE "verification_session"`);
  }
}
