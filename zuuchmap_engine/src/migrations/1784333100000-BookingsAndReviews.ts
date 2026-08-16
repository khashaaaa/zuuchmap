import { MigrationInterface, QueryRunner } from 'typeorm';

export class BookingsAndReviews1784333100000 implements MigrationInterface {
  name = 'BookingsAndReviews1784333100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "booking" (
        "id" SERIAL NOT NULL,
        "start_date" TIMESTAMP NOT NULL,
        "end_date" TIMESTAMP NOT NULL,
        "message" text,
        "status" character varying NOT NULL DEFAULT 'PENDING',
        "response_message" text,
        "date_created" TIMESTAMP NOT NULL DEFAULT now(),
        "date_updated" TIMESTAMP NOT NULL DEFAULT now(),
        "postId" integer,
        "customerId" uuid,
        "providerId" uuid,
        CONSTRAINT "PK_booking_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_booking_post" FOREIGN KEY ("postId") REFERENCES "post"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_booking_customer" FOREIGN KEY ("customerId") REFERENCES "user"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_booking_provider" FOREIGN KEY ("providerId") REFERENCES "user"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_booking_status" ON "booking" ("status")`);
    await queryRunner.query(`CREATE INDEX "IDX_booking_post" ON "booking" ("postId")`);
    await queryRunner.query(`CREATE INDEX "IDX_booking_customer" ON "booking" ("customerId")`);
    await queryRunner.query(`CREATE INDEX "IDX_booking_provider" ON "booking" ("providerId")`);

    await queryRunner.query(`
      CREATE TABLE "review" (
        "id" SERIAL NOT NULL,
        "rating" integer NOT NULL,
        "comment" text,
        "date_created" TIMESTAMP NOT NULL DEFAULT now(),
        "date_updated" TIMESTAMP NOT NULL DEFAULT now(),
        "providerId" uuid,
        "authorId" uuid,
        CONSTRAINT "PK_review_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_review_provider_author" UNIQUE ("providerId", "authorId"),
        CONSTRAINT "FK_review_provider" FOREIGN KEY ("providerId") REFERENCES "user"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_review_author" FOREIGN KEY ("authorId") REFERENCES "user"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_review_provider" ON "review" ("providerId")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "review"`);
    await queryRunner.query(`DROP TABLE "booking"`);
  }
}
