import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Realigns category colours that were written by a stale seeder.
 *
 * `CategoryColourFamily` (1784333400000) solved the eight original colours onto
 * one luminance, and `CategoryExpansion` (1784333600000) added five more at the
 * same luminance — but `CategoryService.CATEGORY_SEED` kept an older set of
 * hexes for ten of the thirteen. Because `seedCategories()` only runs on an
 * *empty* table, and both earlier migrations guard on the value they replace,
 * any database created fresh after those migrations (a rebuilt VPS, a new dev
 * machine, CI) was seeded with colours no migration could ever correct.
 *
 * Those values sat at unrelated luminances — `materialstore` made only 3.25:1
 * on the light ground, `usedequipment` 3.60:1 on the dark one — so the "one
 * stored hex reads at 4.0:1 on both grounds" guarantee the theme documents did
 * not hold there. The seeder now carries the same values as this migration.
 *
 * Guarded on the stale hex, so a colour an admin has since chosen is left alone.
 */
const SYNC: Array<[key: string, stale: string, correct: string]> = [
  ['materialstore', '#C2803F', '#848236'],
  ['construction', '#4C93B8', '#3D8995'],
  ['jobvacancy', '#B8674C', '#BC5CA9'],
  ['factory', '#7A8B99', '#3A8E5C'],
  ['sos', '#C25F5F', '#D25562'],
  ['usedequipment', '#8B7355', '#C16546'],
  ['transport', '#5F8C8C', '#4984B4'],
  ['designservice', '#9B7BA8', '#8473C3'],
  ['miningsupport', '#6E8B5F', '#967A54'],
  ['winterservice', '#5F7FA8', '#4C869E'],
];

export class CategorySeedColourSync1784334500000 implements MigrationInterface {
  name = 'CategorySeedColourSync1784334500000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const [key, stale, correct] of SYNC) {
      await queryRunner.query(
        `UPDATE "category_schema" SET "color" = $1 WHERE "key" = $2 AND "color" = $3`,
        [correct, key, stale],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const [key, stale, correct] of SYNC) {
      await queryRunner.query(
        `UPDATE "category_schema" SET "color" = $1 WHERE "key" = $2 AND "color" = $3`,
        [stale, key, correct],
      );
    }
  }
}
