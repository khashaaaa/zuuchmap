import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Makes `payment` able to describe a second product: featured placement.
 *
 * The plan ladder was the only thing anyone could buy, so a payment row only
 * ever had to say which plan and how many months. Placement is sold per post
 * per day, which the existing columns cannot express — and it is the revenue
 * line the schema was already half-built for: `post.featured_until` /
 * `is_featured` have been indexed and sorted first in browse all along, with
 * no way in but an admin toggling them by hand.
 *
 * `plan` becomes nullable because a FEATURED row buys placement on a post
 * rather than entitlement on an account; `kind` defaults to PLAN so every row
 * written before this reads correctly without a backfill.
 */
export class FeaturedPlacementPayments1784336400000
  implements MigrationInterface
{
  name = 'FeaturedPlacementPayments1784336400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "payment" ADD COLUMN IF NOT EXISTS "kind" character varying NOT NULL DEFAULT 'PLAN'`,
    );
    await queryRunner.query(
      `ALTER TABLE "payment" ADD COLUMN IF NOT EXISTS "days" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "payment" ADD COLUMN IF NOT EXISTS "postId" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "payment" ALTER COLUMN "plan" DROP NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "payment" DROP CONSTRAINT IF EXISTS "FK_payment_post"`,
    );
    await queryRunner.query(
      `ALTER TABLE "payment" ADD CONSTRAINT "FK_payment_post"
         FOREIGN KEY ("postId") REFERENCES "post"("id") ON DELETE SET NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_payment_kind" ON "payment" ("kind")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_payment_post" ON "payment" ("postId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_payment_post"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_payment_kind"`);
    await queryRunner.query(
      `ALTER TABLE "payment" DROP CONSTRAINT IF EXISTS "FK_payment_post"`,
    );
    // Only PLAN rows can survive a column that is about to be NOT NULL again.
    await queryRunner.query(
      `DELETE FROM "payment" WHERE "plan" IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "payment" ALTER COLUMN "plan" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "payment" DROP COLUMN IF EXISTS "postId"`,
    );
    await queryRunner.query(`ALTER TABLE "payment" DROP COLUMN IF EXISTS "days"`);
    await queryRunner.query(`ALTER TABLE "payment" DROP COLUMN IF EXISTS "kind"`);
  }
}
