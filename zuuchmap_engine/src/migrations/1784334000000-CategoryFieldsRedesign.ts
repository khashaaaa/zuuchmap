import { MigrationInterface, QueryRunner } from 'typeorm';
import { CATEGORY_SEED } from '../post/category.service';

/**
 * Replaces every category's field definitions with the redesigned schema and
 * prunes post attributes that no longer belong to any field.
 *
 * `seedCategories()` early-returns on a non-empty table and therefore cannot
 * upgrade a live database — hence this migration writes the same definitions.
 *
 * ⚠ IRREVERSIBLE: down() cannot restore attribute VALUES pruned in step 3.
 * Restore from the pre-migration database backup instead.
 */
export class CategoryFieldsRedesign1784334000000 implements MigrationInterface {
  name = 'CategoryFieldsRedesign1784334000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const cat of CATEGORY_SEED) {
      await queryRunner.query(
        `UPDATE "category_schema"
            SET "fields" = $1::jsonb,
                "subcategories" = $2::jsonb,
                "default_price_unit" = $3
          WHERE "key" = $4`,
        [
          JSON.stringify(cat.fields ?? []),
          JSON.stringify(cat.subcategories ?? []),
          cat.default_price_unit ?? null,
          cat.key,
        ],
      );
    }

    // materialstore's subcategory used to be the seller type; it becomes a field.
    await queryRunner.query(
      `UPDATE "post"
          SET "attributes" = COALESCE("attributes", '{}'::jsonb) ||
                jsonb_build_object('sale_type',
                  CASE "subcategory" WHEN 'wholesale' THEN 'WHOLESALE' ELSE 'RETAIL' END),
              "subcategory" = 'other'
        WHERE "category" = 'materialstore'
          AND "subcategory" IN ('individual', 'wholesale', 'retail')`,
    );

    // Coerce values whose TYPE changed under the redesign. Pruning unknown keys
    // is not enough: `factory.capacity` was text ("120м³/цаг") and is now a
    // number, and a string sitting in a number field is silently excluded by
    // the range filter's numeric regex guard — the post simply never matches.
    // Salvage a leading number where one exists, drop the value where it does not.
    for (const cat of CATEGORY_SEED) {
      for (const f of (cat.fields ?? []) as any[]) {
        if (f.type === 'number') {
          await queryRunner.query(
            `UPDATE "post"
                SET "attributes" = CASE
                      WHEN substring(replace("attributes"->>$2, ',', '') from '^[0-9]+(?:\.[0-9]+)?') IS NOT NULL
                        THEN jsonb_set("attributes", ARRAY[$2],
                             to_jsonb((substring(replace("attributes"->>$2, ',', '') from '^[0-9]+(?:\.[0-9]+)?'))::numeric))
                      ELSE "attributes" - $2
                    END
              WHERE "category" = $1
                AND jsonb_typeof("attributes"->$2) = 'string'`,
            [cat.key, f.key],
          );
        } else if (f.type === 'boolean') {
          await queryRunner.query(
            `UPDATE "post"
                SET "attributes" = CASE
                      WHEN lower("attributes"->>$2) IN ('true','yes','1')  THEN jsonb_set("attributes", ARRAY[$2], 'true'::jsonb)
                      WHEN lower("attributes"->>$2) IN ('false','no','0')  THEN jsonb_set("attributes", ARRAY[$2], 'false'::jsonb)
                      ELSE "attributes" - $2
                    END
              WHERE "category" = $1
                AND jsonb_typeof("attributes"->$2) <> 'boolean'
                AND "attributes" ? $2`,
            [cat.key, f.key],
          );
        } else if (f.type === 'select') {
          // Map the old free-text operating hours onto the new enum before the
          // generic drop, so real signal survives the redesign.
          if (f.key === 'operating_hours') {
            await queryRunner.query(
              `UPDATE "post"
                  SET "attributes" = jsonb_set("attributes", ARRAY['operating_hours'], to_jsonb(
                        CASE
                          WHEN "attributes"->>'operating_hours' ~* '24'          THEN 'H24'
                          WHEN "attributes"->>'operating_hours' ~* 'дуудлага'    THEN 'BY_CALL'
                          ELSE 'WEEKDAY_DAY'
                        END))
                WHERE "category" = $1
                  AND "attributes" ? 'operating_hours'
                  AND NOT ("attributes"->>'operating_hours' = ANY($2))`,
              [cat.key, f.options ?? []],
            );
          }
          // Anything still outside the option list cannot be rendered or filtered.
          await queryRunner.query(
            `UPDATE "post"
                SET "attributes" = "attributes" - $2
              WHERE "category" = $1
                AND "attributes" ? $2
                AND NOT ("attributes"->>$2 = ANY($3))`,
            [cat.key, f.key, f.options ?? []],
          );
        } else if (f.type === 'multiselect') {
          await queryRunner.query(
            `UPDATE "post"
                SET "attributes" = jsonb_set("attributes", ARRAY[$2], jsonb_build_array("attributes"->$2))
              WHERE "category" = $1
                AND "attributes" ? $2
                AND jsonb_typeof("attributes"->$2) <> 'array'`,
            [cat.key, f.key],
          );
        }
      }
    }

    // Drop attribute keys the category no longer defines.
    for (const cat of CATEGORY_SEED) {
      const keys = (cat.fields ?? []).map((f: any) => f.key);
      await queryRunner.query(
        `UPDATE "post"
            SET "attributes" = COALESCE((
                  SELECT jsonb_object_agg(kv.k, kv.v)
                    FROM jsonb_each("attributes") AS kv(k, v)
                   WHERE kv.k = ANY($1)
                ), '{}'::jsonb)
          WHERE "category" = $2
            AND "attributes" IS NOT NULL
            AND "attributes" <> '{}'::jsonb`,
        [keys, cat.key],
      );
    }
  }

  public async down(): Promise<void> {
    throw new Error(
      'CategoryFieldsRedesign is not reversible: post attributes were pruned. ' +
        'Restore from the pre-migration database backup instead.',
    );
  }
}
