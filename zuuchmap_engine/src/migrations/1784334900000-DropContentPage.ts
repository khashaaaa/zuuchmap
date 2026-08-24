import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Drops `content_page`.
 *
 * Created by InitialSchema and never used since: no entity, no service, no
 * route, and no reference anywhere outside the migration that made it. Policy
 * and help text are served by the clients (`PolicyPage`, `HelpPage` and their
 * app equivalents), not from the database, so the table has held zero rows for
 * its whole life.
 *
 * `down` recreates it exactly as InitialSchema did, so rolling back past this
 * point still lands on a schema that migration recognises.
 */
export class DropContentPage1784334900000 implements MigrationInterface {
  name = 'DropContentPage1784334900000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "content_page"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "content_page" (
         "id" SERIAL NOT NULL,
         "type" character varying NOT NULL,
         "content" json NOT NULL,
         "created_at" TIMESTAMP NOT NULL DEFAULT now(),
         "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
         CONSTRAINT "PK_ccd32b01633fadce3530aba203e" PRIMARY KEY ("id"))`,
    );
  }
}
