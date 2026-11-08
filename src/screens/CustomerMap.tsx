/** Shared customer-side map canvas: the NearZoop-painted MapLibre style
    with the search-radius circle, the user's dot, and — when the parent
    passes them — the offer pins inside the radius. The Locate step uses
    it to set the fix; the Home screen browses on it. Owns no location
    state — the parent passes the fix and radius, and bumps `fitKey`
    whenever the view should re-frame around the circle. */

import { useEffect, useRef, useState } from 'react'
import {
  AttributionControl,
  Map as MLMap,
  Marker,
  type GeoJSONSource,
} from 'maplibre-gl'
import { nzMapStyle } from '../business/maplibreUtils'
import { useMapRetry, watchMapFailure } from '../business/mapResilience'
import { MapFailure } from '../business/MapFailure'
import GoogleCustomerMap from '../business/GoogleCustomerMap'
import { FALLBACK_FIX } from '../business/geocode'
import type { Coords, MapPin } from './mapUtils'

/** Source ids for the radius circle, the user dot and the offer pins. */
const RADIUS_SRC = 'nz-cust-radius'
const DOT_SRC = 'nz-cust-dot'

type PointGeom = { type: 'Point'; coordinates: [number, number] }
type PolyGeom = { type: 'Polygon'; coordinates: Array<Array<[number, number]>> }
type GeoFeature = {
  type: 'Feature'
  properties: Record<string, string | number | undefined>
  geometry: PointGeom | PolyGeom
}
type GeoCollection = { type: 'FeatureCollection'; features: GeoFeature[] }

const EMPTY_COLLECTION: GeoCollection = { type: 'FeatureCollection', features: [] }

/** A 65-point ring approximating a `km`-radius circle around the fix —
    flat-earth degrees are plenty accurate at ≤10 km. */
function circleRing(center: Coords, km: number): Array<[number, number]> {
  const dLat = km / 111.32
  const dLng =
    km / (111.32 * Math.max(Math.cos((center.lat * Math.PI) / 180), 0.01))
  const ring: Array<[number, number]> = []
  for (let i = 0; i <= 64; i += 1) {
    const angle = (i / 64) * Math.PI * 2
    ring.push([
      center.lng + dLng * Math.cos(angle),
      center.lat + dLat * Math.sin(angle),
    ])
  }
  return ring
}

function circleData(center: Coords | null, km: number): GeoCollection {
  if (!center) return EMPTY_COLLECTION
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {},
        geometry: { type: 'Polygon', coordinates: [circleRing(center, km)] },
      },
    ],
  }
}

function dotData(center: Coords | null): GeoCollection {
  if (!center) return EMPTY_COLLECTION
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {},
        geometry: { type: 'Point', coordinates: [center.lng, center.lat] },
      },
    ],
  }
}

type Props = {
  fix: Coords | null
  radiusKm: number
  /** Bump to re-frame the view around the radius circle. */
  fitKey: number
  /** Class for the host div — the parent sizes and positions it. */
  className: string
  /** Offer pins to drop inside the view (the public feed's mirrors). */
  pins?: MapPin[]
  /** A pin was tapped. */
  onSelectPin?: (id: string) => void
  /** Corner for the OSM attribution — kept clear of each screen's own
      overlays: Locate's status banner sits bottom-left/right on phones, and
      Home's location chip owns the top edge, so both screens avoid those
      corners rather than letting the credit land under their chrome. */
  attributionCorner?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
}

/** Engine switch, mirroring the merchant location step's picker:
    Google Maps when VITE_GMAPS_KEY is set, the MapLibre engine —
    keyless OpenFreeMap with a retry overlay when the tile host can't be
    reached — otherwise, and permanently once Google fails to load. */
const GMAPS_KEY = import.meta.env.VITE_GMAPS_KEY as string | undefined

export default function CustomerMap(props: Props) {
  const [googleFailed, setGoogleFailed] = useState(false)
  if (GMAPS_KEY && !googleFailed) {
    return <GoogleCustomerMap {...props} onFail={() => setGoogleFailed(true)} />
  }
  return <MapLibreCustomerMap {...props} />
}

function MapLibreCustomerMap({
  fix,
  radiusKm,
  fitKey,
  className,
  pins = [],
  onSelectPin,
  attributionCorner = 'top-right',
}: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<MLMap | null>(null)
  const markersRef = useRef<Map<string, Marker>>(new Map())
  const loadedRef = useRef(false)
  const [ready, setReady] = useState(false)
  const { attempt, failed, fail, retry } = useMapRetry()
  // Latest props without re-creating the map — load and effects read here.
  const liveRef = useRef({
    fix,
    radiusKm,
    pins,
    onSelectPin,
  })
  useEffect(() => {
    liveRef.current = { fix, radiusKm, pins, onSelectPin }
  })

  /** Reconcile the DOM offer chips with the current pin set: add new ones,
      drop removed ones, refresh position + selected state. */
  function syncMarkers(
    map: MLMap,
    next: MapPin[],
    onSelect?: (id: string) => void,
  ): void {
    const markers = markersRef.current
    const wanted = new Set(next.map((p) => p.id))
    for (const [id, marker] of markers) {
      if (!wanted.has(id)) {
        marker.remove()
        markers.delete(id)
      }
    }
    for (const pin of next) {
      const existing = markers.get(pin.id)
      if (existing) {
        existing.setLngLat([pin.lng, pin.lat])
        const el = existing.getElement()
        el.className = `biz-map-pin${pin.selected ? ' is-sel' : ''}`
        el.textContent = pin.label ?? ''
      } else {
        const el = document.createElement('div')
        el.className = `biz-map-pin${pin.selected ? ' is-sel' : ''}`
        el.textContent = pin.label ?? ''
        el.style.cursor = 'pointer'
        el.addEventListener('click', (event) => {
          event.stopPropagation()
          onSelect?.(pin.id)
        })
        el.addEventListener('mouseenter', () => {
          map.getCanvas().style.cursor = 'pointer'
        })
        el.addEventListener('mouseleave', () => {
          map.getCanvas().style.cursor = ''
        })
        const marker = new Marker({ element: el, anchor: 'bottom' })
          .setLngLat([pin.lng, pin.lat])
          .addTo(map)
        markers.set(pin.id, marker)
      }
    }
  }

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const markers = markersRef.current
    let cancelled = false
    loadedRef.current = false

    void (async () => {
      const style = await nzMapStyle()
      if (cancelled || !hostRef.current) return

      const start = liveRef.current.fix
      const created = new MLMap({
        container: hostRef.current,
        style,
        // MapLibre order: [lng, lat].
        center: start
          ? [start.lng, start.lat]
          : [FALLBACK_FIX.lng, FALLBACK_FIX.lat],
        zoom: 12.5,
        attributionControl: false,
      })
      mapRef.current = created
      created.addControl(
        new AttributionControl({ compact: true }),
        attributionCorner,
      )

      watchMapFailure(created, () => loadedRef.current, fail)
      created.on('load', () => {
        if (cancelled) return
        loadedRef.current = true
        created.addSource(RADIUS_SRC, {
          type: 'geojson',
          data: circleData(liveRef.current.fix, liveRef.current.radiusKm),
        })
        created.addSource(DOT_SRC, {
          type: 'geojson',
          data: dotData(liveRef.current.fix),
        })
        // Circle first so the dot paints above it.
        created.addLayer({
          id: 'nz-cust-radius-line',
          type: 'line',
          source: RADIUS_SRC,
          layout: { 'line-cap': 'round' },
          paint: {
            'line-color': '#fb4b32',
            'line-width': 3.5,
            // Dash lengths scale with line width — 2.2/1.6 widths read as
            // the design's short dashes at any zoom.
            'line-dasharray': [2.2, 1.6],
          },
        })
        created.addLayer({
          id: 'nz-cust-dot-halo',
          type: 'circle',
          source: DOT_SRC,
          paint: {
            'circle-radius': 17,
            'circle-color': '#3b7ff0',
            'circle-opacity': 0.22,
            'circle-stroke-width': 1,
            'circle-stroke-color': '#3b7ff0',
            'circle-stroke-opacity': 0.35,
          },
        })
        created.addLayer({
          id: 'nz-cust-dot',
          type: 'circle',
          source: DOT_SRC,
          paint: {
            'circle-radius': 8.5,
            'circle-color': '#3b7ff0',
            'circle-stroke-width': 2.5,
            'circle-stroke-color': '#ffffff',
          },
        })
        setReady(true)
      })
    })()

    return () => {
      cancelled = true
      for (const marker of markers.values()) marker.remove()
      markers.clear()
      mapRef.current?.remove()
      mapRef.current = null
    }
    // Mount-once effect — the props flow in through liveRef and the effects
    // below. `attempt` re-mounts the map after the failure overlay's
    // retry; everything is torn down above before re-creating.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt])

  // Push fix/radius changes into the sources once the style is loaded.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    ;(map.getSource(RADIUS_SRC) as GeoJSONSource | undefined)?.setData(
      circleData(fix, radiusKm),
    )
    ;(map.getSource(DOT_SRC) as GeoJSONSource | undefined)?.setData(dotData(fix))
  }, [ready, fix, radiusKm])

  // Sync offer chips (DOM markers) with the current pin set — selection flips
  // the chip's colour via the .is-sel class.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    syncMarkers(map, pins, liveRef.current.onSelectPin)
  }, [ready, pins])

  // Re-frame around the circle on load and on every fitKey bump — never on
  // slider drags (the circle grows live; the view only reframes on release).
  useEffect(() => {
    const map = mapRef.current
    const current = liveRef.current
    if (!map || !ready || !current.fix) return
    const dLat = current.radiusKm / 111.32
    const dLng =
      current.radiusKm /
      (111.32 * Math.max(Math.cos((current.fix.lat * Math.PI) / 180), 0.01))
    map.fitBounds(
      [
        [current.fix.lng - dLng, current.fix.lat - dLat],
        [current.fix.lng + dLng, current.fix.lat + dLat],
      ],
      { padding: 64, duration: 650 },
    )
    // fitKey intentionally drives this effect — see comment above.
  }, [ready, fitKey])

  return (
    <div ref={hostRef} className={className}>
      {failed && <MapFailure onRetry={retry} />}
    </div>
  )
}
