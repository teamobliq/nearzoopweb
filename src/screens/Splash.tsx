import { useEffect, useRef, useState } from 'react'
import logoUrl from '../assets/logo.svg'

type Coords = { lat: number; lng: number }

type Props = {
  /** Called only when location permission is granted. */
  onProceed: (coords?: Coords) => void
}

/** Splash asks for location access once its hold timer runs out. */
type Phase = 'hold' | 'locating' | 'found' | 'blocked'

type BlockReason = 'denied' | 'unavailable' | 'timeout'

/** Both pre-block phases read the same: the locality isn't known yet. */
const STATUS_TEXT = 'Finding your locality…'

/** Reverse-geocodes the fix into a locality name via Nominatim (OpenStreetMap,
    free and keyless). Narrowest area first, city as the last resort. Fails
    silently — the celebration then shows a plain "Location found". */
async function resolveLocality(
  coords: Coords,
  onName: (name: string) => void,
): Promise<void> {
  const query = new URLSearchParams({
    format: 'jsonv2',
    lat: coords.lat.toFixed(6),
    lon: coords.lng.toFixed(6),
    zoom: '16',
    addressdetails: '1',
    'accept-language': 'en',
  })
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?${query.toString()}`,
      { signal: AbortSignal.timeout(4000) },
    )
    if (!res.ok) return
    const data = (await res.json()) as {
      address?: Partial<Record<string, string>>
    }
    const parts = data.address ?? {}
    const name =
      parts.neighbourhood ??
      parts.suburb ??
      parts.quarter ??
      parts.city_district ??
      parts.village ??
      parts.town ??
      parts.city
    if (name) onName(name)
  } catch {
    // Offline, slow, or blocked — the tick still celebrates without a name.
  }
}

const BLOCK_TEXT: Record<BlockReason, string> = {
  denied: 'Permission denied',
  unavailable: 'Location unavailable',
  timeout: 'Location timed out',
}

function Splash({ onProceed }: Props) {
  const [phase, setPhase] = useState<Phase>('hold')
  const [reason, setReason] = useState<BlockReason>('denied')
  const [locality, setLocality] = useState<string | null>(null)
  const [showFound, setShowFound] = useState(false)
  const asking = useRef(false)

  // Hold for a random beat (3–6 s), then ask for location access.
  useEffect(() => {
    if (phase !== 'hold') return
    const timer = window.setTimeout(() => {
      void ask()
    }, 3000 + Math.random() * 3000)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  async function ask() {
    if (asking.current) return
    asking.current = true

    setPhase('locating')

    try {
      if (!('geolocation' in navigator)) {
        setReason('unavailable')
        setPhase('blocked')
        return
      }

      // Skip the browser prompt if the site is already blocked/allowed.
      try {
        const permission = await navigator.permissions.query({ name: 'geolocation' })
        if (permission.state === 'denied') {
          setReason('denied')
          setPhase('blocked')
          return
        }
      } catch {
        // Permissions API not available — fall through to the prompt path.
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          const coords: Coords = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          }
          try {
            // Cache for the upcoming location/map screens.
            localStorage.setItem('nz.coords', JSON.stringify(coords))
          } catch {
            // Storage blocked — navigation still proceeds.
          }
          asking.current = false
          // Celebrate the fix: arc morphs to the tick, the locality name
          // resolves in the background, then hand over to the next screen.
          setPhase('found')
          void resolveLocality(coords, setLocality)
          window.setTimeout(() => setShowFound(true), 900)
          window.setTimeout(() => onProceed(coords), 2300)
        },
        (error) => {
          asking.current = false
          setReason(
            error.code === error.POSITION_UNAVAILABLE
              ? 'unavailable'
              : error.code === error.TIMEOUT
                ? 'timeout'
                : 'denied',
          )
          setPhase('blocked')
        },
        { timeout: 15000, enableHighAccuracy: false, maximumAge: 300000 },
      )
    } catch (error) {
      asking.current = false
      setReason('denied')
      setPhase('blocked')
    }
  }

  if (phase === 'blocked') {
    return (
      <main className="splash">
        <div className="splash-body">
          <img className="splash-mark" src={logoUrl} alt="NearZoop logo" />
          <h1 className="splash-title">
            <span>Near</span>
            <span>Zoop</span>
          </h1>
          <p className="splash-tagline">Offers in your locality, right now.</p>
        </div>

        <footer className="splash-status splash-status--blocked" role="status">
          <span>{BLOCK_TEXT[reason]}</span>
          {reason === 'denied' && (
            <span className="splash-hint">
              Turn location on from the icon in your address bar, then try again.
            </span>
          )}
          <button type="button" className="splash-retry" onClick={() => void ask()}>
            Try again
          </button>
        </footer>
      </main>
    )
  }

  return (
    <main className="splash">
      <div className="splash-body">
        <img className="splash-mark" src={logoUrl} alt="NearZoop logo" />
        <h1 className="splash-title">
          <span>Near</span>
          <span>Zoop</span>
        </h1>
        <p className="splash-tagline">Offers in your locality, right now.</p>
      </div>

      <footer className="splash-status" role="status">
        <span
          className={`splash-indicator${phase === 'found' ? ' is-found' : ''}`}
          aria-hidden="true"
        >
          <svg viewBox="0 0 48 48" focusable="false">
            <circle className="splash-indicator-ring" cx="24" cy="24" r="20" />
            <path className="splash-indicator-tick" d="M15 25l6.5 6.5L33 18.5" />
          </svg>
        </span>
        <span>
          {phase === 'found' && showFound
            ? locality
              ? `Location found: ${locality}`
              : 'Location found'
            : STATUS_TEXT}
        </span>
      </footer>
    </main>
  )
}

export default Splash
