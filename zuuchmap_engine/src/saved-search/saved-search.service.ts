import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { SavedSearch } from './entities/saved-search.entity';
import { CreateSavedSearchDto } from './dto/create-saved-search.dto';
import { PostNotificationService } from '../post/post-notification.service';
import { matchesSearchTerms, searchTerms } from '../utils/search-terms';

export const SAVED_SEARCH_LIMIT = 10;
/** A search fires at most once per window, however many posts land in it. */
export const NOTIFY_COOLDOWN_MS = 10 * 60_000;

/** The slice of a Post the matcher reads — kept narrow so tests need no entity. */
export interface MatchablePost {
  title?: string | null;
  // Read by the `q` check: browse searches title AND details, so a matcher
  // that only saw the title under-fired on every search made from a details hit.
  details?: string | null;
  category?: string | null;
  subcategory?: string | null;
  province?: string | null;
  district?: string | null;
  attributes?: Record<string, any> | null;
}

const isBlank = (v: unknown) => v === null || v === undefined || v === '';

/**
 * Pure matcher: does `post` satisfy every constraint `search` sets?
 * Unset constraints (null/empty) always pass. `attrs` keys follow the
 * `/posts` convention — `attr.<key>` is equality, `attr.<key>_min` /
 * `attr.<key>_max` are numeric bounds against `post.attributes[key]`.
 */
export function matchesSavedSearch(post: MatchablePost, search: Partial<SavedSearch>): boolean {
  for (const key of ['category', 'subcategory', 'province', 'district'] as const) {
    const want = search[key];
    if (!isBlank(want) && post[key] !== want) return false;
  }

  // Mirrors browse exactly — prefix-match every term against title + details,
  // via the shared tokeniser. It used to be a whole-phrase `includes` on the
  // title alone, so `кран түрээс` matched in browse and never notified.
  if (!isBlank(search.q)) {
    if (!matchesSearchTerms(searchTerms(search.q), post.title, post.details)) return false;
  }

  const attrs = search.attrs ?? {};
  const postAttrs = post.attributes ?? {};
  for (const [rawKey, want] of Object.entries(attrs)) {
    if (isBlank(want)) continue;
    const key = rawKey.startsWith('attr.') ? rawKey.slice(5) : rawKey;
    if (key.endsWith('_min') || key.endsWith('_max')) {
      const isMin = key.endsWith('_min');
      const base = key.slice(0, -4);
      const have = Number(postAttrs[base]);
      const bound = Number(want);
      if (Number.isNaN(have) || Number.isNaN(bound)) return false;
      if (isMin ? have < bound : have > bound) return false;
    } else {
      const have = postAttrs[key];
      if (isBlank(have)) return false;
      if (String(have) !== String(want)) return false;
    }
  }
  return true;
}

@Injectable()
export class SavedSearchService {
  private readonly logger = new Logger(SavedSearchService.name);

  constructor(
    @InjectRepository(SavedSearch)
    private readonly repo: Repository<SavedSearch>,
    private readonly notifications: PostNotificationService,
  ) {}

  list(userId: string): Promise<SavedSearch[]> {
    return this.repo.find({ where: { user_id: userId }, order: { created_at: 'DESC' } });
  }

  async create(userId: string, dto: CreateSavedSearchDto): Promise<SavedSearch> {
    const count = await this.repo.count({ where: { user_id: userId } });
    if (count >= SAVED_SEARCH_LIMIT) {
      throw new BadRequestException({ code: 'SAVED_SEARCH_LIMIT', message: `At most ${SAVED_SEARCH_LIMIT} saved searches` });
    }
    const entity = this.repo.create({
      user_id: userId,
      name: dto.name.trim(),
      category: dto.category || null,
      subcategory: dto.subcategory || null,
      province: dto.province || null,
      district: dto.district || null,
      q: dto.q?.trim() || null,
      attrs: dto.attrs ?? {},
    });
    return this.repo.save(entity);
  }

  async remove(userId: string, id: string): Promise<{ success: true }> {
    const result = await this.repo.delete({ id, user_id: userId });
    if (!result.affected) throw new NotFoundException('Saved search not found');
    return { success: true };
  }

  /**
   * Called from the admin approve path. Fans a push out to every user whose
   * saved search the freshly approved post satisfies — except the owner, and
   * except searches that already fired within the cooldown. Never throws:
   * a notification hiccup must not fail the approval.
   */
  async notifyForApprovedPost(post: MatchablePost & { id: number; user?: { id?: string } | null }): Promise<void> {
    try {
      // Category is the one constraint nearly every search sets; narrowing on
      // it keeps the scan from walking the whole table on every approval.
      const candidates = await this.repo
        .createQueryBuilder('s')
        .where('s.category IS NULL OR s.category = :category', { category: post.category })
        .getMany();

      const ownerId = post.user?.id;
      const cutoff = Date.now() - NOTIFY_COOLDOWN_MS;
      const hits = candidates.filter((s) =>
        s.user_id !== ownerId
        && (!s.last_notified_at || new Date(s.last_notified_at).getTime() < cutoff)
        && matchesSavedSearch(post, s),
      );
      if (!hits.length) return;

      const userIds = [...new Set(hits.map((s) => s.user_id))];
      await this.notifications.notifyUsers(
        userIds,
        'Таны хайлтад шинэ зар',
        `"${post.title ?? ''}" таны хадгалсан хайлтад тохирч байна.`,
        { type: 'saved_search', postId: post.id, category: post.category },
      );
      await this.repo.update({ id: In(hits.map((s) => s.id)) }, { last_notified_at: new Date() });
    } catch (err) {
      this.logger.warn(`notifyForApprovedPost failed (non-fatal): ${err?.message}`);
    }
  }
}
