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
} from 'maplibre-gl'
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import 'maplibre-gl/dist/maplibre-gl.css'
import { cachedCoords, FALLBACK_FIX, resolveAddress, type LocationFix } from './geocode'
import { nzMapStyle } from './maplibreUtils'

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
