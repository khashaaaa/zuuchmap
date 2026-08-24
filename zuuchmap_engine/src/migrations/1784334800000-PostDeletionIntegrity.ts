import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Makes deleting a post survivable for everything that referenced it.
 *
 * Three separate holes, one cause — `post` had no honest relationship with the
 * rows that point at it:
 *
 * 1. `booking.postId` cascaded. Deleting a post destroyed its accepted
 *    bookings, and since review eligibility is "has an ACCEPTED booking with
 *    this provider", that silently erased the customer's right to review the
 *    provider they had just dealt with. SET NULL keeps the booking — and the
 *    eligibility — while letting the post go.
 * 2. `likedpost` and `viewedpost` had no post foreign key at all, so a deleted
 *    post left its likes and views behind forever. The saved list counted those
 *    orphans into `total` but dropped them from the page, so pagination claimed
 *    pages that came back short or empty.
 *
 * Orphans are cleared first: the constraints below cannot be added while any
 * row points at a post that no longer exists.
 */
export class PostDeletionIntegrity1784334800000 implements MigrationInterface {
  name = 'PostDeletionIntegrity1784334800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "likedpost" l WHERE NOT EXISTS (SELECT 1 FROM "post" p WHERE p.id = l.post_id)`,
    );
    await queryRunner.query(
      `DELETE FROM "viewedpost" v WHERE NOT EXISTS (SELECT 1 FROM "post" p WHERE p.id = v.post_id)`,
    );

    await queryRunner.query(
      `ALTER TABLE "likedpost" ADD CONSTRAINT "FK_likedpost_post"
         FOREIGN KEY (post_id) REFERENCES "post"(id) ON DELETE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "viewedpost" ADD CONSTRAINT "FK_viewedpost_post"
         FOREIGN KEY (post_id) REFERENCES "post"(id) ON DELETE CASCADE`,
    );

    // A booking outlives its post: it is the record that a deal happened.
    await queryRunner.query(`ALTER TABLE "booking" DROP CONSTRAINT "FK_booking_post"`);
    await queryRunner.query(
      `ALTER TABLE "booking" ADD CONSTRAINT "FK_booking_post"
         FOREIGN KEY ("postId") REFERENCES "post"(id) ON DELETE SET NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "booking" DROP CONSTRAINT "FK_booking_post"`);
    await queryRunner.query(
      `ALTER TABLE "booking" ADD CONSTRAINT "FK_booking_post"
         FOREIGN KEY ("postId") REFERENCES "post"(id) ON DELETE CASCADE`,
    );
    await queryRunner.query(`ALTER TABLE "viewedpost" DROP CONSTRAINT "FK_viewedpost_post"`);
    await queryRunner.query(`ALTER TABLE "likedpost" DROP CONSTRAINT "FK_likedpost_post"`);
  }
}
