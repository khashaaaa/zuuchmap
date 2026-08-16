import { MigrationInterface, QueryRunner } from 'typeorm';

export class CategoryScaling1784332800000 implements MigrationInterface {
  name = 'CategoryScaling1784332800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── category_schema: behavior flags + localized labels ──
    await queryRunner.query(`ALTER TABLE "category_schema" ADD "labels" jsonb DEFAULT '{}'`);
    await queryRunner.query(`ALTER TABLE "category_schema" ADD "has_rental_status" boolean NOT NULL DEFAULT false`);
    await queryRunner.query(`ALTER TABLE "category_schema" ADD "has_availability_dates" boolean NOT NULL DEFAULT false`);
    await queryRunner.query(`ALTER TABLE "category_schema" ADD "has_price" boolean NOT NULL DEFAULT false`);
    await queryRunner.query(`ALTER TABLE "category_schema" ADD "default_price_unit" character varying`);

    // Existing single labels are Mongolian
    await queryRunner.query(`UPDATE "category_schema" SET "labels" = jsonb_build_object('mn', "label") WHERE "labels" IS NULL OR "labels" = '{}'::jsonb`);

    // Flags for the seeded categories (previously hardcoded in the mobile client)
    await queryRunner.query(`UPDATE "category_schema" SET "has_rental_status" = true, "has_availability_dates" = true, "has_price" = true, "default_price_unit" = 'DAY' WHERE "key" IN ('vehiclerent','toolrent','machineryrent')`);
    await queryRunner.query(`UPDATE "category_schema" SET "has_rental_status" = true, "has_availability_dates" = true, "has_price" = true, "default_price_unit" = 'PROJECT' WHERE "key" = 'construction'`);
    await queryRunner.query(`UPDATE "category_schema" SET "has_rental_status" = true, "has_price" = true WHERE "key" = 'sos'`);

    // ── post: consolidate the three category columns into category + subcategory ──
    await queryRunner.query(`UPDATE "post" SET "category" = "firstcategory" WHERE ("category" IS NULL OR "category" = '') AND "firstcategory" IS NOT NULL`);
    await queryRunner.query(`ALTER TABLE "post" RENAME COLUMN "secondcategory" TO "subcategory"`);
    await queryRunner.query(`ALTER TABLE "post" DROP COLUMN "firstcategory"`);

    // ── post: full-text search over title + details ──
    // TypeORM's schema inspector requires its metadata table once a generated column exists
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS "typeorm_metadata" ("type" character varying NOT NULL, "database" character varying, "schema" character varying, "table" character varying, "name" character varying, "value" text)`);
    await queryRunner.query(`ALTER TABLE "post" ADD "search_vector" tsvector GENERATED ALWAYS AS (to_tsvector('simple', coalesce("title", '') || ' ' || coalesce("details", ''))) STORED`);
    await queryRunner.query(`CREATE INDEX "IDX_post_search_vector" ON "post" USING GIN ("search_vector")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_post_search_vector"`);
    await queryRunner.query(`ALTER TABLE "post" DROP COLUMN "search_vector"`);
    await queryRunner.query(`ALTER TABLE "post" ADD "firstcategory" character varying`);
    await queryRunner.query(`ALTER TABLE "post" RENAME COLUMN "subcategory" TO "secondcategory"`);
    await queryRunner.query(`ALTER TABLE "category_schema" DROP COLUMN "default_price_unit"`);
    await queryRunner.query(`ALTER TABLE "category_schema" DROP COLUMN "has_price"`);
    await queryRunner.query(`ALTER TABLE "category_schema" DROP COLUMN "has_availability_dates"`);
    await queryRunner.query(`ALTER TABLE "category_schema" DROP COLUMN "has_rental_status"`);
    await queryRunner.query(`ALTER TABLE "category_schema" DROP COLUMN "labels"`);
  }
}
