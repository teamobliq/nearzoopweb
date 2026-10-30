import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import CustomerMap, { fmtKm, type Coords } from './CustomerMap'
import {
  cacheCoords,
  cacheLocality,
  cacheRadiusKm,
  cachedCoords,
  cachedRadiusKm,
  resolveLocalityName,
} from '../business/geocode'
import './customer.css'

/** The location-setup step — "Where should we look for offers?" — shown
    after auth (or skip). The map up top shows the user's fix with the
    search-radius circle around it; the sheet below sets the radius and
    offers the two ways to confirm a location: a fresh GPS fix, or a manual
    locality search. Either confirmation persists the choice and hands off
    to the customer home. The design's offer pins are deliberately absent —
    Firestore rules only let a shop (or admin) read its own offers, so a
    cross-shop pin feed has no legal data source yet. */

type Props = {
  /** Confirmation either way — the flow moves on to the home screen. */
  onDone: () => void
}

/** Fixes coarser than this get the honesty banner instead of a silent,
    useless circle — past ~500 m a "2 km" radius stops saying where the
    user actually is. */
const ACCURACY_LIMIT = 500

const MIN_KM = 0.5
const MAX_KM = 10
/** "±800 m" style — metres rounded to the nearest hundred, kilometres past
    a thousand. Matches the design's accuracy banner. */
function fmtAccuracy(meters: number): string {
  if (meters >= 1000) {
    const km = meters / 1000
    return `±${km % 1 === 0 ? km.toFixed(0) : km.toFixed(1)} km`
  }
  return `±${Math.round(meters / 100) * 100} m`
}

export type SearchHit = {
  lat: number
  lng: number
  /** The locality's own name — what gets stored and shown big. */
  primary: string
  /** The rest of the address, for disambiguation. */
  secondary: string
}

let lastSearchAt = 0

/** Nominatim forward search for the manual locality picker — same one-call-
    per-second discipline as the shared reverse geocoder. */
async function searchLocalities(q: string): Promise<SearchHit[]> {
  const wait = 1100 - (Date.now() - lastSearchAt)
  if (wait > 0) await new Promise((resolve) => window.setTimeout(resolve, wait))
  lastSearchAt = Date.now()
  const query = new URLSearchParams({
    format: 'jsonv2',
    q,
    limit: '6',
    addressdetails: '1',
    'accept-language': 'en',
  })
  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?${query.toString()}`,
    { signal: AbortSignal.timeout(5000) },
  )
  if (!res.ok) throw new Error(String(res.status))
  const data = (await res.json()) as Array<{
    lat: string
    lon: string
    name?: string
    display_name: string
  }>
  return data.map((item) => {
    const primary = item.name?.trim() || item.display_name.split(',')[0].trim()
    const secondary = item.display_name
      .split(',')
      .slice(1)
      .join(',')
      .trim()
    return { lat: Number(item.lat), lng: Number(item.lon), primary, secondary }
  })
}

/** The manual locality picker — a full-screen search over Nominatim
    (OpenStreetMap, keyless). Picking a result confirms the step. */
function LocalityPicker({
  onPick,
  onClose,
}: {
  onPick: (hit: SearchHit) => void
  onClose: () => void
}) {
  const [query, setQuery] = useState('')
  // null = nothing searched yet; [] = searched and found nothing.
  const [results, setResults] = useState<SearchHit[] | null>(null)
  const [status, setStatus] = useState<'idle' | 'searching' | 'error'>('idle')
  // Response ordering guard — a slow earlier search must never overwrite
  // a newer one's results.
  const seqRef = useRef(0)

  useEffect(() => {
    const q = query.trim()
    if (q.length < 3) {
      setResults(null)
      setStatus('idle')
      return
    }
    const seq = ++seqRef.current
    setStatus('searching')
    // Debounce past Nominatim's one-call-per-second comfort zone.
    const timer = window.setTimeout(() => {
      searchLocalities(q)
        .then((hits) => {
          if (seqRef.current !== seq) return
          setResults(hits)
          setStatus('idle')
        })
        .catch(() => {
          if (seqRef.current !== seq) return
          setStatus('error')
        })
    }, 650)
    return () => window.clearTimeout(timer)
  }, [query])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="loc-pick" role="dialog" aria-modal="true" aria-label="Choose a locality">
      <div className="loc-pick-card">
        <header className="loc-pick-head">
          <button
            type="button"
            className="loc-pick-back"
            onClick={onClose}
            aria-label="Back to the map"
          >
            <BackSvg />
          </button>
          <h2>Choose a locality</h2>
        </header>
        <div className="loc-searchrow">
          <SearchSvg />
          <input
            /* eslint-disable-next-line jsx-a11y/no-autofocus */
            autoFocus
            type="text"
            placeholder="Locality, city or PIN code"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          {query !== '' && (
            <button
              type="button"
              className="loc-pick-clear"
              onClick={() => setQuery('')}
              aria-label="Clear search"
            >
              ×
            </button>
          )}
        </div>
        <ul className="loc-results">
          {status === 'searching' && (
            <li className="loc-pick-status" role="status">
              Searching…
            </li>
          )}
          {status === 'error' && (
            <li className="loc-pick-status" role="alert">
              Search failed — check your connection.
            </li>
          )}
          {status === 'idle' && results !== null && results.length === 0 && (
            <li className="loc-pick-status">
              No matches. Try a nearby town or a PIN code.
            </li>
          )}
          {results?.map((hit, index) => (
            <li key={`${hit.lat},${hit.lng},${index}`}>
              <button type="button" className="loc-hit" onClick={() => onPick(hit)}>
                <span className="loc-hit-primary">{hit.primary}</span>
                <span className="loc-hit-secondary">{hit.secondary}</span>
              </button>
            </li>
          ))}
        </ul>
        <p className="loc-pick-fine">Place data © OpenStreetMap contributors.</p>
      </div>
    </div>
  )
}

function CrosshairSvg() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="5.5" />
      <circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none" />
      <path d="M12 2.5v3.2M12 18.3v3.2M2.5 12h3.2M18.3 12h3.2" />
    </svg>
  )
}

function SearchSvg() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
      <circle cx="11" cy="11" r="6.5" />
      <path d="m20 20-4.4-4.4" />
    </svg>
  )
}

function BackSvg() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M15 5l-7 7 7 7" />
    </svg>
  )
}

export { BackSvg }

export default function Locate({ onDone }: Props) {
  // Splash's cached fix opens the map in the right neighbourhood instantly;
  // the quiet re-fix below refreshes it and measures accuracy.
  const [fix, setFix] = useState<Coords | null>(() => cachedCoords())
  const [accuracy, setAccuracy] = useState<number | null>(null)
  const [fixState, setFixState] = useState<'idle' | 'fixing' | 'denied' | 'failed'>('idle')
  const [radiusKm, setRadiusKm] = useState<number>(cachedRadiusKm)
  const [picking, setPicking] = useState(false)
  const [fitKey, setFitKey] = useState(0)
  // One confirmation per screen life — a double-tap must not hand off twice.
  const finishedRef = useRef(false)

  const fixing = fixState === 'fixing'

  /** Runs a fresh high-accuracy fix. With `confirm`, an accurate fix also
      hands off — the button and the banner's Retry both mean "use my
      location". A coarse fix stays and explains itself instead. */
  function runFix(confirm: boolean) {
    if (fixing || finishedRef.current) return
    if (!('geolocation' in navigator)) {
      setFixState('failed')
      return
    }
    setFixState('fixing')
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (finishedRef.current) return
        const coords = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        }
        const measured = position.coords.accuracy
        setFix(coords)
        setAccuracy(measured)
        cacheCoords(coords)
        if (measured > ACCURACY_LIMIT) {
          // Usable but coarse — re-frame, show the banner, stay on the step.
          setFixState('idle')
          setFitKey((key) => key + 1)
          return
        }
        setFixState('idle')
        void resolveLocalityName(coords.lat, coords.lng).then((name) => {
          if (name) cacheLocality(name)
        })
        if (confirm) finish()
      },
      (error) => {
        if (finishedRef.current) return
        setFixState(
          error.code === error.PERMISSION_DENIED ? 'denied' : 'failed',
        )
      },
      { timeout: 12000, enableHighAccuracy: true, maximumAge: 0 },
    )
  }

  // First paint quietly re-fixes — splash's cached coords can be minutes
  // old, and its fix was low accuracy by design. Never advances on its own.
  useEffect(() => {
    runFix(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function finish() {
    if (finishedRef.current) return
    finishedRef.current = true
    // Let the map's fly-to play before the next screen takes over.
    window.setTimeout(onDone, 850)
  }

  function pickLocality(hit: SearchHit) {
    if (finishedRef.current) return
    const coords = { lat: hit.lat, lng: hit.lng }
    setFix(coords)
    setAccuracy(null)
    cacheCoords(coords)
    cacheLocality(hit.primary)
    setPicking(false)
    setFitKey((key) => key + 1)
    finish()
  }

  /** Slider drag — the circle follows live; release persists and reframes. */
  function commitRadius() {
    cacheRadiusKm(radiusKm)
    setFitKey((key) => key + 1)
  }

  const banner: { text: string; retry: boolean } | null =
    fixState === 'fixing'
      ? // A fix in flight silences the previous attempt's complaint —
        // the button's "Locating…" is the only status while working.
        null
      : fixState === 'denied'
        ? {
            text: 'Location is turned off for this site. Pick a locality to look around.',
            retry: false,
          }
        : fixState === 'failed'
          ? {
              text: 'Couldn’t get a fix right now. Try again or pick a locality.',
              retry: true,
            }
          : accuracy !== null && accuracy > ACCURACY_LIMIT
            ? {
                text: `Couldn’t get an accurate fix (${fmtAccuracy(accuracy)}). Try again or pick a locality.`,
                retry: true,
              }
            : null

  const pct = ((radiusKm - MIN_KM) / (MAX_KM - MIN_KM)) * 100

  return (
    <main className="loc">
      <section className="loc-map" aria-label="Map of your area">
        <CustomerMap fix={fix} radiusKm={radiusKm} fitKey={fitKey} className="loc-canvas" />
        <div className="loc-brand">
          <span className="loc-brand-mark" aria-hidden="true">
            Z
          </span>
          <span className="loc-brand-name">NearZoop</span>
        </div>
        {banner && (
          <div className="loc-banner" role="status">
            <CrosshairSvg />
            <p>{banner.text}</p>
            {banner.retry && (
              <button
                type="button"
                className="loc-banner-retry"
                onClick={() => runFix(true)}
              >
                Retry.
              </button>
            )}
          </div>
        )}
      </section>

      <section className="loc-sheet">
        <div className="loc-panelbrand">
          <span className="loc-brand-mark" aria-hidden="true">
            Z
          </span>
          <span className="loc-brand-name">NearZoop</span>
        </div>
        <p className="loc-eyebrow">Step 1 of 1</p>
        <h1 className="loc-title">Where should we look for offers?</h1>
        <p className="loc-sub">
          We use your location only while the app is open. Never in the
          background.
        </p>

        <div className="loc-radiusrow">
          <label className="loc-radiuslabel" htmlFor="loc-radius">
            Search radius
          </label>
          <span className="loc-radiusvalue">{fmtKm(radiusKm)}</span>
        </div>
        <input
          id="loc-radius"
          className="loc-slider"
          type="range"
          min={MIN_KM}
          max={MAX_KM}
          step={0.5}
          value={radiusKm}
          style={{ '--pct': `${pct}%` } as CSSProperties}
          onChange={(event) => setRadiusKm(Number(event.target.value))}
          onPointerUp={commitRadius}
          onKeyUp={commitRadius}
        />
        <div className="loc-scale" aria-hidden="true">
          <span>0.5 KM</span>
          <span>10 KM</span>
        </div>

        <div className="loc-actions">
          <button
            type="button"
            className="btn-primary"
            disabled={fixing}
            onClick={() => runFix(true)}
          >
            <CrosshairSvg />
            {fixing ? 'Locating…' : 'Use my current location'}
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setPicking(true)}
          >
            <SearchSvg />
            Choose a locality manually
          </button>
        </div>
      </section>

      {picking && (
        <LocalityPicker onPick={pickLocality} onClose={() => setPicking(false)} />
      )}
    </main>
  )
}
