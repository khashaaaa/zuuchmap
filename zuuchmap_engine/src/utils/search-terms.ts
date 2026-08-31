/**
 * The one definition of how a free-text query is cut into terms.
 *
 * Browse turns `q` into a prefix tsquery against `post.search_vector`, a
 * generated column over `to_tsvector('simple', regexp_replace(title || ' ' ||
 * details, '[^[:alnum:]]+', ' ', 'g'))` (SearchVectorNormalised migration).
 * The saved-search matcher has to answer the same question in JS, so it
 * tokenises here too, and the two can only drift together.
 *
 * Both sides split on every non-letter/non-digit run and fold to lower — the
 * query, the JS document, and (via the regexp_replace) the SQL document. The
 * previous shape stripped punctuation *inside* a query term (`PC-200` →
 * `pc200`) while Postgres stored `pc` and `-200`, so a model number typed the
 * way it is printed found nothing in browse but matched in the JS matcher.
 */

const MAX_QUERY_CHARS = 100;
const MAX_TERMS = 8;

const splitTokens = (text: string): string[] =>
  text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);

/** Query → the terms browse would prefix-match, in order, bounded and cleaned. */
export function searchTerms(raw: unknown): string[] {
  const text = String(Array.isArray(raw) ? (raw[0] ?? '') : (raw ?? ''));
  return splitTokens(text.trim().substring(0, MAX_QUERY_CHARS)).slice(
    0,
    MAX_TERMS,
  );
}

/** Document text → the lexemes the generated column stores. */
export function documentTokens(
  ...parts: (string | null | undefined)[]
): string[] {
  return splitTokens(parts.filter(Boolean).join(' '));
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
