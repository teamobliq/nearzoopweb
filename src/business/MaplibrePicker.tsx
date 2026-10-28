/** MapLibre engine for the location step: MapLibre GL over OpenStreetMap
    vector tiles (OpenFreeMap — free, no API key). The Positron base style is
    fetched once and repainted into the NearZoop palette: tan land, white
    roads, soft green parks, blue water — matching the app designs. On top
    of Positron's sparse layers, the style is enriched with what the tiles
    carry but Positron never draws: building footprints in clear contrast,
    named shop/POI labels from zoom 16, and house numbers up close. The card,
    pin and tip live in LocationPicker — this file only fills the canvas. */

import { useEffect, useRef } from 'react'
import {
  AttributionControl,
  Map as MLMap,
  setWorkerUrl,
  type StyleSpecification,
  type SymbolLayerSpecification,
} from 'maplibre-gl'
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import 'maplibre-gl/dist/maplibre-gl.css'
import { cachedCoords, FALLBACK_FIX, resolveAddress, type LocationFix } from './geocode'

// Serve the MapLibre worker through Vite's worker pipeline — the dep
// optimizer's copy can come back with a broken MIME type in dev.
setWorkerUrl(maplibreWorkerUrl)

type Props = {
  /** Fires once on load and after every drag/zoom settles. */
  onPick: (fix: LocationFix) => void
  /** First drag — the shell hides the "drag the map" tip. */
  onMoved: () => void
}

const INITIAL_ZOOM = 17

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

/** Named point-of-interest label layer — shops, eateries, services, ATMs.
    Positron ships no POI layers at all, but the vector tiles carry them;
    this draws every POI that has a name, text-only (no sprite icons), in
    the design's olive-on-cream label style. Shows from zoom 16 — the
    picker opens at 17, so shop names are visible immediately. */
function poiLabelLayer(): SymbolLayerSpecification {
  return {
    id: 'nz-poi-label',
    type: 'symbol',
    source: 'openmaptiles',
    'source-layer': 'poi',
    minzoom: 16,
    filter: ['has', 'name'],
    layout: {
      'text-field': ['get', 'name'],
      'text-font': ['Noto Sans Regular'],
      'text-size': ['interpolate', ['linear'], ['zoom'], 16, 10.5, 19, 13],
      'text-max-width': 9,
      'text-letter-spacing': 0.05,
      'text-padding': 3,
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

/** The NearZoop-painted map style: Positron fetched once, repainted into
    the app palette and enriched with POI labels. Falls back to the minimal
    keyless style when the fetch fails. Shared by the picker and previews. */
export async function nzMapStyle(): Promise<StyleSpecification> {
  try {
    const res = await fetch(POSITRON_URL, { signal: AbortSignal.timeout(5000) })
    if (!res.ok) throw new Error(String(res.status))
    return enrich(repaint((await res.json()) as StyleSpecification))
  } catch {
    return MINIMAL_STYLE
  }
}

export default function MaplibrePicker({ onPick, onMoved }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    let cancelled = false
    let map: MLMap | null = null

    const start = cachedCoords()

    void (async () => {
      const style = await nzMapStyle()
      if (cancelled) return

      const created = new MLMap({
        container: host,
        style,
        // MapLibre order: [lng, lat].
        center: start ? [start.lng, start.lat] : [FALLBACK_FIX.lng, FALLBACK_FIX.lat],
        zoom: INITIAL_ZOOM,
        attributionControl: false,
      })
      map = created
      created.addControl(new AttributionControl({ compact: false }))

      const report = () => {
        const center = created.getCenter()
        void resolveAddress(center.lat, center.lng).then((address) => {
          if (!cancelled) onPick({ lat: center.lat, lng: center.lng, address })
        })
      }
      report()
      created.on('moveend', report)
      created.on('dragstart', onMoved)

      // No cached fix (e.g. splash was skipped) — ask once, quietly.
      if (!start && 'geolocation' in navigator) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            created.jumpTo({
              center: [position.coords.longitude, position.coords.latitude],
              zoom: INITIAL_ZOOM,
            })
          },
          () => undefined,
          { timeout: 6000, enableHighAccuracy: false, maximumAge: 300000 },
        )
      }
    })()

    return () => {
      cancelled = true
      map?.remove()
    }
    // onPick only touches state setters — the mount-once effect is safe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return <div ref={hostRef} className="biz-map-canvas" />
}
