import { MigrationInterface, QueryRunner } from 'typeorm';

// Operating hours existed in three shapes: the post.operating_hours column (web form),
// the operating_hours attribute (factory/sos schema fields), and the opening_hours
// attribute (materialstore). Unify all of them into attributes.operating_hours and
// drop the redundant column.
export class UnifyOperatingHours1784333000000 implements MigrationInterface {
  name = 'UnifyOperatingHours1784333000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Column value → attribute (only where the attribute isn't already set)
    await queryRunner.query(`
      UPDATE "post"
      SET "attributes" = jsonb_set(coalesce("attributes", '{}'::jsonb), '{operating_hours}', to_jsonb("operating_hours"))
      WHERE "operating_hours" IS NOT NULL AND "operating_hours" != ''
        AND coalesce("attributes"->>'operating_hours', '') = ''
    `);
    // opening_hours attribute → operating_hours (keep existing operating_hours if both set)
    await queryRunner.query(`
      UPDATE "post"
      SET "attributes" = ("attributes" - 'opening_hours')
        || CASE WHEN coalesce("attributes"->>'operating_hours', '') = ''
                THEN jsonb_build_object('operating_hours', "attributes"->'opening_hours')
                ELSE '{}'::jsonb END
      WHERE "attributes" ? 'opening_hours'
    `);
    await queryRunner.query(
      `ALTER TABLE "post" DROP COLUMN IF EXISTS "operating_hours"`,
    );
    // Rename the field key in the materialstore schema definition
    await queryRunner.query(`
      UPDATE "category_schema" SET "fields" = (
        SELECT jsonb_agg(CASE WHEN f->>'key' = 'opening_hours' THEN jsonb_set(f, '{key}', '"operating_hours"') ELSE f END)
        FROM jsonb_array_elements("fields") f
      )
      WHERE "fields" @> '[{"key": "opening_hours"}]'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "post" ADD COLUMN IF NOT EXISTS "operating_hours" character varying`,
    );
    await queryRunner.query(`
      UPDATE "post" SET "operating_hours" = "attributes"->>'operating_hours'
      WHERE "attributes" ? 'operating_hours'
    `);
  }
}
