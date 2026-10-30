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
import { nzMapStyle } from '../business/MaplibrePicker'
import { FALLBACK_FIX } from '../business/geocode'

export type Coords = { lat: number; lng: number }

/** One offer pin on the customer map. */
export type MapPin = {
  id: string
  lat: number
  lng: number
  selected?: boolean
  /** Discount label shown on the map chip (e.g. "40%"). */
  label?: string
}

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

/** "2 km" / "2.5 km" — the Locate slider's value and Home's location chip
    share it so the two screens always say the radius the same way. */
export function fmtKm(km: number): string {
  const value = Math.round(km * 2) / 2
  return `${value % 1 === 0 ? String(value) : value.toFixed(1)} km`
}

/** One fresh high-accuracy GPS fix, no cache. Resolves null when the
    device, the network or the permission says no — callers show their own
    honest failure state. */
export function requestFix(): Promise<{
  coords: Coords
  accuracy: number
} | null> {
  return new Promise((resolve) => {
    if (!('geolocation' in navigator)) return resolve(null)
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          coords: {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          },
          accuracy: position.coords.accuracy,
        }),
      () => resolve(null),
      { timeout: 12000, enableHighAccuracy: true, maximumAge: 0 },
    )
  })
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
      overlays (Locate's map is bare; Home's chip sits top-left). */
  attributionCorner?: 'top-right' | 'bottom-right'
}

export default function CustomerMap({
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
  const [ready, setReady] = useState(false)
  // Latest props without re-creating the map — load and effects read here.
  const liveRef = useRef({
    fix,
    radiusKm,
    pins,
    onSelectPin,
  })
  liveRef.current = { fix, radiusKm, pins, onSelectPin }

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
    let cancelled = false

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

      created.on('load', () => {
        if (cancelled) return
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
      for (const marker of markersRef.current.values()) marker.remove()
      markersRef.current.clear()
      mapRef.current?.remove()
      mapRef.current = null
    }
    // Mount-once effect — the props flow in through liveRef and the effects
    // below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, fitKey])

  return <div ref={hostRef} className={className} />
}
