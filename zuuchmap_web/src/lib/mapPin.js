import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

/**
 * Leaflet lives here rather than in `lib/utils.js` so it stays out of the entry
 * chunk. `utils.js` is imported by every page including the landing page, so a
 * top-level `import L from 'leaflet'` there dragged 47KB gz of mapping code —
 * plus its stylesheet — into the first paint of a visitor who never opens a
 * map. Only the three map-bearing routes import this module, and Vite gives
 * each of them the leaflet chunk on demand.
 */

const pinCache = new Map()

/**
 * Category-tinted Leaflet map pin. Replaces the stock PNG set that was fetched
 * from a remote CDN (a CSP/offline liability). Shape and ring mirror the
 * app's map marker (`CustomerMapView` `singleMarkerContainer`): category fill,
 * fixed white ring — pins sit on map tiles, not on a themed surface — small
 * tail. Geometry lives in `index.css` (`.map-pin`); only the fill varies here.
 */
export const categoryPin = (color) => {
  const fill = color || 'var(--color-muted)'
  if (!pinCache.has(fill)) {
    pinCache.set(fill, L.divIcon({
      className: 'map-pin-wrap',
      html: `<span class="map-pin" style="background:${fill}"></span>`,
      iconSize: [30, 37],
      iconAnchor: [15, 36], // tip of the tail
      popupAnchor: [0, -34],
    }))
  }
  return pinCache.get(fill)
}

const clusterCache = new Map()

/**
 * Cluster badge. Mirrors the app's `clusterMarkerContainer` / `clusterDisc`
 * pair: a pill in the dominant category's colour with a white disc carrying the
 * count. The count sits on white rather than on the tint because a schema
 * colour is admin-editable and was never tuned to hold text — the disc is
 * legible on any hue, so the tint is free to say "these are mostly tool rentals"
 * before the tap.
 */
export const clusterPin = (color, count, textColor) => {
  const tint = color || 'var(--color-muted)'
  const label = count > 999 ? '999+' : String(count)
  const key = `${tint}|${label}|${textColor}`
  if (!clusterCache.has(key)) {
    const width = count > 99 ? 52 : count > 9 ? 44 : 40
    clusterCache.set(key, L.divIcon({
      className: 'map-cluster-wrap',
      html: `<span class="map-cluster" style="background:${tint};min-width:${width}px">` +
            `<span class="map-cluster-disc" style="color:${textColor}">${label}</span></span>`,
      iconSize: [width, 40],
      iconAnchor: [width / 2, 20],
    }))
  }
  return clusterCache.get(key)
}
