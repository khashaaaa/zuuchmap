import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * An old test seeder wrote underscore spellings (`DARKHAN_UUL`, `KHAN_UUL`)
 * that appear in no client code list. Posts carrying them rendered a raw code
 * instead of a localized name, could never be matched by the province/district
 * filter, and inflated the landing page's "provinces covered" counter — it
 * counted DISTINCT province, so one aimag spelled two ways read as two.
 *
 * Irreversible by design: the underscore spellings were never valid, so there
 * is nothing to restore them to.
 */
export class NormalizeLocationCodes1784334300000 implements MigrationInterface {
  name = 'NormalizeLocationCodes1784334300000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "post" SET province = CASE province
        WHEN 'DARKHAN_UUL'   THEN 'DARKHANUUL'
        WHEN 'UVUR_KHANGAI'  THEN 'UVURKHANGAI'
        WHEN 'UMNU_GOVI'     THEN 'UMNUGOVI'
        WHEN 'GOVI_ALTAI'    THEN 'GOVIALTAI'
        WHEN 'GOVI_SUMBER'   THEN 'GOVISUMBER'
        WHEN 'BAYAN_OLGII'   THEN 'BAYANOLGII'
        WHEN 'BAYAN_KHONGOR' THEN 'BAYANKHONGOR'
        ELSE province END
      WHERE province LIKE '%\\_%'
    `);
    await queryRunner.query(`
      UPDATE "post" SET district = 'KHANUUL' WHERE district = 'KHAN_UUL'
    `);
  }

  public async down(): Promise<void> {
    // No-op: the previous values were invalid codes, not a prior schema.
  }
}
