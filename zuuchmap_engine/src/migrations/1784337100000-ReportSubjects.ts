import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Moderation history that outlives what it is about.
 *
 * - `report.postId` was ON DELETE CASCADE: an owner deleting a reported post
 *   erased its open reports from the queue, and erased upheld ones from the
 *   track record `isProvenProvider` reads — restoring the edit shortcut an
 *   upheld report is meant to remove for good. Now SET NULL, with the owner
 *   (`ownerId`) and the title (`subject`) copied onto the report.
 * - `kind` + `reviewId`: a review can be reported too. `kind` (POST | REVIEW)
 *   still says which after the subject is gone.
 * - One OPEN report per reporter per subject, as a partial unique index — the
 *   service's read-then-insert let concurrent submissions through.
 * - `user.posts_rejected`: the rejection half of the same track record, kept
 *   as a counter so deleting the rejected post no longer clears it.
 */
export class ReportSubjects1784337100000 implements MigrationInterface {
  name = 'ReportSubjects1784337100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "report" a USING "report" b
       WHERE a.status = 'OPEN' AND b.status = 'OPEN'
         AND a."reporterId" = b."reporterId" AND a."postId" = b."postId"
         AND (a.date_created, a.id) > (b.date_created, b.id)`);

    await queryRunner.query(
      `ALTER TABLE "report" DROP CONSTRAINT "FK_report_post"`,
    );
    await queryRunner.query(
      `ALTER TABLE "report" ADD CONSTRAINT "FK_report_post" FOREIGN KEY ("postId") REFERENCES "post"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "report" ADD "kind" character varying NOT NULL DEFAULT 'POST', ADD "reviewId" integer, ADD "ownerId" uuid, ADD "subject" text`,
    );
    await queryRunner.query(
      `ALTER TABLE "report" ADD CONSTRAINT "FK_report_review" FOREIGN KEY ("reviewId") REFERENCES "review"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "report" ADD CONSTRAINT "FK_report_owner" FOREIGN KEY ("ownerId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(`
      UPDATE "report" r SET "ownerId" = p."userId", "subject" = p.title
        FROM "post" p WHERE p.id = r."postId"`);
    await queryRunner.query(
      `CREATE INDEX "IDX_report_review" ON "report" ("reviewId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_report_owner" ON "report" ("ownerId")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_report_open_post" ON "report" ("reporterId", "postId") WHERE status = 'OPEN' AND "postId" IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_report_open_review" ON "report" ("reporterId", "reviewId") WHERE status = 'OPEN' AND "reviewId" IS NOT NULL`,
    );

    await queryRunner.query(
      `ALTER TABLE "user" ADD "posts_rejected" integer NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(`
      UPDATE "user" u SET "posts_rejected" = c.n
        FROM (SELECT "userId", COUNT(*)::int AS n FROM "post"
               WHERE approval_status = 'REJECTED' GROUP BY 1) c
       WHERE c."userId" = u.id`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "posts_rejected"`);
    await queryRunner.query(`DROP INDEX "UQ_report_open_review"`);
    await queryRunner.query(`DROP INDEX "UQ_report_open_post"`);
    await queryRunner.query(`DROP INDEX "IDX_report_owner"`);
    await queryRunner.query(`DROP INDEX "IDX_report_review"`);
    await queryRunner.query(
      `DELETE FROM "report" WHERE "postId" IS NULL OR "kind" <> 'POST'`,
    );
    await queryRunner.query(
      `ALTER TABLE "report" DROP CONSTRAINT "FK_report_owner", DROP CONSTRAINT "FK_report_review"`,
    );
    await queryRunner.query(
      `ALTER TABLE "report" DROP COLUMN "subject", DROP COLUMN "ownerId", DROP COLUMN "reviewId", DROP COLUMN "kind"`,
    );
    await queryRunner.query(
      `ALTER TABLE "report" DROP CONSTRAINT "FK_report_post"`,
    );
    await queryRunner.query(
      `ALTER TABLE "report" ADD CONSTRAINT "FK_report_post" FOREIGN KEY ("postId") REFERENCES "post"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }
}
