import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Viewedpost } from './entities/viewedpost.entity';

/**
 * Who is looking. A signed-in viewer carries their account and, when the
 * client sent one, the visitor key of the device they are on — so the same
 * person is one viewer before and after signing in.
 */
export interface Viewer {
  userId?: string | null;
  visitorKey?: string | null;
  /** Hashed connecting address; caps anonymous viewers per source. */
  ipKey?: string | null;
  /** False for an admin: moderation is not audience. */
  audience?: boolean;
}

/**
 * Fresh anonymous viewers one address may add to one post per day. A client
 * picks its own `X-Visitor-Id`, so without this a loop rotating it mints a view
 * per request. Generous on purpose: Mongolian carriers put many real people
 * behind one CGNAT address.
 */
const ANON_VIEWS_PER_IP_PER_DAY = 30;

@Injectable()
export class ViewedpostService {
  constructor(
    @InjectRepository(Viewedpost)
    private viewedPostRepository: Repository<Viewedpost>,
  ) {}

  /**
   * Count one view, deduped per viewer, of a live post, by its audience.
   *
   * Signed-in views dedupe on the (user_id, post_type, post_id) unique
   * constraint, visitor keys on a partial unique index — `ON CONFLICT DO
   * NOTHING` covers both, and a signed-in row carries the device's key too, so
   * signing in on a device that already viewed the post is not a second view.
   *
   * The owner and admins are recorded but never counted: their row claims the
   * device's visitor key, so opening the post again signed out does not count
   * either. Only a live post (approved, not expired) counts — a pending one
   * opened from a direct link or the moderation queue has no audience yet.
   *
   * One statement: the counter moves only for a row the insert actually wrote.
   */
  async countView(
    viewer: Viewer,
    post_id: number,
  ): Promise<{ counted: boolean }> {
    const user_id = viewer.userId ?? null;
    const visitor_key = viewer.visitorKey ?? null;
    // Only anonymous rows are capped by address, so only they record one.
    const ip_key = user_id ? null : (viewer.ipKey ?? null);

    // Neither identifies the viewer, so a view here could not be deduped at
    // all — counting it would let one reloading browser inflate the number.
    if (!user_id && !visitor_key) return { counted: false };

    const rows: unknown[] = await this.viewedPostRepository.manager.query(
      `WITH target AS (
         SELECT p.id,
                p.approval_status = 'APPROVED'
                  AND p.status <> 'EXPIRED'
                  AND (p.expires_at IS NULL OR p.expires_at > NOW()) AS live,
                $5::boolean
                  AND ($2::uuid IS NULL OR p."userId" IS DISTINCT FROM $2::uuid) AS audience
           FROM "post" p
          WHERE p.id = $1
       ), capped AS (
         SELECT $4::varchar IS NOT NULL AND (
           SELECT COUNT(*) FROM "viewedpost" v
            WHERE v.post_id = $1 AND v.ip_key = $4::varchar
              AND v.date_viewed > NOW() - interval '1 day'
         ) >= $6 AS hit
       ), seen AS (
         INSERT INTO "viewedpost" (user_id, visitor_key, ip_key, post_type, post_id)
         SELECT $2::uuid, $3::varchar, $4::varchar, 'post', t.id
           FROM target t, capped c
          WHERE (t.live OR NOT t.audience) AND NOT c.hit
         ON CONFLICT DO NOTHING
         RETURNING post_id
       )
       UPDATE "post" SET views = COALESCE(views, 0) + 1
        WHERE id IN (SELECT post_id FROM seen)
          AND EXISTS (SELECT 1 FROM target WHERE live AND audience)
       RETURNING id`,
      [
        post_id,
        user_id,
        visitor_key,
        ip_key,
        viewer.audience ?? true,
        ANON_VIEWS_PER_IP_PER_DAY,
      ],
    );
    // TypeORM returns [rows, affected] for an UPDATE … RETURNING on Postgres.
    const updated = Array.isArray(rows[0]) ? (rows[0] as unknown[]) : rows;
    return { counted: updated.length > 0 };
  }
}
