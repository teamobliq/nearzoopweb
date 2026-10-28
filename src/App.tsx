import { lazy, Suspense, useEffect, useState } from 'react'
import Splash from './screens/Splash'
import Onboarding from './screens/Onboarding'
import AuthFlow from './screens/AuthFlow'
import Done from './screens/Done'
import BusinessSignIn from './business/BusinessSignIn'
import CustomerOffer from './screens/CustomerOffer'
import './App.css'

// The admin console ships as its own chunk — absent from the main bundle.
const AdminPanel = lazy(() => import('./admin/AdminPanel'))

type Screen = 'splash' | 'onboard' | 'auth' | 'done'
type Route = 'customer' | 'business' | 'admin'
type Session = { variant: 'guest' | 'signed-in'; label?: string }
type DeepLink = { uid: string; offerId: string }

/** First-run check: onboarding shows once, then `nz.onboarded` skips it. */
function hasOnboarded(): boolean {
  try {
    return localStorage.getItem('nz.onboarded') === '1'
  } catch {
    return false
  }
}

/** `/busdash` (optional trailing slash) opens the merchant flow; `/nz-admin`
    (also unlinked) opens the ops console. */
function readRoute(): Route {
  if (/(^|\/)busdash\/?$/i.test(window.location.pathname)) {
    return 'business'
  }
  if (/(^|\/)nz-admin\/?$/i.test(window.location.pathname)) {
    return 'admin'
  }
  return 'customer'
}

/** A shared offer link — `<base>/<shopUid>/<offerId>?source=…` — resolves
    to the offer's own landing screen. Anything else (including `/` and
    unknown paths) falls through to the normal customer flow. */
function readDeepLink(): DeepLink | null {
  const base = import.meta.env.BASE_URL
  let path = window.location.pathname
  if (base === '/') {
    path = path.slice(1)
  } else {
    if (!path.startsWith(base)) return null
    path = path.slice(base.length)
  }
  const segments = path.split('/').filter(Boolean)
  if (segments.length !== 2) return null
  try {
    return {
      uid: decodeURIComponent(segments[0]),
      offerId: decodeURIComponent(segments[1]),
    }
  } catch {
    return { uid: segments[0], offerId: segments[1] }
  }
}

function App() {
  const [route, setRoute] = useState<Route>(readRoute)
  const [deepLink, setDeepLink] = useState<DeepLink | null>(readDeepLink)
  const [screen, setScreen] = useState<Screen>('splash')
  const [session, setSession] = useState<Session>({ variant: 'guest' })

  useEffect(() => {
    function sync() {
      setRoute(readRoute())
      setDeepLink(readDeepLink())
    }
    window.addEventListener('popstate', sync)
    return () => window.removeEventListener('popstate', sync)
  }, [])

  function goBusiness() {
    // Relative push: resolves against the current directory, so sub-path
    // deployments (e.g. /nearzoopweb/) still land next to the app.
    try {
      window.history.pushState({}, '', 'busdash')
    } catch {
      // History may be unavailable in sandboxed contexts; state still flips.
    }
    setRoute('business')
  }

  if (route === 'business') {
    return <BusinessSignIn />
  }

  if (route === 'admin') {
    return (
      <Suspense
        fallback={
          <main
            style={{
              minHeight: '100dvh',
              display: 'grid',
              placeItems: 'center',
              backgroundColor: 'var(--color-cream)',
              fontFamily: 'var(--font-mono)',
              color: 'var(--color-stone)',
            }}
          >
            <p>···</p>
          </main>
        }
      >
        <AdminPanel />
      </Suspense>
    )
  }

  if (route === 'customer' && deepLink) {
    // Shared links skip splash/onboarding — the visitor came for one offer.
    return (
      <CustomerOffer
        uid={deepLink.uid}
        offerId={deepLink.offerId}
        onSignIn={() => setScreen('auth')}
      />
    )
  }

  if (screen === 'splash') {
    // Splash gates navigation: it calls onProceed only on location grant.
    return <Splash onProceed={() => setScreen(hasOnboarded() ? 'auth' : 'onboard')} />
  }

  if (screen === 'onboard') {
    return <Onboarding onExit={() => setScreen('auth')} />
  }

  if (screen === 'auth') {
    return (
      <AuthFlow
        onSignedIn={(label) => {
          setSession({ variant: 'signed-in', label })
          setScreen('done')
        }}
        onSkip={() => {
          setSession({ variant: 'guest' })
          setScreen('done')
        }}
        onBusiness={goBusiness}
      />
    )
  }

  return (
    <Done
      variant={session.variant}
      label={session.label}
      onSignOut={() => setScreen('auth')}
    />
  )
}

export default App
