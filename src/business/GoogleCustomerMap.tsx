/// <reference types="google.maps" />
/** Google Maps engine for the Locate and Home screens — the NearZoop
    styled-maps palette, the same 2 km radius ring, the same blue user dot
    and offer-pin chips as the MapLibre engine, drawn with Google's API
    instead of maplibre-gl. The shell (CustomerMap) picks this engine when
    VITE_GMAPS_KEY is set and swaps back to MapLibre if Google fails to
    load; Google's logo stays bottom-right as the Maps JS API terms
    require, so `attributionCorner` is accepted for prop parity and
    ignored. */

import { useEffect, useRef, useState } from 'react'
import {
  createHtmlPin,
  loadGoogleMaps,
  NZ_GOOGLE_STYLE,
  setPinPosition,
} from '../business/googleMaps'
import { FALLBACK_FIX } from '../business/geocode'
import type { Coords, MapPin } from '../screens/mapUtils'

type Props = {
  fix: Coords | null
  radiusKm: number
  /** Bump to re-frame the view around the radius circle. */
  fitKey: number
  className: string
  pins?: MapPin[]
  onSelectPin?: (id: string) => void
  /** Accepted for parity with the MapLibre engine; Google controls its own logo. */
  attributionCorner?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
  /** Google failed to load — the shell swaps in the MapLibre engine. */
  onFail: () => void
}

export default function GoogleCustomerMap({
  fix,
  radiusKm,
  fitKey,
  className,
  pins = [],
  onSelectPin,
  onFail,
}: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<google.maps.Map | null>(null)
  const circleRef = useRef<google.maps.Circle | null>(null)
  const dotRef = useRef<google.maps.OverlayView | null>(null)
  const pinsRef = useRef<google.maps.OverlayView[]>([])
  const [ready, setReady] = useState(false)
  // Latest props without re-creating the map — effects read here.
  const liveRef = useRef({ fix, radiusKm, pins, onSelectPin })
  useEffect(() => {
    liveRef.current = { fix, radiusKm, pins, onSelectPin }
  })

  // Mount-once: load the API, build the map, the radius ring and the dot.
  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    let cancelled = false
    const pins = pinsRef.current

    void loadGoogleMaps(import.meta.env.VITE_GMAPS_KEY as string)
      .then(() => {
        if (cancelled || !hostRef.current) return
        const live = liveRef.current
        const start = live.fix
        const map = new google.maps.Map(hostRef.current, {
          center: start ? { ...start } : { ...FALLBACK_FIX },
          zoom: 12.5,
          styles: NZ_GOOGLE_STYLE,
          disableDefaultUI: true,
          gestureHandling: 'greedy',
          clickableIcons: false,
          backgroundColor: '#ecdcba',
        })
        mapRef.current = map

        // Radius ring — google.maps.Circle takes metres (the maplibre
        // engine used GeoJSON; same semantics, no reprojection needed).
        circleRef.current = new google.maps.Circle({
          map,
          center: start ? { ...start } : { ...FALLBACK_FIX },
          radius: live.radiusKm * 1000,
          strokeColor: '#fb4b32',
          strokeWeight: 3.5,
          strokeOpacity: 1,
          fillOpacity: 0,
        })

        // User dot — a plain div overlay, same look as the maplibre canvas
        // paint (blue core, white ring, soft halo).
        dotRef.current = createHtmlPin({
          lat: start?.lat ?? FALLBACK_FIX.lat,
          lng: start?.lng ?? FALLBACK_FIX.lng,
          anchor: 'center',
          build: (el) => {
            el.style.width = '34px'
            el.style.height = '34px'
            el.style.pointerEvents = 'none'
            const halo = document.createElement('div')
            halo.style.cssText =
              'position:absolute;inset:0;border-radius:999px;' +
              'background:rgba(59,127,240,.22);border:1px solid rgba(59,127,240,.35);'
            const core = document.createElement('div')
            core.style.cssText =
              'position:absolute;top:50%;left:50%;width:17px;height:17px;' +
              'margin:-8.5px 0 0 -8.5px;border-radius:999px;background:#3b7ff0;' +
              'border:2.5px solid #ffffff;box-shadow:0 1px 2px rgba(0,0,0,.25);'
            el.append(halo, core)
          },
        })
        dotRef.current.setMap(map)
        setReady(true)
      })
      .catch(() => {
        if (!cancelled) onFail()
      })

    return () => {
      cancelled = true
      for (const pin of pins) pin.setMap(null)
      pins.length = 0
      dotRef.current?.setMap(null)
      dotRef.current = null
      circleRef.current?.setMap(null)
      circleRef.current = null
      if (mapRef.current) google.maps.event.clearInstanceListeners(mapRef.current)
      mapRef.current = null
    }
    // Mount-once effect — props flow in through liveRef; onFail only arms
    // the parent's engine switch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Push fix/radius changes into the circle and the dot once the map is up.
  useEffect(() => {
    if (!ready) return
    const center = fix ? { lat: fix.lat, lng: fix.lng } : null
    if (center) {
      circleRef.current?.setCenter(center)
      setPinPosition(dotRef.current as google.maps.OverlayView, center.lat, center.lng)
    }
    circleRef.current?.setRadius(radiusKm * 1000)
  }, [ready, fix, radiusKm])

  // Sync the offer chips with the current pin set.
  useEffect(() => {
    if (!ready || !mapRef.current) return
    const map = mapRef.current
    const onSelect = liveRef.current.onSelectPin
    for (const pin of pinsRef.current) pin.setMap(null)
    pinsRef.current = pins.map((pin) => {
      const overlay = createHtmlPin({
        lat: pin.lat,
        lng: pin.lng,
        anchor: 'bottom',
        build: (el) => {
          el.className = `biz-map-pin${pin.selected ? ' is-sel' : ''}`
          el.textContent = pin.label ?? ''
          el.style.cursor = 'pointer'
          el.addEventListener('click', (event) => {
            event.stopPropagation()
            onSelect?.(pin.id)
          })
        },
      })
      overlay.setMap(map)
      return overlay
    })
  }, [ready, pins])

  // Re-frame around the radius circle on fitKey bumps — never on slider
  // drags (the circle grows live; the view only reframes on release).
  useEffect(() => {
    const map = mapRef.current
    const current = liveRef.current
    if (!map || !ready || !current.fix) return
    const dLat = current.radiusKm / 111.32
    const dLng =
      current.radiusKm /
      (111.32 * Math.max(Math.cos((current.fix.lat * Math.PI) / 180), 0.01))
    map.fitBounds(
      new google.maps.LatLngBounds(
        { lat: current.fix.lat - dLat, lng: current.fix.lng - dLng },
        { lat: current.fix.lat + dLat, lng: current.fix.lng + dLng },
      ),
      64,
    )
    // fitKey intentionally drives this effect — see comment above.
  }, [ready, fitKey])

  // nz-gm-host: Google never adds .maplibregl-map to its host, so the
  // chained .maplibregl-map rules that size the MapLibre canvas don't
  // apply — the host needs its own height or the map renders into a
  // zero-pixel box.
  return (
    <div
      ref={hostRef}
      className={`${className} nz-gm-host`}
      role="region"
      aria-label="Map of your area"
    />
  )
}
