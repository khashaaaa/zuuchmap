import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `booking.responded_at` — when the provider actually answered the request.
 *
 * Provider response time was derived from `date_updated - date_created`, which
 * held only while status was the only field that ever changed on an answered
 * booking. `review_prompted_at` ended that: the nightly prompt sweep updates
 * every finished ACCEPTED row, so the stat drifted from "how fast this provider
 * replies" to "how long ago the rental was requested" — and it drifted worst
 * for the providers who complete the most bookings.
 *
 * Backfill is deliberately partial. For rows the prompt sweep has not touched,
 * `date_updated` is still the response and is the best estimate available. For
 * rows it has, that value is known to be wrong, so they are left NULL and
 * simply drop out of the average rather than poisoning it.
 */
export class BookingRespondedAt1784335400000 implements MigrationInterface {
  name = 'BookingRespondedAt1784335400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "booking" ADD "responded_at" TIMESTAMP`);
    await queryRunner.query(`
      UPDATE "booking"
         SET "responded_at" = "date_updated"
       WHERE status IN ('ACCEPTED', 'DECLINED')
         AND "review_prompted_at" IS NULL`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "booking" DROP COLUMN "responded_at"`);
  }
}
