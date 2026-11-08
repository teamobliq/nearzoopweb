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
} from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { cachedCoords, FALLBACK_FIX, resolveAddress, type LocationFix } from './geocode'
import { nzMapStyle } from './maplibreUtils'
import { useMapRetry, watchMapFailure } from './mapResilience'
import { MapFailure } from './MapFailure'

type Props = {
  /** Fires once on load and after every drag/zoom settles. */
  onPick: (fix: LocationFix) => void
  /** First drag — the shell hides the "drag the map" tip. */
  onMoved: () => void
}

const INITIAL_ZOOM = 17

export default function MaplibrePicker({ onPick, onMoved }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const loadedRef = useRef(false)
  const { attempt, failed, fail, retry } = useMapRetry()

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    let cancelled = false
    let map: MLMap | null = null
    loadedRef.current = false

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
      watchMapFailure(created, () => loadedRef.current, fail)
      created.on('load', () => {
        loadedRef.current = true
      })

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
    // `attempt` re-builds the picker after the failure overlay's retry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt])

  return (
    <div ref={hostRef} className="biz-map-canvas">
      {failed && <MapFailure onRetry={retry} />}
    </div>
  )
}
