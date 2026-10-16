import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { SAVED_SEARCH_LIMIT, type SavedSearch, type SavedSearchParams } from '@zuuchmap/core';
import type { RequestUser } from '../auth/request-user';
import { CategoryService } from '../category/category.service';
import type { CreateSavedSearchDto, SavedSearchParamsDto, UpdateSavedSearchDto } from './dto/post.dto';
import { PostService } from './post.service';
import { type CategoryLabel, categoryLabelIndex, expandTerms, matchesPost, type SearchablePost, searchTerms } from './search-terms';

/** Highest "N new" a list item reports; past it the number stops meaning anything. */
const NEW_COUNT_CAP = 99;
const ATTR_KEY = /^[a-z0-9_]{1,64}$/;
const MAX_ATTRS = 10;

interface Row {
  id: string;
  user_id: string;
  name: string;
  params: SavedSearchParams;
  notify: boolean;
  created_at: Date;
  last_seen_at: Date;
  last_notified_at: Date | null;
}

/** What a saved search is allowed to remember of a browse query; anything else is dropped. */
function normaliseParams(p: SavedSearchParamsDto): SavedSearchParams {
  const out: SavedSearchParams = {};
  const str = (k: 'q' | 'family' | 'category' | 'subcategory' | 'province' | 'district'): void => {
    const v = p[k]?.trim();
    if (v) out[k] = v;
  };
  str('q');
  str('family');
  str('category');
  str('subcategory');
  str('province');
  str('district');
  if (p.price_min !== undefined || p.price_max !== undefined) {
    if (p.price_min !== undefined) out.price_min = p.price_min;
    if (p.price_max !== undefined) out.price_max = p.price_max;
    if (p.price_unit) out.price_unit = p.price_unit;
  }
  const attrs: Record<string, string> = {};
  for (const [k, v] of Object.entries(p.attrs ?? {}).slice(0, MAX_ATTRS)) {
    const key = k.startsWith('attr.') ? k.slice(5) : k;
    if (ATTR_KEY.test(key) && typeof v === 'string' && v.length > 0 && v.length <= 100) attrs[key] = v;
  }
  if (Object.keys(attrs).length > 0) out.attrs = attrs;
  return out;
}

/** The listing slice the matcher reads, as the approve path has it. */
/** A saved search a new listing matches: whose it is, and its name for the alert. */
export interface SavedSearchMatch { id: string; user_id: string; name: string }

export type MatchableListing = SearchablePost & {
  user_id?: string | null;
  price_amount?: string | number | null;
  price_unit?: string | null;
  attributes?: Record<string, unknown> | null;
};

const isBlank = (v: unknown): boolean => v === null || v === undefined || v === '';
/** pg returns `[rows, affected]` for UPDATE … RETURNING through TypeORM. */
const updatedRow = (res: unknown): Row => {
  const rows = Array.isArray(res) && Array.isArray(res[0]) ? (res[0] as Row[]) : (res as Row[]);
  const row = rows.at(0);
  // Deleted between the ownership read and the write.
  if (!row) throw new NotFoundException({ message: 'Saved search not found', code: 'SAVED_SEARCH_NOT_FOUND' });
  return row;
};

/**
 * Pure matcher, the JS twin of `PostService.applyFilters` + `searchSql` (never relaxed): the
 * alerts (phase 7) fire for a freshly approved listing exactly when browse would list it.
 */
function matchesSavedSearch(post: MatchableListing, params: SavedSearchParams, labels: CategoryLabel[], familyKeys: Map<string, string[]>): boolean {
  for (const key of ['category', 'subcategory', 'province', 'district'] as const) {
    const want = params[key];
    if (!isBlank(want) && post[key] !== want) return false;
  }
  if (params.family && !(familyKeys.get(params.family) ?? []).includes(post.category ?? '')) return false;
  if (params.q) {
    const terms = searchTerms(params.q);
    if (terms.length && !matchesPost(expandTerms(terms, labels), post)) return false;
  }
  if (params.price_min !== undefined || params.price_max !== undefined) {
    if (post.price_unit !== params.price_unit || isBlank(post.price_amount)) return false;
    const amount = Number(post.price_amount);
    if (!Number.isFinite(amount)) return false;
    if (params.price_min !== undefined && amount < params.price_min) return false;
    if (params.price_max !== undefined && amount > params.price_max) return false;
  }
  const attrs = post.attributes ?? {};
  for (const [rawKey, want] of Object.entries(params.attrs ?? {})) {
    const m = /^([a-z0-9_]+?)(_min|_max)?$/.exec(rawKey);
    if (!m?.[1]) continue;
    const have: unknown = attrs[m[1]];
    if (m[2]) {
      // SQL ignores a non-numeric bound; so must this.
      const bound = Number(want);
      if (!Number.isFinite(bound)) continue;
      if (typeof have !== 'number') return false;
      if (m[2] === '_min' ? have < bound : have > bound) return false;
    } else if (Array.isArray(have)) {
      // SQL: `->>` text equality (the JSON text of the array) OR jsonb_exists membership.
      if (!have.map(String).includes(want) && JSON.stringify(have) !== want) return false;
    } else if (isBlank(have) || String(have) !== want) {
      return false;
    }
  }
  return true;
}

@Injectable()
export class SavedSearchService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly posts: PostService,
    private readonly categories: CategoryService,
  ) {}

  private async view(row: Row, newCount?: number): Promise<SavedSearch> {
    const count = newCount ?? Math.min(NEW_COUNT_CAP, await this.posts.countSince(row.params, row.last_seen_at));
    return {
      id: row.id,
      name: row.name,
      params: row.params,
      notify: row.notify,
      new_count: count,
      created_at: row.created_at.toISOString(),
      last_seen_at: row.last_seen_at.toISOString(),
      last_notified_at: row.last_notified_at?.toISOString() ?? null,
    };
  }

  /** Newest first, each with its "N new" since it was last opened. */
  async list(me: RequestUser): Promise<SavedSearch[]> {
    const rows = await this.ds.query<Row[]>('SELECT * FROM saved_searches WHERE user_id = $1 ORDER BY created_at DESC, id', [me.id]);
    return Promise.all(rows.map((r) => this.view(r)));
  }

  /** The limit is counted under the account's row lock, so two concurrent creates cannot both land as the tenth. */
  async create(me: RequestUser, dto: CreateSavedSearchDto): Promise<SavedSearch> {
    const rows = await this.ds.transaction(async (em) => {
      await em.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [me.id]);
      return em.query<Row[]>(
        `INSERT INTO saved_searches (user_id, name, params, notify)
         SELECT $1::uuid, $2, $3::jsonb, $4
          WHERE (SELECT COUNT(*) FROM saved_searches WHERE user_id = $1::uuid) < $5
         RETURNING *`,
        [me.id, dto.name.trim(), JSON.stringify(normaliseParams(dto.params)), dto.notify ?? true, SAVED_SEARCH_LIMIT],
      );
    });
    const row = rows.at(0);
    if (!row) throw new BadRequestException({ message: `At most ${String(SAVED_SEARCH_LIMIT)} saved searches`, code: 'SAVED_SEARCH_LIMIT' });
    return this.view(row, 0);
  }

  /** Only the fields sent change, in one statement: a rename and a toggle in flight together both land. */
  async update(me: RequestUser, id: string, dto: UpdateSavedSearchDto): Promise<SavedSearch> {
    const res: unknown = await this.ds.query(
      'UPDATE saved_searches SET name = COALESCE($3, name), notify = COALESCE($4, notify) WHERE id = $1 AND user_id = $2 RETURNING *',
      [id, me.id, dto.name?.trim() || null, dto.notify ?? null],
    );
    return this.view(updatedRow(res));
  }

  /** The search was opened: its "N new" restarts from now. */
  async seen(me: RequestUser, id: string): Promise<SavedSearch> {
    const res: unknown = await this.ds.query('UPDATE saved_searches SET last_seen_at = now() WHERE id = $1 AND user_id = $2 RETURNING *', [id, me.id]);
    return this.view(updatedRow(res), 0);
  }

  async remove(me: RequestUser, id: string): Promise<{ ok: true }> {
    const res: unknown = await this.ds.query('DELETE FROM saved_searches WHERE id = $1 AND user_id = $2 RETURNING id', [id, me.id]);
    updatedRow(res);
    return { ok: true };
  }

  /**
   * Saved searches a freshly approved listing lands in, alerts on, owner excluded: what the
   * alerts (phase 7) fan out to. Category is the one constraint nearly every search sets, so
   * the scan is narrowed on it in SQL; the rest is the pure matcher.
   */
  async matching(post: MatchableListing): Promise<SavedSearchMatch[]> {
    const rows = await this.ds.query<Row[]>(
      `SELECT * FROM saved_searches
        WHERE notify = true AND user_id IS DISTINCT FROM $1::uuid
          AND (params->>'category' IS NULL OR params->>'category' = $2)`,
      [post.user_id ?? null, post.category ?? null],
    );
    if (rows.length === 0) return [];
    const schemas = await this.categories.listEntities(true);
    const labels = categoryLabelIndex(schemas);
    const familyKeys = new Map<string, string[]>();
    for (const c of schemas) familyKeys.set(c.family, [...(familyKeys.get(c.family) ?? []), c.key]);
    return rows
      .filter((r) => matchesSavedSearch(post, r.params, labels, familyKeys))
      .map((r) => ({ id: r.id, user_id: r.user_id, name: r.name }));
  }
}
