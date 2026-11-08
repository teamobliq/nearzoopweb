/// <reference types="google.maps" />
/** Google Maps engine for the location step — same card, same DOM pin, same
    palette as the MapLibre engine. The NearZoop look is applied through
    Google's styled-maps JSON (featureType/elementType selectors): tan land,
    deeper-tan buildings, white roads with tan casings, green parks, blue
    water, olive labels on cream halos. Business names stay as text while
    POI icons are dropped, keeping the design's typographic map. Needs
    VITE_GMAPS_KEY; if Google fails to load (bad key, blocked network) the
    shell falls back to the MapLibre engine. Reverse geocoding stays on
    keyless Nominatim for both engines. */

import { useEffect, useRef } from 'react'
import { cachedCoords, FALLBACK_FIX, resolveAddress, type LocationFix } from './geocode'
import { NZ_GOOGLE_STYLE, loadGoogleMaps } from './googleMaps'

type Props = {
  apiKey: string
  /** Fires once on load and after every pan/zoom settles. */
  onPick: (fix: LocationFix) => void
  /** First drag — the shell hides the "drag the map" tip. */
  onMoved: () => void
  /** Google failed to load — the shell switches to MapLibre. */
  onFail: () => void
}

const INITIAL_ZOOM = 17

export default function GooglePicker({ apiKey, onPick, onMoved, onFail }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    let cancelled = false
    let failed = false
    let map: google.maps.Map | null = null

    const fail = () => {
      if (!cancelled && !failed) {
        failed = true
        onFail()
      }
    }

    void loadGoogleMaps(apiKey)
      .then(() => {
        if (cancelled) return
        const start = cachedCoords()
        map = new google.maps.Map(host, {
          center: start ?? { ...FALLBACK_FIX },
          zoom: INITIAL_ZOOM,
          styles: NZ_GOOGLE_STYLE,
          disableDefaultUI: true,
          gestureHandling: 'greedy',
          clickableIcons: false,
          backgroundColor: '#ecdcba',
        })

        const report = () => {
          const center = map?.getCenter()
          if (!center) return
          const lat = center.lat()
          const lng = center.lng()
          void resolveAddress(lat, lng).then((address) => {
            if (!cancelled) onPick({ lat, lng, address })
          })
        }
        // idle fires after the initial render and after every pan/zoom
        // settles — Google's equivalent of MapLibre's moveend.
        map.addListener('idle', report)
        map.addListener('dragstart', () => onMoved())

        // No cached fix (e.g. splash was skipped) — ask once, quietly.
        if (!start && 'geolocation' in navigator) {
          navigator.geolocation.getCurrentPosition(
            (position) => {
              map?.setCenter({
                lat: position.coords.latitude,
                lng: position.coords.longitude,
              })
            },
            () => undefined,
            { timeout: 6000, enableHighAccuracy: false, maximumAge: 300000 },
          )
        }
      })
      .catch(fail)

    return () => {
      cancelled = true
      if (map) google.maps.event.clearInstanceListeners(map)
      map = null
    }
    // Handlers only touch state setters — the mount-once effect is safe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey])

  return <div ref={hostRef} className="biz-map-canvas" />
}
