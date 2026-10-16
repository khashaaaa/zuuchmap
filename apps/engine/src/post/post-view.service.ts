import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { env } from '../config/env';

export interface Viewer {
  userId: string | null;
  visitorKey: string | null;
  /** Hashed address; caps anonymous viewers per source. */
  ipKey: string | null;
  /** False for an admin: moderation is not audience. */
  audience: boolean;
}

@Injectable()
export class PostViewService {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  /**
   * One view per viewer per listing, ever, in one statement: a unique index per identity does
   * the dedupe (ON CONFLICT DO NOTHING), and the counter moves only for a row actually written
   * with counted = true. Owner and admin rows are recorded uncounted so the same device signed
   * out stays uncounted. Only live listings count; a non-live one has no audience yet.
   */
  async countView(viewer: Viewer, postId: number): Promise<{ counted: boolean }> {
    const userId = viewer.userId;
    const visitorKey = viewer.visitorKey;
    const ipKey = userId ? null : viewer.ipKey;
    // Neither identifies the viewer, so a view could not be deduped.
    if (!userId && !visitorKey) return { counted: false };

    const rows = await this.ds.query<unknown[]>(
      `WITH target AS (
         SELECT p.id,
                (p.approval_status = 'APPROVED' AND p.is_draft = false AND p.status <> 'EXPIRED'
                  AND (p.expires_at IS NULL OR p.expires_at > NOW())) AS live,
                ($5::boolean AND ($2::uuid IS NULL OR p.user_id IS DISTINCT FROM $2::uuid)) AS audience
           FROM posts p
          WHERE p.id = $1 AND p.deleted_at IS NULL
       ), capped AS (
         SELECT ($4::varchar IS NOT NULL AND (
           SELECT COUNT(*) FROM post_views v
            WHERE v.post_id = $1 AND v.ip_key = $4::varchar AND v.date_viewed > NOW() - interval '1 day'
         ) >= $6) AS hit
       ), seen AS (
         INSERT INTO post_views (post_id, user_id, visitor_key, ip_key, counted)
         SELECT t.id, $2::uuid, $3::varchar, $4::varchar, (t.live AND t.audience)
           FROM target t, capped c
          WHERE (t.live OR NOT t.audience) AND NOT c.hit
         ON CONFLICT DO NOTHING
         RETURNING post_id, counted
       )
       UPDATE posts SET views = views + 1
        WHERE id IN (SELECT post_id FROM seen WHERE counted)
       RETURNING id`,
      [postId, userId, visitorKey, ipKey, viewer.audience, env().VIEW_ANON_PER_IP_PER_DAY],
    );
    // pg returns [rows, affected] for UPDATE ... RETURNING through TypeORM.
    const updated = Array.isArray(rows[0]) ? (rows[0] as unknown[]) : rows;
    return { counted: updated.length > 0 };
  }
}
