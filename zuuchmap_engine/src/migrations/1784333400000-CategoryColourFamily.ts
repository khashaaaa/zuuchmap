import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Retunes the eight seeded category colours onto one family.
 *
 * The originals were raw Material Design 500 swatches, which sat at unrelated
 * hues *and* unrelated luminances against a muted amber/neutral theme — a mixed
 * category list read as confetti, and `machineryrent`'s `#FF9800` was close
 * enough to the amber primary to compete with it for attention.
 *
 * A category colour is stored once and rendered on both the dark (#1F2124) and
 * the light (#FFFFFF) ground, so the replacements are all solved to the single
 * luminance where contrast is equal on both — 4.0:1 either way, comfortably
 * past the 3:1 non-text bar. They are evenly spaced around the hue circle with
 * the amber window (30–50°) left free, so every one of them sits at ~2:1
 * against the primary and amber always reads as the brighter thing.
 *
 * Only rows still holding the original seed value are touched: a colour an
 * admin has since chosen is theirs, not ours, and is left alone.
 */
const FAMILY: Array<[key: string, before: string, after: string]> = [
  ['vehiclerent', '#4CAF50', '#558D39'],
  ['machineryrent', '#FF9800', '#6A7BC2'],
  ['toolrent', '#9C27B0', '#976CC3'],
  ['materialstore', '#795548', '#848236'],
  ['construction', '#2196F3', '#3D8995'],
  ['jobvacancy', '#E91E63', '#BC5CA9'],
  ['factory', '#607D8B', '#3A8E5C'],
  ['sos', '#F44336', '#D25562'],
];

export class CategoryColourFamily1784333400000 implements MigrationInterface {
  name = 'CategoryColourFamily1784333400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const [key, before, after] of FAMILY) {
      await queryRunner.query(
        `UPDATE "category_schema" SET "color" = $1 WHERE "key" = $2 AND "color" = $3`,
        [after, key, before],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const [key, before, after] of FAMILY) {
      await queryRunner.query(
        `UPDATE "category_schema" SET "color" = $1 WHERE "key" = $2 AND "color" = $3`,
        [before, key, after],
      );
    }
  }
}
