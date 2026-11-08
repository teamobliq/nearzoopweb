/// <reference types="google.maps" />
/** Google Maps engine for the static single-pin previews (the shop card
    on the offer page, the shop profile header, the offer-create preview).
    Display-only: no pan, zoom, rotate or keyboard focus. Same NearZoop
    styled-maps palette as the interactive engines; falls back to MapLibre
    in the shell that mounts this if Google fails to load. */

import { useEffect, useRef } from 'react'
import {
  createHtmlPin,
  loadGoogleMaps,
  NZ_GOOGLE_STYLE,
} from './googleMaps'

type Props = {
  lat: number
  lng: number
  className?: string
  zoom?: number
  /** Text chip instead of the teardrop (the offer-create preview shows a
      deal label); paired with the consumer's pin class. */
  pinLabel?: string
  pinClassName?: string
  /** Google failed to load — the shell swaps in the MapLibre engine. */
  onFail: () => void
}

export default function GooglePinMap({ lat, lng, className, zoom = 14.6, pinLabel, pinClassName, onFail }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    let cancelled = false
    let map: google.maps.Map | null = null
    let pin: google.maps.OverlayView | null = null

    void loadGoogleMaps(import.meta.env.VITE_GMAPS_KEY as string)
      .then(() => {
        if (cancelled || !hostRef.current) return
        map = new google.maps.Map(hostRef.current, {
          center: { lat, lng },
          zoom,
          styles: NZ_GOOGLE_STYLE,
          disableDefaultUI: true,
          clickableIcons: false,
          // Display-only — same intent as the maplibre engine's
          // interactive:false.
          gestureHandling: 'none',
          backgroundColor: '#ecdcba',
        })
        pin = createHtmlPin({
          lat,
          lng,
          anchor: 'bottom',
          build: (el) => {
            if (pinLabel !== undefined) {
              el.className = pinClassName ?? 'biz-map-pin'
              el.textContent = pinLabel
              return
            }
            el.className = pinClassName ?? 'shop-map-pin'
            el.innerHTML =
              '<svg viewBox="0 0 32 40" width="30" height="38" aria-hidden="true">' +
              '<path d="M16 38.5S2.5 24.2 2.5 15.2C2.5 7.9 8.5 2 16 2s13.5 5.9 13.5 13.2C29.5 24.2 16 38.5 16 38.5Z" fill="#fb4b32" stroke="#1c1b19" stroke-width="2.2"/>' +
              '<circle cx="16" cy="15" r="4.3" fill="#ffffff"/>' +
              '</svg>'
          },
        })
        pin.setMap(map)
      })
      .catch(() => {
        if (!cancelled) onFail()
      })

    return () => {
      cancelled = true
      pin?.setMap(null)
      if (map) google.maps.event.clearInstanceListeners(map)
      map = null
    }
    // Handlers only mount the engine — one pin, fixed framing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lng, zoom])

  return <div ref={hostRef} className={className} role="region" aria-label="Map of the shop location" />
}
