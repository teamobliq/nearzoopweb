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
    const area =
      parts.neighbourhood ?? parts.suburb ?? parts.quarter ?? parts.village
    const pin = parts.postcode
    const line = [street, area, pin].filter((value) => Boolean(value)).join(', ')
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
