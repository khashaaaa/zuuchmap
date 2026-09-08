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

/** Document text → the lexemes the generated column stores. */
export function documentTokens(
  ...parts: (string | null | undefined)[]
): string[] {
  return splitTokens(parts.filter(Boolean).join(' '));
}

/**
 * The whole of a post as the search vector sees it.
 *
 * Mirrors the generated column's expression, `attributes` serialised the way
 * `attributes::text` serialises it — after the punctuation collapse both sides
 * reduce to the same token sequence, keys included.
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
    post.attributes ? JSON.stringify(post.attributes) : null,
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

/** `matchesSearchTerms` over every field the vector covers. */
export function matchesPost(
  terms: string[],
  post: Parameters<typeof postDocument>[0],
): boolean {
  if (!terms.length) return true;
  const tokens = postDocument(post);
  return terms.every((term) => tokens.some((tok) => tok.startsWith(term)));
}
