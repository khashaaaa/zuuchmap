import { MigrationInterface, QueryRunner } from 'typeorm';

// Catches the DB up with entity changes that predate this migration setup:
// post.expires_at (post-expiry feature), the post.subcategory and user.email
// indexes, and the post→user FK delete behavior (entity says SET NULL).
export class SchemaDriftSync1784332900000 implements MigrationInterface {
  name = 'SchemaDriftSync1784332900000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "post" ADD COLUMN IF NOT EXISTS "expires_at" TIMESTAMP`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_post_subcategory" ON "post" ("subcategory")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_user_email" ON "user" ("email")`);
    await queryRunner.query(`ALTER TABLE "post" DROP CONSTRAINT IF EXISTS "FK_5c1cf55c308037b5aca1038a131"`);
    await queryRunner.query(`ALTER TABLE "post" ADD CONSTRAINT "FK_5c1cf55c308037b5aca1038a131" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "post" DROP CONSTRAINT IF EXISTS "FK_5c1cf55c308037b5aca1038a131"`);
    await queryRunner.query(`ALTER TABLE "post" ADD CONSTRAINT "FK_5c1cf55c308037b5aca1038a131" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_user_email"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_post_subcategory"`);
    await queryRunner.query(`ALTER TABLE "post" DROP COLUMN IF EXISTS "expires_at"`);
  }
}
