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
