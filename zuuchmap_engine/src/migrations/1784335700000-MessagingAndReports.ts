import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `conversation` + `message` — in-app messaging — and `report` — user-filed
 * moderation flags.
 *
 * Both close the same kind of hole: everything that happened after a listing
 * went live happened somewhere the platform could not see. Negotiation moved
 * to a phone call, and a listing that turned bad stayed up until an admin
 * happened to look at it.
 *
 * Unread counts live on `conversation` rather than being counted from
 * `message`: the inbox badge is read on nearly every screen, and counting for
 * it would mean a query per thread on every one of them.
 *
 * The composite indexes are the inbox query exactly — participant plus
 * `last_message_at DESC` — so the list never sorts a heap.
 */
export class MessagingAndReports1784335700000 implements MigrationInterface {
  name = 'MessagingAndReports1784335700000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "conversation" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "last_message_at" TIMESTAMP,
        "last_message_preview" character varying(200),
        "customer_unread" integer NOT NULL DEFAULT 0,
        "provider_unread" integer NOT NULL DEFAULT 0,
        "date_created" TIMESTAMP NOT NULL DEFAULT now(),
        "date_updated" TIMESTAMP NOT NULL DEFAULT now(),
        "postId" integer,
        "customerId" uuid,
        "providerId" uuid,
        CONSTRAINT "PK_conversation_id" PRIMARY KEY ("id")
      )`);

    await queryRunner.query(`
      CREATE TABLE "message" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "body" text NOT NULL,
        "read_at" TIMESTAMP,
        "date_created" TIMESTAMP NOT NULL DEFAULT now(),
        "conversationId" uuid,
        "senderId" uuid,
        CONSTRAINT "PK_message_id" PRIMARY KEY ("id")
      )`);

    await queryRunner.query(`
      CREATE TABLE "report" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "reason" character varying NOT NULL,
        "detail" text,
        "status" character varying NOT NULL DEFAULT 'OPEN',
        "resolution" text,
        "resolved_at" TIMESTAMP,
        "date_created" TIMESTAMP NOT NULL DEFAULT now(),
        "date_updated" TIMESTAMP NOT NULL DEFAULT now(),
        "reporterId" uuid,
        "postId" integer,
        CONSTRAINT "PK_report_id" PRIMARY KEY ("id")
      )`);

    // A thread outlives its listing (SET NULL) but not its participants
    // (CASCADE) — a deleted account has no side of the conversation left to
    // read, while an expired listing's history is still worth keeping.
    await queryRunner.query(
      `ALTER TABLE "conversation" ADD CONSTRAINT "FK_conversation_post" FOREIGN KEY ("postId") REFERENCES "post"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "conversation" ADD CONSTRAINT "FK_conversation_customer" FOREIGN KEY ("customerId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "conversation" ADD CONSTRAINT "FK_conversation_provider" FOREIGN KEY ("providerId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "message" ADD CONSTRAINT "FK_message_conversation" FOREIGN KEY ("conversationId") REFERENCES "conversation"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "message" ADD CONSTRAINT "FK_message_sender" FOREIGN KEY ("senderId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "report" ADD CONSTRAINT "FK_report_reporter" FOREIGN KEY ("reporterId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "report" ADD CONSTRAINT "FK_report_post" FOREIGN KEY ("postId") REFERENCES "post"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );

    await queryRunner.query(
      `CREATE INDEX "IDX_conversation_post" ON "conversation" ("postId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_conversation_last_message_at" ON "conversation" ("last_message_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_conversation_customer_recent" ON "conversation" ("customerId", "last_message_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_conversation_provider_recent" ON "conversation" ("providerId", "last_message_at")`,
    );
    // One thread per (listing, customer). The "message provider" button is a
    // tap that can double-fire; a unique index makes the duplicate impossible
    // rather than merely unlikely.
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_conversation_post_customer" ON "conversation" ("postId", "customerId") WHERE "postId" IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_message_thread_order" ON "message" ("conversationId", "date_created")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_message_sender" ON "message" ("senderId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_report_status" ON "report" ("status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_report_post" ON "report" ("postId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_report_reporter" ON "report" ("reporterId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "report"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "message"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "conversation"`);
  }
}
