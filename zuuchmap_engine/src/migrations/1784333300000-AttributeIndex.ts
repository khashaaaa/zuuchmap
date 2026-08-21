import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Indexes the post attribute bag.
 *
 * `jsonb_path_ops` serves containment (`@>`) queries, which is what enumerated
 * `select` fields now use. Free-text attribute filters remain substring scans —
 * they would need pg_trgm, which is only worth adding if they become hot.
 *
 * Also indexes province, which every browse filter and the public stats
 * endpoint group by.
 */
export class AttributeIndex1784333300000 implements MigrationInterface {
  name = 'AttributeIndex1784333300000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_post_attributes_gin" ON "post" USING GIN ("attributes" jsonb_path_ops)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_post_province" ON "post" ("province")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_post_province"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_post_attributes_gin"`);
  }
}
