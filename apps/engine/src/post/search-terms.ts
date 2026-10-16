import { DISTRICT_NAMES, PROVINCE_NAMES } from '@zuuchmap/core';

/**
 * The one definition of how a free-text query is cut into terms and matched.
 *
 * Browse turns `q` into a prefix tsquery against `posts.search_vector`, a generated column
 * (the schema migration, `SEARCH_VECTOR`) over title (A), attribute values (B) and details, location
 * and address (C), each collapsed on punctuation. The saved-search matcher has to answer the
 * same question in JS, so it tokenises here too, and the two can only drift together; the
 * search gate (`test/search.e2e.spec.ts`) runs both over shared fixtures.
 *
 * Both sides split on every non-letter/non-digit run and fold to lower — the query, the JS
 * document and (via the regexp_replace) the SQL document — so a model number typed the way
 * it is printed ("PC200-8") finds the listing that prints it.
 */

const MAX_QUERY_CHARS = 100;
const MAX_TERMS = 8;

/**
 * Mongolian case, plural and possessive endings, longest first.
 *
 * Matching is prefix-only and one-directional: "экскаватор" finds "Экскаваторын", but
 * "экскаваторын" typed as people say it was a prefix of nothing and, with terms AND-ed,
 * emptied the whole page. Stripping is deliberately generous: cutting too much only widens a
 * prefix match, cutting too little returns nothing. `MIN_STEM` keeps a term from becoming a
 * wildcard, only one ending comes off, and a term not written in Cyrillic is left exactly as
 * typed so model numbers and brand names stay literal.
 *
 * This list is linguistic data, not code — worth a native reading.
 */
// prettier-ignore
const MN_SUFFIXES = [
  // ablative — the 'н' of an n-stem is not part of the ending: 'машинаас' keeps 'машин'
  'аас', 'ээс', 'оос', 'өөс',
  // instrumental
  'гаар', 'гээр', 'гоор', 'гөөр', 'аар', 'ээр', 'оор', 'өөр',
  // possessive-genitive
  'ынх', 'ийнх',
  // plural
  'чууд', 'чүүд', 'ууд', 'үүд', 'нар', 'нэр',
  // comitative
  'тай', 'тэй', 'той',
  // directional
  'руу', 'рүү', 'луу', 'лүү',
  // genitive
  'ийн', 'ын', 'ний', 'ны', 'ий', 'ы',
  // accusative
  'ийг', 'ыг',
  // reflexive possessive
  'гаа', 'гээ', 'гоо', 'гөө', 'аа', 'ээ', 'оо', 'өө',
  // dative-locative
  'нд', 'ад', 'эд', 'од', 'өд',
  // single-letter endings, last because any longer match should win
  'д', 'т', 'г', 'н', 'с',
  // A stem's own final vowel. Inflection rewrites it — барилга → барилгын, хайрга → хайргаар —
  // so the bare noun is a prefix of none of its forms; "барилг" reaches them all.
  'а', 'э', 'о', 'ө', 'у', 'ү', 'и',
].sort((a, b) => b.length - a.length);

/** Shortest a stripped term may get. Below this a prefix match is a wildcard. */
const MIN_STEM = 4;

const CYRILLIC_ONLY = /^[Ѐ-ӿ]+$/;

/** A query term reduced to the stem browse should prefix-match on. Only ever applied to the query. */
function stripMongolianSuffix(term: string): string {
  if (term.length <= MIN_STEM || !CYRILLIC_ONLY.test(term)) return term;
  for (const suffix of MN_SUFFIXES) {
    if (term.length - suffix.length < MIN_STEM) continue;
    if (term.endsWith(suffix)) return term.slice(0, -suffix.length);
  }
  return term;
}

const VOWELS = 'аэоөуүиыяеёю';
const isVowel = (ch: string): boolean => VOWELS.includes(ch);

/**
 * The stem with the vowel of its last syllable dropped: тээвэр → тээвр, ажил → ажл. Mongolian
 * elides that vowel before a vowel-initial ending (тээврийн, ажлын), so no prefix of the bare
 * word reaches those forms. Only a single short vowel between consonants is dropped.
 */
function elidedStem(stem: string): string | null {
  if (stem.length < 4 || !CYRILLIC_ONLY.test(stem)) return null;
  const tail = stem.slice(-3);
  const a = tail.charAt(0);
  const v = tail.charAt(1);
  const c = tail.charAt(2);
  if (isVowel(a) || !isVowel(v) || isVowel(c)) return null;
  return stem.slice(0, -2) + c;
}

/**
 * Cyrillic spellings of brands that listings write in Latin. Linguistic data, not code —
 * extend freely. Keys are matched as prefixes of the typed term, so "тоёотагийн" works.
 */
const ALIASES: Array<[string, string]> = [
  ['комацу', 'komatsu'], ['тоёота', 'toyota'], ['тойота', 'toyota'], ['камаз', 'kamaz'],
  ['шакман', 'shacman'], ['шанкман', 'shacman'], ['хово', 'howo'], ['хюндай', 'hyundai'],
  ['хёндай', 'hyundai'], ['хундай', 'hyundai'], ['катерпиллар', 'caterpillar'], ['катерпилар', 'caterpillar'],
  ['вольво', 'volvo'], ['волво', 'volvo'], ['исузу', 'isuzu'], ['ниссан', 'nissan'], ['нисан', 'nissan'],
  ['мицубиши', 'mitsubishi'], ['мицубиси', 'mitsubishi'], ['митсубиши', 'mitsubishi'], ['сани', 'sany'],
  ['зумлион', 'zoomlion'], ['лиугонг', 'liugong'], ['доосан', 'doosan'], ['хитачи', 'hitachi'], ['бош', 'bosch'],
  ['макита', 'makita'], ['хилти', 'hilti'], ['девольт', 'dewalt'], ['девалт', 'dewalt'], ['хели', 'heli'],
  ['топкон', 'topcon'], ['лэнд', 'land'], ['ланд', 'land'], ['крузер', 'cruiser'], ['приус', 'prius'],
  ['камри', 'camry'], ['портер', 'porter'], ['хсмг', 'xcmg'], ['мерседес', 'mercedes'], ['ман', 'man'],
  ['скания', 'scania'], ['фав', 'faw'], ['фотон', 'foton'], ['жак', 'jac'],
];

const splitTokens = (text: string): string[] =>
  text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);

/** Query → the terms browse would prefix-match, in order, bounded and cleaned. */
export function searchTerms(raw: unknown): string[] {
  const first: unknown = Array.isArray(raw) ? (raw[0] ?? '') : raw;
  const text = typeof first === 'string' ? first : '';
  return splitTokens(text.trim().substring(0, MAX_QUERY_CHARS)).slice(0, MAX_TERMS).map(stripMongolianSuffix);
}

/** One query term and everything it may match. */
export interface TermGroup {
  /** Prefixes OR-ed against the document: the stem, its elided form, aliases. */
  prefixes: string[];
  /** Categories / `category:subcategory` pairs whose name the term matches. */
  categories: string[];
  subcategories: string[];
  /** Province / district codes whose name the term matches. */
  provinces: string[];
  districts: string[];
}

/** A category or subcategory name, cut into the tokens a term can prefix. */
export interface CategoryLabel {
  category: string;
  subcategory: string | null;
  tokens: string[];
}

/**
 * Below this a term must equal a word of the name, not just begin it: "шал" (Floor) is a
 * whole name, but "man" — the truck brand — is not "Manager".
 */
const MIN_LABEL_PREFIX = 4;

/**
 * Place names as matchable tokens, mn and en. Parts shorter than MIN_LABEL_PREFIX are
 * dropped: "Дархан-Уул" must not turn the "уул" of "уул уурхай" into a province filter.
 */
const placeIndex = (names: Record<string, { mn: string; en: string }>): Array<{ code: string; tokens: string[] }> =>
  Object.entries(names).map(([code, n]) => ({
    code,
    tokens: documentTokens(n.mn, n.en).filter((t) => t.length >= MIN_LABEL_PREFIX),
  }));
const PROVINCE_INDEX = placeIndex(PROVINCE_NAMES);
const DISTRICT_INDEX = placeIndex(DISTRICT_NAMES);

export interface LabelledSchema {
  key: string;
  label?: string | null;
  labels?: Record<string, string> | null;
  subcategories?: Array<{ value: string; display?: string; labels?: Record<string, string> }> | null;
}

/** Every name a schema carries, in every locale, as matchable tokens. */
export function categoryLabelIndex(schemas: LabelledSchema[]): CategoryLabel[] {
  const names = (l?: Record<string, string> | null, ...more: Array<string | null | undefined>): string[] =>
    documentTokens(...Object.values(l ?? {}), ...more);
  const out: CategoryLabel[] = [];
  for (const c of schemas) {
    out.push({ category: c.key, subcategory: null, tokens: names(c.labels, c.label) });
    for (const s of c.subcategories ?? []) {
      out.push({ category: c.key, subcategory: s.value, tokens: names(s.labels, s.display) });
    }
  }
  return out;
}

/**
 * Terms → what each may match. A term is satisfied by any of its prefixes in the document, or
 * by the post being filed under a category whose name it matches: "экскаватор" finds a
 * "Komatsu PC200-8" listing in the excavator subcategory, which says the word nowhere. Terms
 * stay AND-ed.
 */
export function expandTerms(terms: string[], labels: CategoryLabel[] = []): TermGroup[] {
  return terms.map((term) => {
    const prefixes = new Set([term]);
    const elided = elidedStem(term);
    if (elided) prefixes.add(elided);
    for (const [raw, to] of ALIASES) {
      // Stemmed like the term, or "комацу" (→ "комац") never meets its key. Short keys
      // ("ман", "бош") must match whole, or "мандал" means MAN.
      const from = stripMongolianSuffix(raw);
      if (from.length <= 4 ? term === from : term.startsWith(from)) prefixes.add(to);
    }
    const categories = new Set<string>();
    const subcategories = new Set<string>();
    for (const l of labels) {
      const hit = [...prefixes].some((p) => l.tokens.some((t) => (p.length >= MIN_LABEL_PREFIX ? t.startsWith(p) : t === p)));
      if (!hit) continue;
      if (l.subcategory) subcategories.add(`${l.category}:${l.subcategory}`);
      else categories.add(l.category);
    }
    // Only prefixes long enough to name a place, so "ба" is not a province.
    const placeHits = (index: typeof PROVINCE_INDEX): string[] =>
      index
        .filter((pl) => [...prefixes].some((p) => p.length >= MIN_LABEL_PREFIX && pl.tokens.some((t) => t.startsWith(p))))
        .map((pl) => pl.code);
    return {
      prefixes: [...prefixes],
      categories: [...categories],
      subcategories: [...subcategories],
      provinces: placeHits(PROVINCE_INDEX),
      districts: placeHits(DISTRICT_INDEX),
    };
  });
}

/** One group's prefixes as a tsquery: `(a:* | b:*)`. Terms hold only letters and digits. */
function groupTsquery(g: TermGroup): string {
  return `(${g.prefixes.map((p) => `${p}:*`).join(' | ')})`;
}

/**
 * How a search's terms combine. `all` is the query as typed; browse falls back to `fuzzy`
 * (each term may also be a near-spelling of a title word) and then `any` (one term is enough)
 * only when the stricter mode found nothing, and says so with `relaxed: true`.
 */
export type SearchMode = 'all' | 'fuzzy' | 'any';

/**
 * pg_trgm `word_similarity` a fuzzy term needs against a title. 0.5 catches "экскаваор" (0.7
 * to "экскаватор"), "самасвал" and "цемнт" (0.5); the extension's own 0.6 missed the last two.
 * The `<%` operator reads it from `pg_trgm.word_similarity_threshold`, which the data source
 * sets on every connection — that operator form is what reaches IDX_posts_title_trgm.
 */
export const FUZZY_THRESHOLD = 0.5;

export interface SearchSql {
  /** To be AND-ed. */
  where: string[];
  rank: string;
  /** "Featured and relevant": paid placement leads a search only where it answers it. */
  featured: string;
  params: Record<string, unknown>;
}

/**
 * The SQL of a search for a query builder aliased `post`. The one place browse's search SQL
 * is written, so the gate tests exactly what ships.
 *
 * Every arm of a term's OR must stay indexable, or the planner gives up on all of them and
 * scans the table: the bare `subcategory = ANY` reaches IDX_posts_subcategory and the pair
 * check after it only rechecks (subcategory values repeat across categories); the fuzzy arm
 * reaches the trigram index through `<%` (a `word_similarity() >= x` call would scan).
 */
export function searchSql(groups: TermGroup[], terms: string[], mode: SearchMode = 'all'): SearchSql {
  const params: Record<string, unknown> = {};
  const subKey = `(post.category || ':' || coalesce(post.subcategory, ''))`;
  const arms = groups.map((g, i) => {
    params[`tsq${i}`] = groupTsquery(g);
    params[`cats${i}`] = g.categories;
    params[`subs${i}`] = g.subcategories;
    params[`subv${i}`] = g.subcategories.map((x) => x.split(':')[1]);
    params[`prov${i}`] = g.provinces;
    params[`dist${i}`] = g.districts;
    const arm = `post.search_vector @@ to_tsquery('simple', :tsq${i}) OR post.category = ANY(:cats${i}) OR (post.subcategory = ANY(:subv${i}) AND ${subKey} = ANY(:subs${i})) OR post.province = ANY(:prov${i}) OR post.district = ANY(:dist${i})`;
    if (mode !== 'fuzzy') return `(${arm})`;
    params[`fz${i}`] = terms[i];
    return `(${arm} OR :fz${i} <% lower(post.title))`;
  });

  params.rankTsq = groups.map(groupTsquery).join(' | ');
  // Every term in the title (`:*A`) or naming the post's category: "самосвал түрээс" must not
  // lift a featured jeep whose title says only "түрээслүүлнэ".
  const answers = groups.map((g, i) => {
    params[`ttq${i}`] = g.prefixes.map((p) => `${p}:*A`).join(' | ');
    return `(post.search_vector @@ to_tsquery('simple', :ttq${i}) OR post.category = ANY(:cats${i}) OR ${subKey} = ANY(:subs${i}))`;
  });
  params.rankSubs = groups.flatMap((g) => g.subcategories);
  params.rankCats = groups.flatMap((g) => g.categories);

  // Title (A) over attributes (B) over prose (C); a post filed under a named subcategory or
  // category gets a fixed lift, so "экскаватор" ranks excavators that never say the word
  // above posts mentioning it in passing.
  const text = `ts_rank(post.search_vector, to_tsquery('simple', :rankTsq))`;
  const lift = `CASE WHEN ${subKey} = ANY(:rankSubs) THEN 0.3 WHEN post.category = ANY(:rankCats) THEN 0.15 ELSE 0 END`;
  const fuzzy =
    mode === 'fuzzy'
      ? ` + coalesce(GREATEST(${groups.map((_, i) => `word_similarity(:fz${i}, lower(post.title))`).join(', ')}), 0)`
      : '';
  return {
    where: mode === 'any' ? [`(${arms.join(' OR ')})`] : arms,
    rank: `(${text} + ${lift}${fuzzy})`,
    featured: `(post.is_featured AND ${answers.join(' AND ')})`,
    params,
  };
}

/** Document text → the lexemes the generated column stores. */
function documentTokens(...parts: Array<string | null | undefined>): string[] {
  return splitTokens(parts.filter(Boolean).join(' '));
}

/** Every `"key":` and the JSON literal right after it; same pattern as the migration. */
const JSON_KEYS_AND_LITERALS = /"(?:[^"\\]|\\.)*"\s*:\s*(?:true|false|null)?/g;

export interface SearchableDocument {
  title?: string | null;
  details?: string | null;
  location?: string | null;
  address?: string | null;
  attributes?: Record<string, unknown> | null;
}

/** The whole of a post as the search vector sees it. */
function postDocument(post: SearchableDocument): string[] {
  return documentTokens(
    post.title,
    post.details,
    post.location,
    post.address,
    post.attributes ? JSON.stringify(post.attributes).replace(JSON_KEYS_AND_LITERALS, ' ') : null,
  );
}

export interface SearchablePost extends SearchableDocument {
  category?: string | null;
  subcategory?: string | null;
  province?: string | null;
  district?: string | null;
}

/**
 * Does `post` satisfy the expanded query the way browse's `all` WHERE does? Every group must
 * hold: a prefix in the document, or the post's category, subcategory, province or district
 * named by the term. The saved-search matcher (phase 4) runs this and never relaxes.
 */
export function matchesPost(groups: TermGroup[], post: SearchablePost): boolean {
  if (!groups.length) return true;
  const tokens = postDocument(post);
  const sub = `${post.category ?? ''}:${post.subcategory ?? ''}`;
  return groups.every(
    (g) =>
      g.categories.includes(post.category ?? '') ||
      g.subcategories.includes(sub) ||
      g.provinces.includes(post.province ?? '') ||
      g.districts.includes(post.district ?? '') ||
      g.prefixes.some((p) => tokens.some((tok) => tok.startsWith(p))),
  );
}
