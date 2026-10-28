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

type Props = {
  apiKey: string
  /** Fires once on load and after every pan/zoom settles. */
  onPick: (fix: LocationFix) => void
  /** First drag — the shell hides the "drag the map" tip. */
  onMoved: () => void
  /** Google failed to load — the shell switches to MapLibre. */
  onFail: () => void
}

/** The design's map palette in Google's styling vocabulary. Label fill and
    stroke are always set together — Google varies them by zoom otherwise. */
const NZ_STYLE: google.maps.MapTypeStyle[] = [
  // Base: tan land, cream label halos, olive label ink.
  { elementType: 'geometry', stylers: [{ color: '#ecdcba' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#fff8e6' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#7c6b4d' }] },
  // Administrative borders: olive.
  {
    featureType: 'administrative',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#b3a37e' }],
  },
  // Buildings (man-made structures): deeper tan, readable against the land.
  {
    featureType: 'landscape.man_made',
    elementType: 'geometry',
    stylers: [{ color: '#e2cfa6' }],
  },
  { featureType: 'landscape.natural', elementType: 'geometry', stylers: [{ color: '#ecdcba' }] },
  {
    featureType: 'landscape.natural.landcover',
    elementType: 'geometry',
    stylers: [{ color: '#ecdcba' }],
  },
  // Points of interest: soft tan parcels, parks green, icons off — names only.
  { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#e4d2ac' }] },
  { featureType: 'poi', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#d4eac2' }] },
  { featureType: 'poi.park', elementType: 'labels.text.fill', stylers: [{ color: '#7c6b4d' }] },
  { featureType: 'poi.business', elementType: 'labels.text.fill', stylers: [{ color: '#6b5b3e' }] },
  // Roads: white fills with tan casings.
  { featureType: 'road', elementType: 'geometry.fill', stylers: [{ color: '#ffffff' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#d9c49b' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#8a7a5b' }] },
  // Rail and transit: tan lines, no icons.
  { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#cdbd93' }] },
  { featureType: 'transit', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit.station', elementType: 'labels.text.fill', stylers: [{ color: '#8a7a5b' }] },
  // Water: design blue.
  { featureType: 'water', elementType: 'geometry.fill', stylers: [{ color: '#a9d3ee' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#4f7fa8' }] },
]

const INITIAL_ZOOM = 17

/** Loads the Maps JavaScript API once per page — later mounts reuse the same
    script. Rejects on network failure, on auth failure (Google fires the
    gm_authFailure hook for bad keys) or after a 12s timeout. */
let loader: Promise<void> | null = null

function loadGoogleMaps(apiKey: string): Promise<void> {
  if (loader) return loader
  loader = new Promise<void>((resolve, reject) => {
    if (window.google?.maps) {
      resolve()
      return
    }
    const callbackName = '__nzGmapsLoaded'
    const globals = window as unknown as Record<string, unknown>
    const settle = (error?: Error) => {
      delete globals[callbackName]
      delete globals.gm_authFailure
      if (error) reject(error)
      else resolve()
    }
    globals[callbackName] = () => settle()
    globals.gm_authFailure = () => settle(new Error('Google Maps rejected the API key'))
    const script = document.createElement('script')
    script.src =
      `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}` +
      `&v=weekly&loading=async&callback=${callbackName}`
    script.async = true
    script.onerror = () => settle(new Error('Google Maps script failed to load'))
    window.setTimeout(() => settle(new Error('Google Maps took too long to load')), 12000)
    document.head.appendChild(script)
  })
  return loader
}

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
          styles: NZ_STYLE,
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
