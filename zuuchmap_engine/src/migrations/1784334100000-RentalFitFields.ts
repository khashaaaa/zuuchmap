import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Rental-market segmentation fields, mirroring how machinery hire actually
 * trades (dealer research): dry vs maintained rental and end-of-term purchase.
 *
 *  - machineryrent += maintenance_included, rent_to_buy
 *  - vehiclerent   += rent_to_buy
 *
 * Detail fields, not browse filters — the ≤4-filters-per-category budget
 * (category.service.spec.ts) is already spent on these categories.
 * Appends are guarded by key so an admin who already added one of these via
 * the category editor is not duplicated. Seed definitions in
 * category.service.ts carry the same fields for fresh databases.
 */

const MAINTENANCE_INCLUDED = {
  key: 'maintenance_included',
  label: 'Засвар үйлчилгээтэй',
  labels: {
    mn: 'Засвар үйлчилгээтэй',
    en: 'Maintenance included',
    zh: '含维护保养',
    ru: 'С техобслуживанием',
  },
  type: 'boolean',
  required: false,
  group: 'details',
};

const RENT_TO_BUY = {
  key: 'rent_to_buy',
  label: 'Түрээслээд худалдан авах боломжтой',
  labels: {
    mn: 'Түрээслээд худалдан авах боломжтой',
    en: 'Rent-to-buy option',
    zh: '可租转购',
    ru: 'С правом выкупа',
  },
  type: 'boolean',
  required: false,
  group: 'details',
};

const APPENDS: Array<{ category: string; field: Record<string, unknown> }> = [
  { category: 'machineryrent', field: MAINTENANCE_INCLUDED },
  { category: 'machineryrent', field: RENT_TO_BUY },
  { category: 'vehiclerent', field: RENT_TO_BUY },
];

export class RentalFitFields1784334100000 implements MigrationInterface {
  name = 'RentalFitFields1784334100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const { category, field } of APPENDS) {
      await queryRunner.query(
        `UPDATE "category_schema"
            SET "fields" = "fields" || jsonb_build_array($1::jsonb)
          WHERE "key" = $2
            AND NOT EXISTS (
              SELECT 1 FROM jsonb_array_elements("fields") f
               WHERE f->>'key' = $3
            )`,
        [JSON.stringify(field), category, field.key],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const { category, field } of APPENDS) {
      await queryRunner.query(
        `UPDATE "category_schema"
            SET "fields" = (
              SELECT COALESCE(jsonb_agg(f ORDER BY ord), '[]'::jsonb)
                FROM jsonb_array_elements("fields") WITH ORDINALITY AS t(f, ord)
               WHERE f->>'key' <> $2
            )
          WHERE "key" = $1`,
        [category, field.key],
      );
    }
  }
}
