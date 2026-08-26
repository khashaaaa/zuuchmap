/**
 * Map clustering and filtering. Ported from the app's `gridCluster`
 * (`screens/customer/CustomerMapView.jsx`) and `services/mapService.js` so both
 * clients group and filter the same pins the same way — a district that reads
 * as one badge on the phone must read as one badge here.
 *
 * Everything in this module is pure: it takes posts plus a viewport and returns
 * data. Leaflet stays in `mapPin.js` and the page.
 */

/**
 * Grid cells across the visible width. Coarse enough that a dense district
 * collapses to one badge, fine enough that two sites a block apart stay apart
 * once zoomed in — the cell scales with the viewport, so zooming re-clusters.
 */
const GRID_CELLS = 7

/**
 * Posts arrive with numeric columns that may serialize as strings.
 *
 * `parseFloat`, not `Number`, and for the same reason the app's `mapService`
 * uses it: `Number(null)` is 0, so a post with a missing coordinate would be
 * pinned off the coast of Africa instead of being skipped. `parseFloat(null)`
 * is NaN, which the caller drops.
 */
export const coordsOf = (post) => ({
  latitude: parseFloat(post.latitude),
  longitude: parseFloat(post.longitude),
})

/**
 * Groups posts into screen-space grid cells for the current viewport. O(n): a
 * `Map` keyed by cell, then one pass for centroids and the dominant category
 * (which colours the badge).
 *
 * `viewport` is `{ latDelta, lngDelta }` — the height and width of the visible
 * map in degrees. The app reads these off its MapView region; here they come
 * from Leaflet's bounds.
 */
export const gridCluster = (posts, viewport) => {
  const cellLng = Math.max(viewport.lngDelta / GRID_CELLS, 1e-6)
  const cellLat = Math.max(viewport.latDelta / GRID_CELLS, 1e-6)
  const cells = new Map()

  for (const post of posts) {
    const { latitude, longitude } = coordsOf(post)
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue
    const key = `${Math.floor(latitude / cellLat)}:${Math.floor(longitude / cellLng)}`
    const cell = cells.get(key)
    if (cell) cell.push(post)
    else cells.set(key, [post])
  }

  const out = []
  for (const [key, group] of cells) {
    if (group.length === 1) {
      const post = group[0]
      out.push({
        posts: group,
        coordinate: coordsOf(post),
        count: 1,
        id: `single-${post.category}-${post.id}`,
        dominant: post.category,
      })
      continue
    }
    let lat = 0
    let lng = 0
    const tally = new Map()
    for (const p of group) {
      const c = coordsOf(p)
      lat += c.latitude
      lng += c.longitude
      tally.set(p.category, (tally.get(p.category) || 0) + 1)
    }
    let dominant = group[0].category
    let best = 0
    for (const [type, n] of tally) if (n > best) { best = n; dominant = type }
    out.push({
      posts: group,
      coordinate: { latitude: lat / group.length, longitude: lng / group.length },
      count: group.length,
      id: `cluster-${key}`,
      dominant,
    })
  }
  return out
}

/** Every post as its own single-member cluster — for "clustering off". */
export const noCluster = (posts) => posts.map((post) => ({
  posts: [post],
  coordinate: coordsOf(post),
  count: 1,
  id: `single-${post.category}-${post.id}`,
  dominant: post.category,
}))

export const filterByCategories = (posts, categories) => {
  if (!categories?.length) return posts
  return posts.filter((p) => categories.includes(p.category))
}

export const filterByPriceRange = (posts, priceRange) => {
  if (!priceRange) return posts
  const min = priceRange.min ?? -Infinity
  const max = priceRange.max ?? Infinity
  if (min === -Infinity && max === Infinity) return posts
  return posts.filter((p) => {
    // A post with no price is not a free post. `|| 0` used to make every
    // unpriced listing (job vacancies, factories, material stores) match any
    // range starting at zero, so "under 50,000₮" was mostly priceless posts.
    if (p.price_amount === null || p.price_amount === undefined || p.price_amount === '') return false
    const price = Number(p.price_amount)
    if (Number.isNaN(price)) return false
    return price >= min && price <= max
  })
}

/** Great-circle distance in km. */
export const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export const filterByLocationRadius = (posts, center, radiusKm) => {
  if (!center || !radiusKm) return posts
  return posts.filter((p) => {
    const c = coordsOf(p)
    return calculateDistance(center.latitude, center.longitude, c.latitude, c.longitude) <= radiusKm
  })
}

/**
 * Slider ceiling follows the actual data — a fixed cap silently excluded the
 * expensive end of the market. Mirrors `MapFilterModal.sliderMax` in the app.
 */
export const priceSliderMax = (posts) => {
  const top = Math.max(0, ...posts.map((p) => Number(p.price_amount) || 0))
  const padded = Math.max(top, 10_000_000)
  const magnitude = 10 ** Math.max(6, String(Math.round(padded)).length - 1)
  return Math.ceil(padded / magnitude) * magnitude
}

/** How many filter groups are narrowing the map — drives the badge on the button. */
export const activeFilterCount = (filters) => {
  let n = 0
  if (filters.selectedCategories?.length) n += 1
  if (filters.priceRange?.enabled) n += 1
  if (filters.locationFilter?.enabled) n += 1
  return n
}

export const EMPTY_FILTERS = {
  selectedCategories: [],
  priceRange: { enabled: false, min: null, max: null },
  locationFilter: { enabled: false, radius: 10 },
}
