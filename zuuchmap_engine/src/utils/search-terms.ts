/**
 * The one definition of how a free-text query is cut into terms.
 *
 * Browse turns `q` into a prefix tsquery against `post.search_vector`, a
 * generated column over `to_tsvector('simple', regexp_replace(title || details
 * || location || address || attributes::text, '[^[:alnum:]]+', ' ', 'g'))`
 * (SearchVectorWidened migration). The saved-search matcher has to answer the
 * same question in JS, so it tokenises here too, and the two can only drift
 * together.
 *
 * Both sides split on every non-letter/non-digit run and fold to lower — the
 * query, the JS document, and (via the regexp_replace) the SQL document. The
 * previous shape stripped punctuation *inside* a query term (`PC-200` →
 * `pc200`) while Postgres stored `pc` and `-200`, so a model number typed the
 * way it is printed found nothing in browse but matched in the JS matcher.
 */

const MAX_QUERY_CHARS = 100;
const MAX_TERMS = 8;

/**
 * Mongolian case, plural and possessive endings, longest first.
 *
 * Why the query side needs them: matching is prefix-only and one-directional.
 * A listing titled "Экскаватор" is found by the query "экскаватор", and a
 * listing titled "Экскаваторын" is found by it too — the query term is a
 * prefix of the stored token. The reverse is not true. Somebody typing the
 * inflected form they would actually say, "экскаваторын", was a prefix of
 * nothing and got an empty page, and because terms are ANDed together one such
 * word emptied the whole result.
 *
 * Stripping is deliberately generous. Cutting too much only widens a prefix
 * match, which costs some precision; cutting too little returns nothing at
 * all, which is the failure worth avoiding. `MIN_STEM` keeps it from
 * shortening a word into a wildcard, only one ending comes off (Mongolian
 * stacks at most one of these at the end of a search term), and a term that
 * is not written in Cyrillic is left exactly as typed so model numbers and
 * brand names stay literal.
 *
 * This list is linguistic data, not code — worth a native reading.
 */
// prettier-ignore
const MN_SUFFIXES = [
  // ablative — the 'н' of an n-stem is not part of the ending, so 'машинаас'
  // gives up 'аас' and keeps 'машин'
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
  // A stem's own final vowel. Inflection rewrites it — барилга → барилгын,
  // хайрга → хайргаар — so the bare noun is a prefix of none of its forms.
  // Dropping it ("барилг") reaches the noun and every inflection.
  'а', 'э', 'о', 'ө', 'у', 'ү', 'и',
].sort((a, b) => b.length - a.length);

/** Shortest a stripped term may get. Below this a prefix match is a wildcard. */
const MIN_STEM = 4;

const CYRILLIC_ONLY = /^[Ѐ-ӿ]+$/;

/**
 * A query term reduced to the stem browse should prefix-match on.
 *
 * Only ever applied to the query. The stored document keeps whatever the
 * provider wrote, because a prefix match already reaches every inflected form
 * of it from a bare stem.
 */
export function stripMongolianSuffix(term: string): string {
  if (term.length <= MIN_STEM || !CYRILLIC_ONLY.test(term)) return term;
  for (const suffix of MN_SUFFIXES) {
    if (term.length - suffix.length < MIN_STEM) continue;
    if (term.endsWith(suffix)) return term.slice(0, -suffix.length);
  }
  return term;
}

const VOWELS = 'аэоөуүиыяеёю';
const isVowel = (ch: string) => VOWELS.includes(ch);

/**
 * The stem with the vowel of its last syllable dropped: тээвэр → тээвр,
 * ажил → ажл. Mongolian elides that vowel before a vowel-initial ending
 * (тээврийн, ажлын), so no prefix of the bare word reaches those forms. Only
 * a single short vowel between consonants is dropped — long vowels stay.
 */
function elidedStem(stem: string): string | null {
  if (stem.length < 4 || !CYRILLIC_ONLY.test(stem)) return null;
  const [a, v, c] = stem.slice(-3);
  if (isVowel(a) || !isVowel(v) || isVowel(c)) return null;
  return stem.slice(0, -2) + c;
}

/**
 * Cyrillic spellings of brands that listings write in Latin, and the reverse
 * for the few written in Cyrillic. Linguistic data, not code — extend freely.
 * Keys are matched as prefixes of the typed term, so "тоёотагийн" works.
 */
const ALIASES: [string, string][] = [
  ['комацу', 'komatsu'],
  ['тоёота', 'toyota'],
  ['тойота', 'toyota'],
  ['камаз', 'kamaz'],
  ['шакман', 'shacman'],
  ['шанкман', 'shacman'],
  ['хово', 'howo'],
  ['хюндай', 'hyundai'],
  ['хёндай', 'hyundai'],
  ['хундай', 'hyundai'],
  ['катерпиллар', 'caterpillar'],
  ['катерпилар', 'caterpillar'],
  ['вольво', 'volvo'],
  ['волво', 'volvo'],
  ['исузу', 'isuzu'],
  ['ниссан', 'nissan'],
  ['нисан', 'nissan'],
  ['мицубиши', 'mitsubishi'],
  ['мицубиси', 'mitsubishi'],
  ['сани', 'sany'],
  ['зумлион', 'zoomlion'],
  ['лиугонг', 'liugong'],
  ['доосан', 'doosan'],
  ['хитачи', 'hitachi'],
  ['бош', 'bosch'],
  ['макита', 'makita'],
  ['хилти', 'hilti'],
  ['девольт', 'dewalt'],
  ['девалт', 'dewalt'],
  ['хели', 'heli'],
  ['топкон', 'topcon'],
  ['лэнд', 'land'],
  ['ланд', 'land'],
  ['крузер', 'cruiser'],
  ['приус', 'prius'],
  ['камри', 'camry'],
  ['портер', 'porter'],
  ['митсубиши', 'mitsubishi'],
  ['хсмг', 'xcmg'],
  ['мерседес', 'mercedes'],
  ['ман', 'man'],
  ['скания', 'scania'],
  ['фав', 'faw'],
  ['фотон', 'foton'],
  ['жак', 'jac'],
];

const splitTokens = (text: string): string[] =>
  text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);

/** Query → the terms browse would prefix-match, in order, bounded and cleaned. */
export function searchTerms(raw: unknown): string[] {
  const text = String(Array.isArray(raw) ? (raw[0] ?? '') : (raw ?? ''));
  return splitTokens(text.trim().substring(0, MAX_QUERY_CHARS))
    .slice(0, MAX_TERMS)
    .map(stripMongolianSuffix);
}

/** One query term and everything it may match. */
export interface TermGroup {
  /** Prefixes OR-ed against the document: the stem, its elided form, aliases. */
  prefixes: string[];
  /** Categories / `category:subcategory` pairs whose name the term matches. */
  categories: string[];
  subcategories: string[];
}

/** A category or subcategory name, cut into the tokens a term can prefix. */
export interface CategoryLabel {
  category: string;
  subcategory: string | null;
  tokens: string[];
}

/**
 * Below this a term must equal a word of the name, not just begin it: "шал"
 * (Floor) is a whole name, but "man" — the truck brand — is not "Manager".
 */
const MIN_LABEL_PREFIX = 4;

/** Every name a schema carries, in every locale, as matchable tokens. */
export function categoryLabelIndex(
  schemas: {
    key: string;
    label?: string | null;
    labels?: Record<string, string> | null;
    subcategories?:
      | { value: string; display?: string; labels?: Record<string, string> }[]
      | null;
  }[],
): CategoryLabel[] {
  const names = (
    l?: Record<string, string> | null,
    ...more: (string | null | undefined)[]
  ) => documentTokens(...Object.values(l ?? {}), ...more);
  const out: CategoryLabel[] = [];
  for (const c of schemas) {
    out.push({
      category: c.key,
      subcategory: null,
      tokens: names(c.labels, c.label),
    });
    for (const s of c.subcategories ?? []) {
      out.push({
        category: c.key,
        subcategory: s.value,
        tokens: names(s.labels, s.display),
      });
    }
  }
  return out;
}

/**
 * Terms → what each may match. A term is satisfied by any of its prefixes in
 * the document, or by the post being filed under a category whose name it
 * matches: "экскаватор" finds a "Komatsu PC200-8" listing in the excavator
 * subcategory, which says the word nowhere. Terms stay AND-ed.
 */
export function expandTerms(
  terms: string[],
  labels: CategoryLabel[] = [],
): TermGroup[] {
  return terms.map((term) => {
    const prefixes = new Set([term]);
    const elided = elidedStem(term);
    if (elided) prefixes.add(elided);
    for (const [raw, to] of ALIASES) {
      // Stemmed like the term, or "комацу" (→ "комац") never meets its key.
      // Short keys ("ман", "бош") must match whole, or "мандал" means MAN.
      const from = stripMongolianSuffix(raw);
      if (from.length <= 4 ? term === from : term.startsWith(from))
        prefixes.add(to);
    }
    const categories = new Set<string>();
    const subcategories = new Set<string>();
    for (const l of labels) {
      const hit = [...prefixes].some((p) =>
        l.tokens.some((t) =>
          p.length >= MIN_LABEL_PREFIX ? t.startsWith(p) : t === p,
        ),
      );
      if (!hit) continue;
      if (l.subcategory) subcategories.add(`${l.category}:${l.subcategory}`);
      else categories.add(l.category);
    }
    return {
      prefixes: [...prefixes],
      categories: [...categories],
      subcategories: [...subcategories],
    };
  });
}

/** One group's prefixes as a tsquery: `(a:* | b:*)`. Terms hold only letters and digits. */
export function groupTsquery(g: TermGroup): string {
  return `(${g.prefixes.map((p) => `${p}:*`).join(' | ')})`;
}

/** Document text → the lexemes the generated column stores. */
export function documentTokens(
  ...parts: (string | null | undefined)[]
): string[] {
  return splitTokens(parts.filter(Boolean).join(' '));
}

/**
 * Every `"key":` and the JSON literal right after it. Keys are not content —
 * indexed, the prefix "man" matched every post with a `manufacturer` field.
 * Same pattern as the SearchVectorValuesOnly migration.
 */
const JSON_KEYS_AND_LITERALS = /"(?:[^"\\]|\\.)*"\s*:\s*(?:true|false|null)?/g;

/**
 * The whole of a post as the search vector sees it.
 *
 * Mirrors the generated column's expression: `attributes` serialised, then
 * stripped of keys and true/false/null, so only string and number values
 * reach the punctuation collapse on either side.
 */
export function postDocument(post: {
  title?: string | null;
  details?: string | null;
  location?: string | null;
  address?: string | null;
  attributes?: Record<string, any> | null;
}): string[] {
  return documentTokens(
    post.title,
    post.details,
    post.location,
    post.address,
    post.attributes
      ? JSON.stringify(post.attributes).replace(JSON_KEYS_AND_LITERALS, ' ')
      : null,
  );
}

/**
 * Does `text` satisfy the query the way `search_vector @@ to_tsquery` would?
 * Every term must prefix-match some token — AND across terms, `:*` on each.
 */
export function matchesSearchTerms(
  terms: string[],
  ...parts: (string | null | undefined)[]
): boolean {
  if (!terms.length) return true;
  const tokens = documentTokens(...parts);
  return terms.every((term) => tokens.some((tok) => tok.startsWith(term)));
}

/**
 * Does `post` satisfy the expanded query the way browse's WHERE does? Every
 * group must hold: a prefix in the document, or the post's category or
 * subcategory named by the term.
 */
export function matchesPost(
  groups: TermGroup[],
  post: Parameters<typeof postDocument>[0] & {
    category?: string | null;
    subcategory?: string | null;
  },
): boolean {
  if (!groups.length) return true;
  const tokens = postDocument(post);
  const sub = `${post.category ?? ''}:${post.subcategory ?? ''}`;
  return groups.every(
    (g) =>
      g.categories.includes(post.category ?? '') ||
      g.subcategories.includes(sub) ||
      g.prefixes.some((p) => tokens.some((tok) => tok.startsWith(p))),
  );
}
