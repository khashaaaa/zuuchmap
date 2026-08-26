/**
 * The one definition of how a free-text query is cut into terms.
 *
 * Browse turns `q` into a prefix tsquery against `post.search_vector`, a
 * generated column over `to_tsvector('simple', title || ' ' || details)`.
 * The saved-search matcher had to answer the same question in JS and did it
 * with `title.toLowerCase().includes(q)` — which never looked at `details`, and
 * required the whole phrase verbatim in the title. A two-word saved search
 * therefore matched in browse and then essentially never notified.
 *
 * Both sides now tokenise here, so the two can only drift together.
 *
 * `simple` is deliberate on the Postgres side: no stemming, no stopwords, just
 * fold-to-lower and split on non-word characters. That is exactly what these
 * two functions do, which is what makes the JS side a faithful stand-in.
 */

const MAX_QUERY_CHARS = 100;
const MAX_TERMS = 8;

/** Query → the terms browse would prefix-match, in order, bounded and cleaned. */
export function searchTerms(raw: unknown): string[] {
  const text = String(Array.isArray(raw) ? raw[0] ?? '' : raw ?? '');
  return text
    .trim()
    .substring(0, MAX_QUERY_CHARS)
    .split(/\s+/)
    .map((t) => t.replace(/[^\p{L}\p{N}]/gu, '').toLowerCase())
    .filter(Boolean)
    .slice(0, MAX_TERMS);
}

/**
 * Document text → the lexemes `to_tsvector('simple', …)` would store.
 *
 * Each whitespace-delimited chunk yields both its parts and the chunk with
 * punctuation removed, because the two sides treat a hyphen differently:
 * Postgres emits `self-dumper` plus `self` and `dumper`, while `searchTerms`
 * strips the hyphen and asks for `selfdumper`. Emitting both keeps a query for
 * a hyphenated word matching the post that contains it.
 */
export function documentTokens(...parts: (string | null | undefined)[]): string[] {
  const tokens: string[] = [];
  for (const chunk of parts.filter(Boolean).join(' ').trim().split(/\s+/)) {
    if (!chunk) continue;
    for (const piece of chunk.split(/[^\p{L}\p{N}]+/u)) {
      if (piece) tokens.push(piece.toLowerCase());
    }
    const joined = chunk.replace(/[^\p{L}\p{N}]/gu, '').toLowerCase();
    if (joined) tokens.push(joined);
  }
  return tokens;
}

/**
 * Does `text` satisfy the query the way `search_vector @@ to_tsquery` would?
 * Every term must prefix-match some token — AND across terms, `:*` on each.
 */
export function matchesSearchTerms(terms: string[], ...parts: (string | null | undefined)[]): boolean {
  if (!terms.length) return true;
  const tokens = documentTokens(...parts);
  return terms.every((term) => tokens.some((tok) => tok.startsWith(term)));
}
