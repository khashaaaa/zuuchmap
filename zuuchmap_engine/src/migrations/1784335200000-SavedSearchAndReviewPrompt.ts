import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Two small pieces of retention plumbing.
 *
 * `saved_search` stores a browse filter a customer wants to hear about: the
 * same category/location/q/attr params `GET /posts` takes, so it can be
 * replayed by the client and matched server-side when an admin approves a
 * post. `last_notified_at` rate-limits the fan-out per search.
 *
 * `booking.review_prompted_at` records that the nightly sweep has already
 * nudged the customer to review a finished rental, so each booking is
 * prompted exactly once.
 */
export class SavedSearchAndReviewPrompt1784335200000 implements MigrationInterface {
  name = 'SavedSearchAndReviewPrompt1784335200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "saved_search" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "name" character varying NOT NULL,
        "category" character varying,
        "subcategory" character varying,
        "province" character varying,
        "district" character varying,
        "q" character varying,
        "attrs" jsonb DEFAULT '{}',
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "last_notified_at" TIMESTAMP,
        CONSTRAINT "PK_saved_search_id" PRIMARY KEY ("id")
      )`);
    await queryRunner.query(
      `ALTER TABLE "saved_search" ADD CONSTRAINT "FK_saved_search_user"
         FOREIGN KEY ("user_id") REFERENCES "user"(id) ON DELETE CASCADE`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_saved_search_user_id" ON "saved_search" ("user_id")`,
    );

    await queryRunner.query(`ALTER TABLE "booking" ADD "review_prompted_at" TIMESTAMP`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "booking" DROP COLUMN "review_prompted_at"`);
    await queryRunner.query(`DROP TABLE "saved_search"`);
  }
}
