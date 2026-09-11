// Tile provider for every Leaflet map on the web. Picked with VITE_MAP_TILES
// (osm | stadia); default is OpenStreetMap's own raster tiles — the only free
// source that still serves an unwatermarked tile. CARTO's public basemaps, the
// previous default in both styles, began answering 200 with every tile stamped
// "API KEY REQUIRED" in September 2026; Stadia answers 401 to any origin not
// registered in its dashboard, and zuuchmap.com never was.
//
// OSM has no dark style, so in dark mode the light tiles are inverted with a
// CSS filter (`.map-tiles-dark`, index.css): roads and labels stay legible,
// water goes deep blue, and no second provider is needed.
const OSM = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'

const PROVIDERS = {
  osm: {
    light: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    dark: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    darkClassName: 'map-tiles-dark',
    attribution: OSM,
    maxZoom: 19,
  },
  stadia: {
    light: 'https://tiles.stadiamaps.com/tiles/osm_bright/{z}/{x}/{y}{r}.png',
    dark: 'https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png',
    attribution: `&copy; <a href="https://stadiamaps.com/">Stadia Maps</a> &copy; <a href="https://openmaptiles.org/">OpenMapTiles</a> ${OSM}`,
    maxZoom: 20,
  },
}

const provider = PROVIDERS[import.meta.env.VITE_MAP_TILES] ?? PROVIDERS.osm

/** Props for a react-leaflet <TileLayer>; spread them and add key={theme} so the layer remounts on theme change. */
export function tileLayerProps(isDark) {
  return {
    url: isDark ? provider.dark : provider.light,
    attribution: provider.attribution,
    maxZoom: provider.maxZoom,
    className: isDark ? provider.darkClassName : undefined,
  }
}
