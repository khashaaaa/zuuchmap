import { stableId } from './device'

/**
 * A random id this browser keeps, sent as `X-Visitor-Id` so the server can
 * dedupe anonymous views.
 *
 * View counting used to require a session, which meant a provider's dashboard
 * left out every anonymous visit — and the public landing, browse and detail
 * pages are where most traffic reaches a listing. The alternative, keying on IP
 * alone, collapses everyone behind a CGNAT address into one viewer, which in
 * Mongolia is most of a mobile network.
 *
 * The id identifies a browser and nothing else: it is generated locally, never
 * derived from anything about the person, and the server stores only a salted
 * hash of it. Cached in the module so a storage-less browser still presents one
 * id for the whole session — the reload-happy visitor is the case that matters.
 */
const KEY = 'zm_visitor_id'

let cached = null

export function getVisitorId() {
  cached ??= stableId(KEY)
  return cached
}
