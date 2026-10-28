import { useEffect, useRef, useState } from 'react'
import logoUrl from '../assets/logo.svg'

type Coords = { lat: number; lng: number }

type Props = {
  /** Called only when location permission is granted. */
  onProceed: (coords?: Coords) => void
}

/** Splash asks for location access once its hold timer runs out. */
type Phase = 'hold' | 'locating' | 'blocked'

type BlockReason = 'denied' | 'unavailable' | 'timeout'

const HOLD_STATUS: Record<Exclude<Phase, 'blocked'>, string> = {
  hold: 'Restoring Gariahat · 2 km',
  locating: 'Finding your para…',
}

const BLOCK_TEXT: Record<BlockReason, string> = {
  denied: 'Permission denied',
  unavailable: 'Location unavailable',
  timeout: 'Location timed out',
}

function Splash({ onProceed }: Props) {
  const [phase, setPhase] = useState<Phase>('hold')
  const [reason, setReason] = useState<BlockReason>('denied')
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
          onProceed(coords)
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
          <p className="splash-tagline">Offers in your para, right now.</p>
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
        <p className="splash-tagline">Offers in your para, right now.</p>
      </div>

      <footer className="splash-status" role="status">
        <span className="splash-spinner" aria-hidden="true" />
        <span>{HOLD_STATUS[phase]}</span>
      </footer>
    </main>
  )
}

export default Splash
