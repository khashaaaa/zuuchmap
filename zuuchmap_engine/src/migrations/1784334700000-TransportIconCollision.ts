import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Gives `transport` its own icon.
 *
 * `CategoryExpansion` seeded it as `cube-outline`, which `materialstore`
 * already used — two categories rendering the identical glyph in every list,
 * map marker and badge, so the icon stopped distinguishing them at a glance.
 * `bus-outline` is the only change; `materialstore` keeps `cube-outline`,
 * which fits a materials shop better than it fits haulage.
 *
 * Guarded on the colliding value, so an icon an admin has since chosen is
 * left alone.
 */
export class TransportIconCollision1784334700000 implements MigrationInterface {
  name = 'TransportIconCollision1784334700000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "category_schema" SET "icon" = $1 WHERE "key" = $2 AND "icon" = $3`,
      ['bus-outline', 'transport', 'cube-outline'],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "category_schema" SET "icon" = $1 WHERE "key" = $2 AND "icon" = $3`,
      ['cube-outline', 'transport', 'bus-outline'],
    );
  }
}
