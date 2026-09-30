import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Viewedpost } from './entities/viewedpost.entity';

/** Who is looking: a signed-in user, or an anonymous visitor key. Never both. */
export interface Viewer {
  userId?: string | null;
  visitorKey?: string | null;
}

@Injectable()
export class ViewedpostService {
  constructor(
    @InjectRepository(Viewedpost)
    private viewedPostRepository: Repository<Viewedpost>,
  ) {}

  /**
   * Count one view, deduped per viewer, never the owner's own.
   *
   * Signed-in views dedupe on the (user_id, post_type, post_id) unique
   * constraint; anonymous ones on a partial unique index over visitor_key —
   * `ON CONFLICT DO NOTHING` covers both, so a repeat view changes nothing.
   *
   * One statement. This was three round trips — read the post joined to its
   * owner, insert the view, bump the counter — on a request every listing
   * open fires. The owner check, the insert and the increment are all the
   * same decision about the same row, so they are one CTE: the counter moves
   * only for a row the insert actually wrote.
   */
  async countView(viewer: Viewer, post_id: number): Promise<void> {
    const user_id = viewer.userId ?? null;
    const visitor_key = user_id ? null : (viewer.visitorKey ?? null);

    // Neither identifies the viewer, so a view here could not be deduped at
    // all — counting it would let one reloading browser inflate the number.
    if (!user_id && !visitor_key) return;

    await this.viewedPostRepository.manager.query(
      `WITH target AS (
         SELECT p.id FROM "post" p
          WHERE p.id = $1
            AND ($2::uuid IS NULL OR p."userId" IS DISTINCT FROM $2::uuid)
       ), seen AS (
         INSERT INTO "viewedpost" (user_id, visitor_key, post_type, post_id)
         SELECT $2::uuid, $3::varchar, 'post', id FROM target
         ON CONFLICT DO NOTHING
         RETURNING post_id
       )
       UPDATE "post" SET views = COALESCE(views, 0) + 1
        WHERE id IN (SELECT post_id FROM seen)`,
      [post_id, user_id, visitor_key],
    );
  }
}
