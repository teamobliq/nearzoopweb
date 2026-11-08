/** MapLibre style engine for the location step and the offer previews:
    fetches the Positron base style once, repaints it into the NearZoop
    palette (tan land, white roads, soft green parks, blue water) and
    enriches it with what the tiles carry but Positron never draws: building
    footprints in clear contrast, named shop/POI labels from zoom 15, and
    house numbers up close. Falls back to a bare-bones keyless style when
    the fetch fails. The React canvas lives in MaplibrePicker. */

import {
  setWorkerUrl,
  type StyleSpecification,
  type SymbolLayerSpecification,
} from 'maplibre-gl'
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'

// Serve the MapLibre worker through Vite's worker pipeline — the dep
// optimizer's copy can come back with a broken MIME type in dev, and the
// production bundle emits no sibling `maplibre-gl-worker.mjs` next to the
// hashed asset. Every map in the app imports this module before it builds
// its MLMap, so one call here covers them all (previously only the merchant
// picker had it, and the customer map rendered a blank canvas).
setWorkerUrl(maplibreWorkerUrl)

const POSITRON_URL = 'https://tiles.openfreemap.org/styles/positron'

/** The design's map palette (same values as the mockup artwork). */
const LAND = '#ecdcba'
const LAND_SOFT = '#e4d2ac'
const BUILDING = '#e2cfa6'
const BUILDING_LINE = '#c9b184'
const GREEN = '#d4eac2'
const GREEN_DEEP = '#c8e2b2'
const WATER = '#a9d3ee'
const ROAD = '#ffffff'
const ROAD_CASE = '#d9c49b'
const PATH = '#f7f1dc'
const RAIL = '#cdbd93'
const RAIL_DASH = '#f7f1dc'
const BOUNDARY = '#b3a37e'
const LABEL = '#7c6b4d'
const LABEL_HALO = '#fff8e6'
const ROAD_LABEL = '#8a7a5b'
const WATER_LABEL = '#4f7fa8'

/** Paint overrides keyed by Positron's exact layer ids — merged into each
    layer's existing paint so widths, opacities and zoom curves survive. */
const PAINT: Record<string, Record<string, unknown>> = {
  background: { 'background-color': LAND },
  park: { 'fill-color': GREEN },
  water: { 'fill-color': WATER },
  landcover_wood: { 'fill-color': GREEN_DEEP },
  landuse_residential: { 'fill-color': LAND_SOFT },
  building: { 'fill-color': BUILDING, 'fill-outline-color': BUILDING_LINE },
  waterway: { 'line-color': WATER },
  'aeroway-area': { 'fill-color': ROAD },
  'aeroway-runway': { 'line-color': ROAD },
  'aeroway-runway-casing': { 'line-color': ROAD_CASE },
  'aeroway-taxiway': { 'line-color': ROAD },
  road_area_pier: { 'fill-color': ROAD },
  road_pier: { 'line-color': ROAD },
  highway_path: { 'line-color': PATH },
  highway_minor: { 'line-color': ROAD },
  highway_major_casing: { 'line-color': ROAD_CASE },
  highway_major_inner: { 'line-color': ROAD },
  highway_major_subtle: { 'line-color': ROAD_CASE },
  highway_motorway_casing: { 'line-color': ROAD_CASE },
  highway_motorway_inner: { 'line-color': ROAD },
  highway_motorway_subtle: { 'line-color': ROAD_CASE },
  highway_motorway_bridge_casing: { 'line-color': ROAD_CASE },
  highway_motorway_bridge_inner: { 'line-color': ROAD },
  railway: { 'line-color': RAIL },
  railway_dashline: { 'line-color': RAIL_DASH },
  railway_service: { 'line-color': RAIL },
  railway_service_dashline: { 'line-color': RAIL_DASH },
  railway_transit: { 'line-color': RAIL },
  railway_transit_dashline: { 'line-color': RAIL_DASH },
  boundary_2: { 'line-color': BOUNDARY },
  boundary_3: { 'line-color': BOUNDARY },
  boundary_disputed: { 'line-color': BOUNDARY },
  waterway_line_label: { 'text-color': WATER_LABEL, 'text-halo-color': LABEL_HALO },
  water_name_point_label: { 'text-color': WATER_LABEL, 'text-halo-color': LABEL_HALO },
  water_name_line_label: { 'text-color': WATER_LABEL, 'text-halo-color': LABEL_HALO },
  'highway-name-path': { 'text-color': ROAD_LABEL, 'text-halo-color': LABEL_HALO },
  'highway-name-minor': { 'text-color': ROAD_LABEL, 'text-halo-color': LABEL_HALO },
  'highway-name-major': { 'text-color': ROAD_LABEL, 'text-halo-color': LABEL_HALO },
  airport: { 'text-color': ROAD_LABEL, 'text-halo-color': LABEL_HALO },
  label_other: { 'text-color': LABEL, 'text-halo-color': LABEL_HALO },
  label_village: { 'text-color': LABEL, 'text-halo-color': LABEL_HALO },
  label_town: { 'text-color': LABEL, 'text-halo-color': LABEL_HALO },
  label_state: { 'text-color': LABEL, 'text-halo-color': LABEL_HALO },
  label_city: { 'text-color': LABEL, 'text-halo-color': LABEL_HALO },
  label_city_capital: { 'text-color': LABEL, 'text-halo-color': LABEL_HALO },
  label_country_1: { 'text-color': LABEL, 'text-halo-color': LABEL_HALO },
  label_country_2: { 'text-color': LABEL, 'text-halo-color': LABEL_HALO },
  label_country_3: { 'text-color': LABEL, 'text-halo-color': LABEL_HALO },
}

/** Merges the palette into the fetched style. Unknown layers keep their
    original paint — only the ids above are touched. */
function repaint(style: StyleSpecification): StyleSpecification {
  for (const layer of style.layers) {
    const patch = PAINT[layer.id]
    if (!patch) continue
    layer.paint = {
      ...(layer.paint as Record<string, unknown>),
      ...patch,
    } as typeof layer.paint
  }
  return style
}

/** Positron's US highway-shield layers read `["<=", ["get", "ref_length"], 6]`
    against tiles where the field is absent, which MapLibre reports as
    "Expected value to be of type number, but found null" three times per
    map mount. A missing field is treated as a non-match, so wrapping it in
    coalesce with a sentinel above the threshold preserves the intended
    behaviour while silencing the warning. */
const SHIELD_LAYERS = new Set([
  'highway-shield-non-us',
  'highway-shield-us-interstate',
  'road_shield_us',
])

function quietShieldFilters(style: StyleSpecification): StyleSpecification {
  for (const layer of style.layers) {
    if (!SHIELD_LAYERS.has(layer.id)) continue
    const filter = (layer as { filter?: unknown }).filter
    if (!Array.isArray(filter)) continue
    // Only rewrite the numeric comparison; leave the rest of the predicate
    // (geometry-type / network matches) untouched.
    const rewritten = filter.map((clause) => {
      if (
        Array.isArray(clause) &&
        clause.length === 3 &&
        clause[0] === '<=' &&
        Array.isArray(clause[1]) &&
        clause[1][0] === 'get' &&
        clause[1][1] === 'ref_length'
      ) {
        return ['<=', ['coalesce', ['get', 'ref_length'], 99], clause[2]]
      }
      return clause
    }) as typeof filter
    ;(layer as { filter?: unknown }).filter = rewritten
  }
  return style
}

/** Named point-of-interest label layer — shops, eateries, services, ATMs.
    Positron ships no POI layers at all, but the vector tiles carry them;
    this draws every POI that has a name, text-only (no sprite icons), in
    the design's olive-on-cream label style. Shows from zoom 15 so the
    offer preview (15.5) gets shop names too; the picker opens at 17.
    `rank` is OpenMapTiles' importance score (2 = landmark, rising for
    minor places) — sorting by it lets a hospital or a big shop keep its
    name when a minor POI would otherwise win the collision. */
function poiLabelLayer(): SymbolLayerSpecification {
  return {
    id: 'nz-poi-label',
    type: 'symbol',
    source: 'openmaptiles',
    'source-layer': 'poi',
    minzoom: 15,
    filter: ['has', 'name'],
    layout: {
      'text-field': ['get', 'name'],
      'text-font': ['Noto Sans Regular'],
      'text-size': ['interpolate', ['linear'], ['zoom'], 15, 10, 19, 14],
      'text-max-width': 9,
      'text-letter-spacing': 0.05,
      'text-padding': 2,
      'symbol-sort-key': ['coalesce', ['get', 'rank'], 100],
    },
    paint: {
      'text-color': LABEL,
      'text-halo-color': LABEL_HALO,
      'text-halo-width': 1.2,
    },
  }
}

/** House numbers on building footprints — appears when zoomed in close. */
function housenumberLayer(): SymbolLayerSpecification {
  return {
    id: 'nz-housenumber',
    type: 'symbol',
    source: 'openmaptiles',
    'source-layer': 'housenumber',
    minzoom: 19,
    layout: {
      'text-field': ['get', 'housenumber'],
      'text-font': ['Noto Sans Regular'],
      'text-size': 10,
    },
    paint: {
      'text-color': LABEL,
      'text-halo-color': LABEL_HALO,
      'text-halo-width': 1,
    },
  }
}

/** Appends the layers Positron leaves out, on top of everything it draws. */
function enrich(style: StyleSpecification): StyleSpecification {
  style.layers.push(poiLabelLayer(), housenumberLayer())
  return style
}

/** Bare-bones keyless style if the Positron fetch fails — tan land and blue
    water, no labels. The picker still works; only the looks degrade. */
const MINIMAL_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    openmaptiles: { type: 'vector', url: 'https://tiles.openfreemap.org/planet' },
  },
  glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
  layers: [
    { id: 'background', type: 'background', paint: { 'background-color': LAND } },
    {
      id: 'water',
      type: 'fill',
      source: 'openmaptiles',
      'source-layer': 'water',
      paint: { 'fill-color': WATER },
    },
    {
      id: 'building',
      type: 'fill',
      source: 'openmaptiles',
      'source-layer': 'building',
      minzoom: 12,
      paint: {
        'fill-color': BUILDING,
        'fill-outline-color': BUILDING_LINE,
      },
    },
    poiLabelLayer(),
  ],
}

/** The NearZoop-painted map style: Positron fetched once per session,
    repainted into the app palette and enriched with POI labels. Falls
    back to the minimal keyless style when the fetch fails. Shared by the
    picker and previews. The promise is cached at module scope because
    the host throttles per IP and the response is expensive — without
    the cache, StrictMode's double effect in dev fetched it twice per
    mount. A minimal-style fallback is NOT cached, so the failure
    overlay's retry always refetches. */
let stylePromise: Promise<StyleSpecification> | null = null

export function nzMapStyle(): Promise<StyleSpecification> {
  if (!stylePromise) {
    stylePromise = fetchPaintedStyle().then((style) => {
      if (style === MINIMAL_STYLE) stylePromise = null
      return style
    })
  }
  return stylePromise
}

async function fetchPaintedStyle(): Promise<StyleSpecification> {
  try {
    const res = await fetch(POSITRON_URL, { signal: AbortSignal.timeout(5000) })
    if (!res.ok) throw new Error(String(res.status))
    return enrich(quietShieldFilters(repaint((await res.json()) as StyleSpecification)))
  } catch {
    return MINIMAL_STYLE
  }
}
