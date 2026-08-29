// Tile provider for every Leaflet map on the web. Picked with VITE_MAP_TILES
// (stadia | osm | carto); default is Stadia because CARTO's basemaps drop most
// streets/POIs outside big Western cities and Latinise names, so Ulaanbaatar
// renders nearly blank. Stadia needs zuuchmap.com whitelisted in its dashboard
// (no key in the bundle); localhost works unauthenticated.
const OSM = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'

const PROVIDERS = {
  stadia: {
    light: 'https://tiles.stadiamaps.com/tiles/osm_bright/{z}/{x}/{y}{r}.png',
    dark: 'https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png',
    attribution: `&copy; <a href="https://stadiamaps.com/">Stadia Maps</a> &copy; <a href="https://openmaptiles.org/">OpenMapTiles</a> ${OSM}`,
    maxZoom: 20,
  },
  osm: {
    light: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', // OSM has no dark style
    attribution: `${OSM} &copy; <a href="https://carto.com/">CARTO</a>`,
    maxZoom: 19,
  },
  carto: {
    light: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: `${OSM} &copy; <a href="https://carto.com/">CARTO</a>`,
    maxZoom: 20,
  },
}

const provider = PROVIDERS[import.meta.env.VITE_MAP_TILES] ?? PROVIDERS.stadia

/** Props for a react-leaflet <TileLayer>; spread them and add key={theme} so the layer remounts on theme change. */
export function tileLayerProps(isDark) {
  return { url: isDark ? provider.dark : provider.light, attribution: provider.attribution, maxZoom: provider.maxZoom }
}
