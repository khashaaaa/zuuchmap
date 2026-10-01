import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Cap anonymous views per source address.
 *
 * `X-Visitor-Id` is chosen by the client, so rotating it minted a fresh view
 * per request. `ip_key` (a salted hash of the connecting address, anonymous
 * rows only) lets `countView` refuse a post's 31st new anonymous viewer from
 * one address within a day. The index serves exactly that count.
 */
export class ViewIpCap1784336600000 implements MigrationInterface {
  name = 'ViewIpCap1784336600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "viewedpost" ADD "ip_key" character varying(32)`,
    );
    await queryRunner.query(`
      CREATE INDEX "IDX_viewedpost_ip_key"
        ON "viewedpost" ("post_id", "ip_key", "date_viewed")
        WHERE "ip_key" IS NOT NULL`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_viewedpost_ip_key"`);
    await queryRunner.query(`ALTER TABLE "viewedpost" DROP COLUMN "ip_key"`);
  }
}
