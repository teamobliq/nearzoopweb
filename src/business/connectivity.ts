/** Connectivity watchdog — the app needs a network for every screen
    (feed, shops, claims, auth). Rather than leaving the user staring at
    frozen spinner rows, this polls once every 10 seconds with a real
    reachability check (a no-cors fetch to the app's own favicon — a
    browser-native `online` event alone can flag a disconnected Wi-Fi
    as "online"). When the check fails, the app shows a full-screen
    offline fallback until a check passes again. */

import { useEffect, useState } from 'react'

const CHECK_INTERVAL_MS = 10_000
const CHECK_TIMEOUT_MS = 4_000

/** Fetches the app's own icon — always hosted next to the bundle, so a
    pass means this origin is reachable, not just any internet socket. */
async function checkReachable(): Promise<boolean> {
  try {
    const url = `${import.meta.env.BASE_URL ?? '/'}icon.svg?_nz=${Date.now()}&_nz=${Math.random() * 1e6 | 0}`
    const res = await fetch(url, {
      method: 'GET',
      cache: 'no-store',
      signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
    })
    return res.ok
  } catch {
    return false
  }
}

/** `false` from the moment a check fails, `true` after the next passes.
    In-flight checks are ignored when the component unmounts. Bump
    `retryNonce` to force an immediate re-check (the Offline screen's
    Try-again button does this). */
export function useOnline(retryNonce = 0): boolean {
  const [online, setOnline] = useState<boolean>(() => navigator.onLine)

  useEffect(() => {
    let cancelled = false

    async function tick() {
      // Trust an actual offline event immediately; otherwise re-probe.
      if (!navigator.onLine) {
        if (!cancelled) setOnline(false)
        return
      }
      const ok = await checkReachable()
      if (cancelled) return
      setOnline((prev) => (prev === ok ? prev : ok))
    }

    void tick()
    const id = window.setInterval(tick, CHECK_INTERVAL_MS)

    function onOffline() {
      if (!cancelled) setOnline(false)
    }
    function onOnline() {
      // The browser says we're back — prove it before waking the app.
      if (!cancelled) void tick()
    }

    window.addEventListener('offline', onOffline)
    window.addEventListener('online', onOnline)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void tick()
    })

    return () => {
      cancelled = true
      window.clearInterval(id)
      window.removeEventListener('offline', onOffline)
      window.removeEventListener('online', onOnline)
    }
  }, [retryNonce])

  return online
}
