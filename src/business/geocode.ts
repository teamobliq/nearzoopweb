/** Shared geo utilities for the location pickers — the cached fix the splash
    leaves in localStorage, the fallback fix, and Nominatim reverse geocoding.
    Both map engines (MapLibre and Google) report the same LocationFix shape,
    so the setup wizard never knows which engine is underneath. */

/** What a picker reports: the pin's fix plus its resolved address. */
export type LocationFix = {
  lat: number
  lng: number
  /** Street-level address, or null when the geocoder has no answer. */
  address: string | null
}

/** Where the map opens when nothing better is known — Gariahat, Kolkata,
    the neighbourhood the designs are drawn from. */
export const FALLBACK_FIX = { lat: 22.5186, lng: 88.3655 } as const

/** Splash caches its fix in localStorage — reuse it so the map opens where
    the merchant already is. */
export function cachedCoords(): { lat: number; lng: number } | null {
  try {
    const raw = localStorage.getItem('nz.coords')
    if (!raw) return null
    const parsed = JSON.parse(raw) as { lat?: unknown; lng?: unknown }
    if (typeof parsed.lat === 'number' && typeof parsed.lng === 'number') {
      return { lat: parsed.lat, lng: parsed.lng }
    }
    return null
  } catch {
    return null
  }
}

/** Reverse-geocodes a point into "road, area, PIN" via Nominatim
    (OpenStreetMap). Keyless, so it serves both map engines. Rate-limited to
    just over one call per second — Nominatim's public endpoint enforces that
    and a 429 also surfaces as console CORS noise. Calls that arrive too soon
    are coalesced instead of dropped: the latest coordinates win and every
    skipped caller resolves with that result, so the address always catches
    up with the pin. Returns null on any failure — the merchant types the
    address by hand in that case. */
const GEO_MIN_INTERVAL = 1100

let lastGeocodeAt = 0
let queued: {
  lat: number
  lng: number
  resolvers: Array<(value: string | null) => void>
} | null = null

async function geocodeNow(lat: number, lng: number): Promise<string | null> {
  const query = new URLSearchParams({
    format: 'jsonv2',
    lat: lat.toFixed(6),
    lon: lng.toFixed(6),
    zoom: '18',
    addressdetails: '1',
    'accept-language': 'en',
  })
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?${query.toString()}`,
      { signal: AbortSignal.timeout(4000) },
    )
    if (!res.ok) return null
    const data = (await res.json()) as {
      address?: Partial<Record<string, string>>
    }
    const parts = data.address ?? {}
    const street = [parts.house_number, parts.road]
      .filter((value) => Boolean(value))
      .join(' ')
    // Finest locality OSM has. Towns and cities matter for rural pins,
    // where OSM often has no street or suburb at all — without them the
    // line collapses to a bare postcode.
    const locality =
      parts.neighbourhood ??
      parts.suburb ??
      parts.quarter ??
      parts.hamlet ??
      parts.village ??
      parts.town ??
      parts.city ??
      parts.municipality
    // Street and locality both missing? Add the district and state so the
    // line still says where the shop is, not just its PIN.
    const region =
      street && locality
        ? null
        : [parts.state_district ?? parts.county, parts.state]
            .filter((value) => Boolean(value))
            .join(', ')
    const pin = parts.postcode
    const line = [street, locality, region, pin]
      .filter((value) => Boolean(value))
      .join(', ')
    return line || null
  } catch {
    return null
  }
}

export function resolveAddress(lat: number, lng: number): Promise<string | null> {
  const now = Date.now()
  const wait = GEO_MIN_INTERVAL - (now - lastGeocodeAt)

  if (wait <= 0 && !queued) {
    lastGeocodeAt = now
    return geocodeNow(lat, lng)
  }

  // Too soon — queue a single trailing lookup: the latest coordinates win
  // and every skipped caller resolves with that result when it runs.
  if (!queued) {
    queued = { lat, lng, resolvers: [] }
    window.setTimeout(() => {
      const job = queued
      queued = null
      if (!job) return
      lastGeocodeAt = Date.now()
      void geocodeNow(job.lat, job.lng).then((result) => {
        for (const resolve of job.resolvers) resolve(result)
      })
    }, wait)
  }
  queued.lat = lat
  queued.lng = lng
  return new Promise((resolve) => queued.resolvers.push(resolve))
}

/** Reverse-geocodes a point into a locality name (neighbourhood first,
    city as the last resort) — the short label the customer screens show
    ("Gariahat"), not the full street line. Throttled to Nominatim's
    one-call-per-second public policy on its own clock. Returns null on
    any failure — callers just skip the label. */
let lastLocalityAt = 0

export async function resolveLocalityName(
  lat: number,
  lng: number,
): Promise<string | null> {
  const wait = 1100 - (Date.now() - lastLocalityAt)
  if (wait > 0) await new Promise((resolve) => window.setTimeout(resolve, wait))
  lastLocalityAt = Date.now()
  const query = new URLSearchParams({
    format: 'jsonv2',
    lat: lat.toFixed(6),
    lon: lng.toFixed(6),
    zoom: '16',
    addressdetails: '1',
    'accept-language': 'en',
  })
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?${query.toString()}`,
      { signal: AbortSignal.timeout(4000) },
    )
    if (!res.ok) return null
    const data = (await res.json()) as {
      address?: Partial<Record<string, string>>
    }
    const parts = data.address ?? {}
    return (
      parts.neighbourhood ??
      parts.suburb ??
      parts.quarter ??
      parts.city_district ??
      parts.village ??
      parts.town ??
      parts.city ??
      null
    )
  } catch {
    return null
  }
}

/* ---- Customer location cache ----
   The customer flow (Splash → Locate → Home) shares three localStorage
   values: the fix, the chosen search radius and the locality label. These
   helpers are the single writer/reader contract for them — everything is
   JSON, and every call tolerates blocked storage. */

export function cacheCoords(coords: { lat: number; lng: number }): void {
  try {
    localStorage.setItem('nz.coords', JSON.stringify(coords))
  } catch {
    // Storage blocked — navigation still proceeds.
  }
}

/** The chosen search radius in km — snapped to the Locate slider's 0.5 km
    steps so the slider never fights a stored value. Defaults to 2. */
export function cachedRadiusKm(): number {
  try {
    const raw = localStorage.getItem('nz.radius')
    const parsed = raw === null ? NaN : Number(raw)
    if (Number.isFinite(parsed)) {
      return Math.min(10, Math.max(0.5, Math.round(parsed * 2) / 2))
    }
  } catch {
    // Storage blocked — the default stands.
  }
  return 2
}

export function cacheRadiusKm(km: number): void {
  try {
    localStorage.setItem('nz.radius', JSON.stringify(km))
  } catch {
    // Storage blocked — the radius stays session-only.
  }
}

export function cachedLocality(): string | null {
  try {
    const raw = localStorage.getItem('nz.locality')
    if (!raw) return null
    const parsed = JSON.parse(raw) as unknown
    return typeof parsed === 'string' && parsed.trim() !== '' ? parsed : null
  } catch {
    return null
  }
}

export function cacheLocality(name: string): void {
  try {
    localStorage.setItem('nz.locality', JSON.stringify(name))
  } catch {
    // Storage blocked — the label stays session-only.
  }
}

/** Great-circle distance between two points, in kilometres — the feed's
    radius filter and the cards' "1.2 km away" labels. */
export function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLng = ((b.lng - a.lng) * Math.PI) / 180
  const lat1 = (a.lat * Math.PI) / 180
  const lat2 = (b.lat * Math.PI) / 180
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}
