import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `payment` — one row per attempt to buy plan time.
 *
 * Until now the only way into a paid plan was an admin toggling it after
 * reconciling a bank transfer by hand, which is not a rail you can grow on.
 * This is the table QPay settles against.
 *
 * `provider_invoice_id` is UNIQUE on purpose: QPay's callback is an
 * unauthenticated URL it may retry, and uniqueness makes a duplicate
 * impossible to represent rather than merely unlikely.
 *
 * The partial index on PENDING is what the hourly sweep scans — the paid rows
 * accumulate forever and the sweep never needs to see them.
 */
export class Payments1784335600000 implements MigrationInterface {
  name = 'Payments1784335600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "payment" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "plan" character varying NOT NULL,
        "months" integer NOT NULL DEFAULT 1,
        "amount" integer NOT NULL,
        "currency" character varying NOT NULL DEFAULT 'MNT',
        "provider" character varying NOT NULL DEFAULT 'QPAY',
        "status" character varying NOT NULL DEFAULT 'PENDING',
        "provider_invoice_id" character varying,
        "reference" character varying,
        "paid_at" TIMESTAMP,
        "granted_at" TIMESTAMP,
        "note" text,
        "date_created" TIMESTAMP NOT NULL DEFAULT now(),
        "date_updated" TIMESTAMP NOT NULL DEFAULT now(),
        "userId" uuid,
        CONSTRAINT "UQ_payment_provider_invoice_id" UNIQUE ("provider_invoice_id"),
        CONSTRAINT "PK_payment_id" PRIMARY KEY ("id")
      )`);

    await queryRunner.query(`
      ALTER TABLE "payment"
        ADD CONSTRAINT "FK_payment_user"
        FOREIGN KEY ("userId") REFERENCES "user"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION`);

    await queryRunner.query(
      `CREATE INDEX "IDX_payment_user" ON "payment" ("userId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_payment_status" ON "payment" ("status")`,
    );
    await queryRunner.query(`
      CREATE INDEX "IDX_payment_pending_created"
        ON "payment" ("date_created")
        WHERE status = 'PENDING'`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_payment_pending_created"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_payment_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_payment_user"`);
    await queryRunner.query(
      `ALTER TABLE "payment" DROP CONSTRAINT "FK_payment_user"`,
    );
    await queryRunner.query(`DROP TABLE "payment"`);
  }
}
