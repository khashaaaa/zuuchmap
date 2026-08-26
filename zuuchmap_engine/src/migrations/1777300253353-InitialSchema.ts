import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1777300253353 implements MigrationInterface {
  name = 'InitialSchema1777300253353';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "company" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying NOT NULL, "description" character varying, "logo" character varying, "website" character varying, "address" character varying, "phone_number" character varying, "email" character varying, "registration_number" character varying, "tax_id" character varying, "is_verified" boolean DEFAULT false, "date_created" TIMESTAMP NOT NULL DEFAULT now(), "date_updated" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_056f7854a7afdba7cbd6d45fc20" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "post" ("id" SERIAL NOT NULL, "category" character varying NOT NULL, "firstcategory" character varying, "secondcategory" character varying, "title" character varying, "details" text, "province" character varying, "district" character varying, "address" character varying, "latitude" double precision, "longitude" double precision, "location" character varying, "price_amount" numeric(15,2), "price_unit" character varying, "contact_phone" character varying, "contact_email" character varying, "available_from" TIMESTAMP, "available_until" TIMESTAMP, "website" character varying, "operating_hours" character varying, "images" jsonb DEFAULT '[]', "attributes" jsonb DEFAULT '{}', "views" integer NOT NULL DEFAULT '0', "status" character varying DEFAULT 'ACTIVE', "approval_status" character varying DEFAULT 'PENDING', "rejection_reason" text, "date_created" TIMESTAMP NOT NULL DEFAULT now(), "date_updated" TIMESTAMP NOT NULL DEFAULT now(), "userId" uuid, CONSTRAINT "PK_be5fda3aac270b134ff9c21cdee" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_5c1cf55c308037b5aca1038a13" ON "post" ("userId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_26d2e0626ce5d69b57f4519cec" ON "post" ("approval_status", "date_created") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_1b0a1d44a85730539d7678effd" ON "post" ("category", "approval_status") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_6458284fd3105a3705e94e8ee6" ON "post" ("approval_status") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_f5b12b405e3ba99533c1dfdbd4" ON "post" ("status") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_60fc2bf4245759a0671aee7730" ON "post" ("category") `,
    );
    await queryRunner.query(
      `CREATE TABLE "likedpost" ("id" SERIAL NOT NULL, "user_id" uuid NOT NULL, "post_type" character varying NOT NULL, "post_id" integer NOT NULL, "date_liked" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_42cf8bb5ee0f84939ddc907e084" UNIQUE ("user_id", "post_type", "post_id"), CONSTRAINT "PK_2394a4a00e1cb61f8cc8a71d09b" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_fdbc47cf9c4b5e30d42acd58ec" ON "likedpost" ("post_type", "post_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_5f3364127ef157faa3f8a768fc" ON "likedpost" ("user_id") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."user_type_enum" AS ENUM('PROVIDER', 'CUSTOMER')`,
    );
    await queryRunner.query(
      `CREATE TABLE "user" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "type" "public"."user_type_enum", "phone_number" character varying, "parent_name" character varying, "given_name" character varying, "email" character varying, "address" character varying, "biometric" character varying, "device_info" jsonb, "is_verified" boolean, "profile_picture" character varying, "push_token" character varying, "date_created" TIMESTAMP NOT NULL DEFAULT now(), "date_updated" TIMESTAMP NOT NULL DEFAULT now(), "companyId" uuid, CONSTRAINT "PK_cace4a159ff9f2512dd42373760" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_01eea41349b6c9275aec646eee" ON "user" ("phone_number") `,
    );
    await queryRunner.query(
      `CREATE TABLE "viewedpost" ("id" SERIAL NOT NULL, "user_id" uuid NOT NULL, "post_type" character varying NOT NULL, "post_id" integer NOT NULL, "date_viewed" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_3eb7f0bf0f4f11cf711d436f677" UNIQUE ("user_id", "post_type", "post_id"), CONSTRAINT "PK_d4200c26582d3a7e93b27a87c46" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_827b61edddbb7613d8423ba15c" ON "viewedpost" ("post_type", "post_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_507024c6b41c5c1a1945120c0a" ON "viewedpost" ("user_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "category_schema" ("id" SERIAL NOT NULL, "key" character varying NOT NULL, "label" character varying NOT NULL, "icon" character varying, "color" character varying, "subcategories" jsonb DEFAULT '[]', "fields" jsonb DEFAULT '[]', "active" boolean NOT NULL DEFAULT true, "sort_order" integer NOT NULL DEFAULT '0', "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_f621b5e1ed069b918f76a7b2c42" UNIQUE ("key"), CONSTRAINT "PK_963626e7f0ed0808ed603242269" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "content_page" ("id" SERIAL NOT NULL, "type" character varying NOT NULL, "content" json NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_ccd32b01633fadce3530aba203e" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "post" ADD CONSTRAINT "FK_5c1cf55c308037b5aca1038a131" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "likedpost" ADD CONSTRAINT "FK_5f3364127ef157faa3f8a768fcc" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "user" ADD CONSTRAINT "FK_86586021a26d1180b0968f98502" FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "viewedpost" ADD CONSTRAINT "FK_507024c6b41c5c1a1945120c0a0" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "viewedpost" DROP CONSTRAINT "FK_507024c6b41c5c1a1945120c0a0"`,
    );
    await queryRunner.query(
      `ALTER TABLE "user" DROP CONSTRAINT "FK_86586021a26d1180b0968f98502"`,
    );
    await queryRunner.query(
      `ALTER TABLE "likedpost" DROP CONSTRAINT "FK_5f3364127ef157faa3f8a768fcc"`,
    );
    await queryRunner.query(
      `ALTER TABLE "post" DROP CONSTRAINT "FK_5c1cf55c308037b5aca1038a131"`,
    );
    await queryRunner.query(`DROP TABLE "content_page"`);
    await queryRunner.query(`DROP TABLE "category_schema"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_507024c6b41c5c1a1945120c0a"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_827b61edddbb7613d8423ba15c"`,
    );
    await queryRunner.query(`DROP TABLE "viewedpost"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_01eea41349b6c9275aec646eee"`,
    );
    await queryRunner.query(`DROP TABLE "user"`);
    await queryRunner.query(`DROP TYPE "public"."user_type_enum"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_5f3364127ef157faa3f8a768fc"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_fdbc47cf9c4b5e30d42acd58ec"`,
    );
    await queryRunner.query(`DROP TABLE "likedpost"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_60fc2bf4245759a0671aee7730"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_f5b12b405e3ba99533c1dfdbd4"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_6458284fd3105a3705e94e8ee6"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_1b0a1d44a85730539d7678effd"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_26d2e0626ce5d69b57f4519cec"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_5c1cf55c308037b5aca1038a13"`,
    );
    await queryRunner.query(`DROP TABLE "post"`);
    await queryRunner.query(`DROP TABLE "company"`);
  }
}
