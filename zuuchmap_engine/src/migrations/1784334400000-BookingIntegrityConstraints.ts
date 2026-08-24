import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Two booking rules were enforced only by an application-level SELECT before
 * the INSERT/UPDATE, so concurrent requests both passed the check and both
 * wrote. Reproduced: two simultaneous accepts left one post ACCEPTED for two
 * customers over identical dates, and three simultaneous requests from one
 * customer left three PENDING rows on one post.
 *
 * Postgres already enforces the equivalent rules for likes
 * (UNIQUE user_id/post_type/post_id) and reviews (UNIQUE providerId/authorId);
 * bookings were the outlier. These constraints make the races impossible rather
 * than unlikely — the service still checks first so the common path returns a
 * friendly error code, and now catches the violation as the backstop.
 */
export class BookingIntegrityConstraints1784334400000 implements MigrationInterface {
  name = 'BookingIntegrityConstraints1784334400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Needed to mix the `=` on postId with the range `&&` in one constraint.
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS btree_gist`);

    // Clean up anything the old race already let through, keeping the earliest
    // accepted booking of each overlapping pair.
    await queryRunner.query(`
      UPDATE "booking" b SET status = 'DECLINED'
      WHERE b.status = 'ACCEPTED' AND EXISTS (
        SELECT 1 FROM "booking" o
        WHERE o."postId" = b."postId" AND o.status = 'ACCEPTED' AND o.id < b.id
          AND daterange(o.start_date::date, o.end_date::date, '[]')
           && daterange(b.start_date::date, b.end_date::date, '[]')
      )
    `);
    await queryRunner.query(`
      DELETE FROM "booking" b
      WHERE b.status = 'PENDING' AND EXISTS (
        SELECT 1 FROM "booking" o
        WHERE o."postId" = b."postId" AND o."customerId" = b."customerId"
          AND o.status = 'PENDING' AND o.id < b.id
      )
    `);

    // One accepted booking per post per date range.
    await queryRunner.query(`
      ALTER TABLE "booking" ADD CONSTRAINT "EX_booking_accepted_no_overlap"
      EXCLUDE USING gist (
        "postId" WITH =,
        daterange(start_date::date, end_date::date, '[]') WITH &&
      ) WHERE (status = 'ACCEPTED')
    `);

    // One pending request per customer per post.
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_booking_one_pending_per_customer_post"
      ON "booking" ("postId", "customerId") WHERE status = 'PENDING'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_booking_one_pending_per_customer_post"`);
    await queryRunner.query(`ALTER TABLE "booking" DROP CONSTRAINT IF EXISTS "EX_booking_accepted_no_overlap"`);
  }
}
