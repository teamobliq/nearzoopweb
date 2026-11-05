/** Shared customer-side map helpers: types and one-off utilities used by
    the map canvas and its consumers. Kept component-free so the screens
    can import them without pulling in the map. */

export type Coords = { lat: number; lng: number }

/** One offer pin on the customer map. */
export type MapPin = {
  id: string
  lat: number
  lng: number
  selected?: boolean
  /** Discount label shown on the map chip (e.g. "40%"). */
  label?: string
}

/** "2 km" / "2.5 km" — the Locate slider's value and Home's location chip
    share it so the two screens always say the radius the same way. */
export function fmtKm(km: number): string {
  const value = Math.round(km * 2) / 2
  return `${value % 1 === 0 ? String(value) : value.toFixed(1)} km`
}

/** One fresh high-accuracy GPS fix, no cache. Resolves null when the
    device, the network or the permission says no — callers show their own
    honest failure state. */
export function requestFix(): Promise<{
  coords: Coords
  accuracy: number
} | null> {
  return new Promise((resolve) => {
    if (!('geolocation' in navigator)) return resolve(null)
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          coords: {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          },
          accuracy: position.coords.accuracy,
        }),
      () => resolve(null),
      { timeout: 12000, enableHighAccuracy: true, maximumAge: 0 },
    )
  })
}
