/** Shared failure-path helpers for every MapLibre canvas in the app.
    Kept separate from MapFailure.tsx so the component file stays
    component-only for react-refresh. OpenFreeMap (the free, keyless
    tile host) throttles and drops connections intermittently — when
    the style's source can't load, maplibre fires `error` before its
    own `load` event, and these helpers let the canvas show a retry
    overlay instead of a blank rectangle and an uncaught AJAXError. */

import { useState } from 'react'

/** Remount key + failure flag for a map. Wire `attempt` into the map's
    creation effect's dependency list; `retry` hides the overlay and
    bumps the key so the map is rebuilt from scratch. */
export function useMapRetry() {
  const [attempt, setAttempt] = useState(0)
  const [failed, setFailed] = useState(false)
  return {
    attempt,
    failed,
    fail: () => setFailed(true),
    retry: () => {
      setFailed(false)
      setAttempt((a) => a + 1)
    },
  }
}

/** Route a maplibre `error` event: before `load` it's a fatal failure,
    after `load` it's transient tile noise the map survives on its own. */
export function watchMapFailure(
  map: { on: (type: string, listener: (event: { error?: Error }) => unknown) => unknown },
  loaded: () => boolean,
  onFailure: () => void,
): void {
  map.on('error', (event) => {
    if (loaded()) {
      if (import.meta.env.DEV) {
        console.warn('Transient map error after load (ignored):', event?.error)
      }
      return
    }
    console.warn('Map failed to load:', event?.error)
    onFailure()
  })
}
