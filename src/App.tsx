import { lazy, Suspense, useEffect, useState } from 'react'
import type { User } from 'firebase/auth'
import { auth } from './firebase'
import Splash from './screens/Splash'
import Onboarding from './screens/Onboarding'
import AuthFlow, { maskPhone } from './screens/AuthFlow'
import Locate from './screens/Locate'
import CustomerHome from './screens/CustomerHome'
import BusinessSignIn from './business/BusinessSignIn'
import CustomerOffer from './screens/CustomerOffer'
import './App.css'

// The admin console ships as its own chunk — absent from the main bundle.
const AdminPanel = lazy(() => import('./admin/AdminPanel'))

type Screen = 'splash' | 'onboard' | 'auth' | 'locate' | 'home' | 'profile' | 'editProfile'
type Route = 'customer' | 'business' | 'admin'
type Session = { variant: 'guest' | 'signed-in'; label?: string; uid?: string }
type DeepLink = { uid: string; offerId: string }

/** First-run check: onboarding shows once, then `nz.onboarded` skips it. */
function hasOnboarded(): boolean {
  try {
    return localStorage.getItem('nz.onboarded') === '1'
  } catch {
    return false
  }
}

/** Chip label for a restored Firebase session — the same shapes the auth
    flow emits: a masked +91 number for phone sign-ins, "Name · email" for
    Google. */
function sessionLabel(user: User): string {
  if (user.phoneNumber) return maskPhone(user.phoneNumber.replace(/^\+91/, ''))
  const name = user.displayName ?? ''
  if (user.email) return name ? `${name} · ${user.email}` : user.email
  return name || 'Signed in'
}

/** `/busdash` or a `/business/<section>` URL (the dashboard keeps its own
    section in the address bar) opens the merchant flow; `/nz-admin` (also
    unlinked) opens the ops console. */
function readRoute(): Route {
  const path = window.location.pathname
  if (/(^|\/)busdash\/?$/i.test(path)) {
    return 'business'
  }
  if (/(^|\/)business(\/.*)?\/?$/i.test(path)) {
    return 'business'
  }
  if (/(^|\/)nz-admin\/?$/i.test(path)) {
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
  // Merchant/admin paths are two segments too — never read them as a
  // `<uid>/<offerId>` pair.
  if (['business', 'busdash', 'nz-admin'].includes(segments[0].toLowerCase())) {
    return null
  }
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
  // Where the auth flow hands back to: the first run continues into the
  // location step; signing in from Home's You tab returns straight home.
  const [authReturn, setAuthReturn] = useState<'locate' | 'home'>('locate')

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

  /** Opens one offer's page from the customer list — a real URL, so Back,
      reload and sharing all land on the same offer. */
  function openOffer(uid: string, offerId: string) {
    const target = `${import.meta.env.BASE_URL}${encodeURIComponent(uid)}/${encodeURIComponent(offerId)}?source=nearby`
    try {
      window.history.pushState({ nzOffer: true }, '', target)
    } catch {
      // History unavailable — the screen still opens, the URL just lags.
    }
    setDeepLink({ uid, offerId })
  }

  /** Leaves an offer page: back through history when it was opened from
      the list, otherwise to Home (a shared link has no list behind it). */
  function closeOffer() {
    const state = window.history.state as { nzOffer?: boolean } | null
    if (state?.nzOffer) {
      window.history.back()
    } else {
      try {
        window.history.pushState({}, '', import.meta.env.BASE_URL || '/')
      } catch {
        // State still switches below.
      }
    }
    setDeepLink(null)
    setScreen('home')
  }

  /** "Sign in to claim" on an offer page — the auth flow takes over, then
      lands on Home (the offer stays reachable from there). */
  function signInFromOffer() {
    setAuthReturn('home')
    try {
      window.history.pushState({}, '', import.meta.env.BASE_URL || '/')
    } catch {
      // State still switches below.
    }
    setDeepLink(null)
    setScreen('auth')
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
        signedIn={session.variant === 'signed-in'}
        viewerUid={session.uid}
        onSignIn={signInFromOffer}
        onBack={closeOffer}
      />
    )
  }

  if (screen === 'splash') {
    // Splash gates navigation: it calls onProceed only on location grant,
    // handing back the session Firebase restored while it ran. Returning
    // users skip onboarding and auth — straight Home.
    return (
      <Splash
        onProceed={(_coords, user) => {
          if (user) {
            setSession({ variant: 'signed-in', label: sessionLabel(user), uid: user.uid, user })
            setScreen('home')
            return
          }
          setScreen(hasOnboarded() ? 'auth' : 'onboard')
        }}
      />
    )
  }

  if (screen === 'onboard') {
    return <Onboarding onExit={() => setScreen('auth')} />
  }

  if (screen === 'auth') {
    return (
      <AuthFlow
        onSignedIn={(label, uid) => {
          setSession({ variant: 'signed-in', label, uid })
          setScreen(authReturn)
        }}
        onSkip={() => {
          setSession({ variant: 'guest' })
          setScreen(authReturn)
        }}
        onBusiness={goBusiness}
      />
    )
  }

  if (screen === 'locate') {
    return <Locate onDone={() => setScreen('home')} />
  }

  return (
    <CustomerHome
      session={session}
      user={session.variant === 'signed-in' ? auth.currentUser : null}
      onEditLocation={() => setScreen('locate')}
      onOpenOffer={openOffer}
      onSignIn={() => {
        setAuthReturn('home')
        setScreen('auth')
      }}
      onSignOut={() => setSession({ variant: 'guest' })}
    />
  )
}

export default App
