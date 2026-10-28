/** The location step's map card. Owns the shared chrome — rounded card, the
    red centre pin, the drag tip — and picks the engine: Google Maps when
    VITE_GMAPS_KEY is set (falling back to MapLibre if Google fails to load),
    MapLibre over keyless OpenFreeMap otherwise. Both engines report the same
    LocationFix — the centre fix plus a Nominatim street address — so the
    setup wizard never knows which one is underneath. */

import { useCallback, useState } from 'react'
import GooglePicker from './GooglePicker'
import MaplibrePicker from './MaplibrePicker'
import type { LocationFix } from './geocode'

export type { LocationFix } from './geocode'

type Props = {
  /** Fires once on load and after every drag/zoom settles. */
  onPick: (fix: LocationFix) => void
}

const GMAPS_KEY = import.meta.env.VITE_GMAPS_KEY as string | undefined

export default function LocationPicker({ onPick }: Props) {
  const [moved, setMoved] = useState(false)
  const [engine, setEngine] = useState<'google' | 'maplibre'>(() =>
    GMAPS_KEY ? 'google' : 'maplibre',
  )
  const handleMoved = useCallback(() => setMoved(true), [])
  const handleGoogleFail = useCallback(() => setEngine('maplibre'), [])

  return (
    <div className="biz-map">
      {engine === 'google' && GMAPS_KEY ? (
        <GooglePicker
          apiKey={GMAPS_KEY}
          onPick={onPick}
          onMoved={handleMoved}
          onFail={handleGoogleFail}
        />
      ) : (
        <MaplibrePicker onPick={onPick} onMoved={handleMoved} />
      )}

      <span className="biz-pin" aria-hidden="true">
        <svg viewBox="0 0 48 58">
          <path
            d="M24 54C33 43.5 38 32.5 38 21A14 14 0 1 0 10 21c0 11.5 5 22.5 14 33Z"
            fill="#fb4b32"
            stroke="#1c1b19"
            strokeWidth="3.5"
            strokeLinejoin="round"
          />
          <circle cx="24" cy="21" r="6.5" fill="#ffffff" />
        </svg>
      </span>
      {!moved && <p className="biz-pintip">Drag map so the pin sits on your door</p>}
    </div>
  )
}
