// Tile provider for every Leaflet map on the web. Picked with VITE_MAP_TILES
// (stadia | osm | carto); default is CARTO Voyager, which the app already uses.
// Stadia draws Ulaanbaatar in more detail, but it answers 401 to any origin not
// whitelisted in its dashboard — and zuuchmap.com never was, so production maps
// were grey. Opt back in with VITE_MAP_TILES=stadia once the domain is listed.
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

const provider = PROVIDERS[import.meta.env.VITE_MAP_TILES] ?? PROVIDERS.carto

/** Props for a react-leaflet <TileLayer>; spread them and add key={theme} so the layer remounts on theme change. */
export function tileLayerProps(isDark) {
  return { url: isDark ? provider.dark : provider.light, attribution: provider.attribution, maxZoom: provider.maxZoom }
}
