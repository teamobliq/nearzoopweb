import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import type { User } from 'firebase/auth'
import { auth } from './firebase'
import type { CouponRecord } from './business/coupons'
import Splash from './screens/Splash'
import Onboarding from './screens/Onboarding'
import AuthFlow from './screens/AuthFlow'
import { maskPhone } from './screens/maskPhone'
import Locate from './screens/Locate'
import CustomerHome from './screens/CustomerHome'
import BusinessSignIn from './business/BusinessSignIn'
import CustomerOffer from './screens/CustomerOffer'
import MyCoupons from './screens/MyCoupons'
import CouponPass from './screens/CouponPass'
import TrendingNearby from './screens/TrendingNearby'
import CustomerNotifications from './screens/CustomerNotifications'
import ShopProfile from './screens/ShopProfile'
import Offline from './screens/Offline'
import { cachedCoords } from './business/geocode'
import { useOnline } from './business/connectivity'
import './App.css'

// The admin console ships as its own chunk — absent from the main bundle.
const AdminPanel = lazy(() => import('./admin/AdminPanel'))

type Screen = 'splash' | 'onboard' | 'auth' | 'locate' | 'home' | 'profile' | 'editProfile' | 'myCoupons' | 'couponPass' | 'trending' | 'shop' | 'notifications'
type Route = 'customer' | 'business' | 'admin' | 'shop'
type Session = { variant: 'guest' | 'signed-in'; label?: string; uid?: string; user?: User }
type DeepLink = { uid: string; offerId: string }

/** First-run check: onboarding shows once, then `nz.onboarded` skips it. */
function hasOnboarded(): boolean {
  try {
    return localStorage.getItem('nz.onboarded') === '1'
  } catch {
    return false
  }
}

/** Set when the visitor chooses to browse without an account. It lets a
    reload resume as the same guest instead of throwing the sign-in wall
    back up, and is cleared the moment a real session starts. */
const GUEST_KEY = 'nz.guest'

function prefersGuest(): boolean {
  try {
    return localStorage.getItem(GUEST_KEY) === '1'
  } catch {
    return false
  }
}

function rememberGuest(): void {
  try {
    localStorage.setItem(GUEST_KEY, '1')
  } catch {
    // Storage blocked — the guest simply has to skip again next visit.
  }
}

function forgetGuest(): void {
  try {
    localStorage.removeItem(GUEST_KEY)
  } catch {
    // Storage blocked — nothing to clear.
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
  // Normalise: a trailing slash is meaningless here, and matching on it
  // would make `/business` and `/business/` diverge.
  const path = window.location.pathname.replace(/\/+$/, '') || '/'
  // The shop profile as a shareable link — `<ROOT>/shop?id=<shopUid>`.
  if (/(^|\/)shop$/i.test(path)) {
    return 'shop'
  }
  // Exact merchant entry points only. A prefix match on `/business` used to
  // swallow every `/business/<uid>/<offerId>` share link, so those fell into
  // the merchant landing instead of the offer. The offer path is two
  // segments, which this can no longer collide with.
  if (/\/(busdash|business)$/i.test(path)) {
    return 'business'
  }
  if (/\/nz-admin$/i.test(path)) {
    return 'admin'
  }
  return 'customer'
}

/** The shop link's id — `<ROOT>/shop?id=<shopUid>`. Missing or empty means
    the link wasn't built for a shop; callers show a friendly dead-end,
    never an empty query. */
function readShopId(): string | null {
  try {
    const id = new URLSearchParams(window.location.search).get('id')
    return id && id.trim() ? id : null
  } catch {
    return null
  }
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
  const [onlineRetry, setOnlineRetry] = useState(0)
  const online = useOnline(onlineRetry)
  const [route, setRoute] = useState<Route>(readRoute)
  const [deepLink, setDeepLink] = useState<DeepLink | null>(readDeepLink)
  const [screen, setScreen] = useState<Screen>('splash')
  const [session, setSession] = useState<Session>({ variant: 'guest' })
  // Where the auth flow hands back to: the first run continues into the
  // location step; signing in from Home's You tab returns straight home.
  const [authReturn, setAuthReturn] = useState<'locate' | 'home'>('locate')
  /** The coupon the customer tapped in My Coupons — opened as its own pass
      screen so the QR is full-screen and shareable. */
  const [couponToOpen, setCouponToOpen] = useState<CouponRecord | null>(null)
  /** The shop the customer tapped into from an offer card — opened as its
      own profile screen. */
  const [shopUid, setShopUid] = useState<string | null>(null)
  /** The screen stack behind the back button. React state drives rendering,
      but the *browser's* history is what a phone's back gesture actually
      pops — without a parallel entry per screen, back jumped out of the app
      entirely. `screenStack` mirrors the pushed entries so popstate knows
      which screen to restore. */
  const screenStack = useRef<Screen[]>(['splash'])
  /** Mirror of the stack's depth. The ref holds the ids; this lets render
      decide whether a screen has anything behind it without reading a ref
      mid-render. */
  const [screenDepth, setScreenDepth] = useState(1)

  /** Navigate to a screen and push a history entry for it, so the browser's
      back gesture returns here rather than leaving the app. */
  function go(next: Screen) {
    if (next === screen) return
    screenStack.current.push(next)
    setScreenDepth(screenStack.current.length)
    setScreen(next)
    try {
      // A state marker keeps `busdash` / offer URLs intact: the path is not
      // rewritten for in-app screens, only an entry is added.
      window.history.pushState({ nzScreen: next }, '')
    } catch {
      // History unavailable in some sandboxed contexts; state still flips.
    }
  }

  useEffect(() => {
    function sync() {
      setRoute(readRoute())
      setDeepLink(readDeepLink())
      // A back gesture popped one of our screen entries: drop it from the
      // local stack and restore the screen that is now on top. Deep-link and
      // merchant/admin URLs carry no marker, so they are left to the route
      // logic above.
      const state = window.history.state as { nzScreen?: Screen; nzShop?: boolean } | null
      if (state?.nzScreen) {
        // The browser landed on one of our pushed entries — restore that
        // screen and drop any deeper entries so the stack matches history.
        const stack = screenStack.current
        const index = stack.lastIndexOf(state.nzScreen)
        if (index >= 0) {
          stack.length = index + 1
        } else {
          stack.push(state.nzScreen)
        }
        setScreenDepth(stack.length)
        setScreen(state.nzScreen)
        return
      }
      // The shop URL entry is a marker, not a member of the screen stack —
      // popping here would desync the in-app stack behind the offer page.
      if (state?.nzShop) {
        return
      }
      if (screenStack.current.length > 1) {
        screenStack.current.pop()
        setScreenDepth(screenStack.current.length)
        const previous = screenStack.current[screenStack.current.length - 1]
        if (previous) setScreen(previous)
      }
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

  /** Opens one offer's page from the customer list or the shop profile —
      a real URL, so Back, reload and sharing all land on the same offer. */
  function openOffer(uid: string, offerId: string) {
    const target = `${import.meta.env.BASE_URL}${encodeURIComponent(uid)}/${encodeURIComponent(offerId)}?source=nearby`
    try {
      window.history.pushState({ nzOffer: true }, '', target)
    } catch {
      // History unavailable — the screen still opens, the URL just lags.
    }
    // The render order checks the /shop route before the offer deep link —
    // a shop page pushing this URL would otherwise render the shop's
    // unavailable screen. Flip the route alongside the deep link.
    setRoute('customer')
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
    go('home')
  }

  /** Opens the shop's profile — a real URL, so Back, reload and sharing
      all land on the same shop: `<ROOT>/shop?id=<shopUid>`. */
  function openShop(uid: string) {
    const target = `${import.meta.env.BASE_URL}shop?id=${encodeURIComponent(uid)}`
    try {
      window.history.pushState({ nzShop: true }, '', target)
    } catch {
      // History unavailable — the screen still opens, the URL just lags.
    }
    setShopUid(uid)
    setRoute('shop')
  }

  /** Leaves the shop profile: back through history when it was opened
      from inside the app, otherwise to Home. */
  function closeShop() {
    const state = window.history.state as { nzShop?: boolean } | null
    if (state?.nzShop) {
      window.history.back()
      return
    }
    try {
      window.history.pushState({}, '', import.meta.env.BASE_URL || '/')
    } catch {
      // History unavailable — still returns to Home.
    }
    setShopUid(null)
    setRoute('customer')
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
    go('auth')
  }

  // The offline gate — no network, no app. The check runs every 10s in
  // the background; this screen replaces every route until a check passes.
  if (!online) {
    return (
      <Offline
        onRetry={() => setOnlineRetry((n) => n + 1)}
        checking={false}
      />
    )
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

  if (route === 'shop') {
    // Shared shop links open the profile straight away — no splash, no
    // onboarding. Back falls to Home when the link didn't come from the app.
    const shopId = readShopId()
    if (!shopId) {
      return (
        <main
          style={{
            minHeight: '100dvh',
            display: 'grid',
            placeItems: 'center',
            backgroundColor: 'var(--color-cream)',
            fontFamily: 'var(--font-mono)',
            color: 'var(--color-stone)',
            padding: '2rem',
            textAlign: 'center',
          }}
        >
          <div>
            <p style={{ margin: 0, fontSize: '1rem' }}>This link is missing its shop.</p>
            <button
              type="button"
              onClick={() => {
                try {
                  window.history.pushState({}, '', import.meta.env.BASE_URL || '/')
                } catch {
                  // History unavailable — still reroutes below.
                }
                setRoute('customer')
              }}
              style={{
                marginTop: '1rem',
                padding: '0.6rem 1.2rem',
                borderRadius: '999px',
                border: '2.5px solid var(--color-ink)',
                backgroundColor: 'var(--color-yellow)',
                font: 'inherit',
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              Go to NearZoop
            </button>
          </div>
        </main>
      )
    }
    return (
      <ShopProfile
        uid={shopId}
        onBack={closeShop}
        onOpenOffer={openOffer}
        viewerUid={session.variant === 'signed-in' ? session.uid : undefined}
        onSignIn={() => {
          setAuthReturn('home')
          go('auth')
        }}
      />
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
        onOpenShop={openShop}
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
            go('home')
            return
          }
          // A returning guest with a saved fix lands straight on Home — the
          // reload used to re-arm the sign-in wall every time.
          if (hasOnboarded() && prefersGuest() && cachedCoords()) {
            go('home')
            return
          }
          go(hasOnboarded() ? 'auth' : 'onboard')
        }}
      />
    )
  }

  if (screen === 'onboard') {
    return <Onboarding onExit={() => go('auth')} />
  }

  if (screen === 'auth') {
    return (
      <AuthFlow
        onSignedIn={(label, uid) => {
          // A real session supersedes a previous browse-as-guest choice.
          forgetGuest()
          setSession({ variant: 'signed-in', label, uid })
          go(authReturn)
        }}
        onSkip={() => {
          // Remembered so a reload resumes as the same guest instead of
          // showing the sign-in wall again.
          rememberGuest()
          setSession({ variant: 'guest' })
          go(authReturn)
        }}
        onBusiness={goBusiness}
      />
    )
  }

  if (screen === 'locate') {
    // Cancel is offered only when Home is actually behind this screen — on
    // the first run there is nothing to return to and the step is mandatory.
    return (
      <Locate
        onDone={() => go('home')}
        onBack={
          screenDepth > 1 && authReturn === 'home'
            ? () => go('home')
            : undefined
        }
      />
    )
  }

  if (screen === 'myCoupons') {
    return (
      <MyCoupons
        user={session.variant === 'signed-in' ? auth.currentUser : null}
        onBack={() => go('home')}
        onOpenPass={(c) => {
          setCouponToOpen(c)
          go('couponPass')
        }}
      />
    )
  }

  if (screen === 'couponPass') {
    return (
      <CouponPass
        coupon={couponToOpen!}
        onBack={() => {
          setCouponToOpen(null)
          go('myCoupons')
        }}
      />
    )
  }

  if (screen === 'trending') {
    return (
      <TrendingNearby onBack={() => go('home')} />
    )
  }

  if (screen === 'notifications') {
    return (
      <CustomerNotifications
        viewerUid={session.variant === 'signed-in' ? session.uid : undefined}
        viewerName={session.label}
        onBack={() => go('home')}
        onOpenOffer={openOffer}
        onSignIn={() => {
          setAuthReturn('home')
          go('auth')
        }}
      />
    )
  }

  if (screen === 'shop') {
    return (
      <ShopProfile
        uid={shopUid ?? ''}
        onBack={() => go('home')}
        onOpenOffer={openOffer}
        viewerUid={session.variant === 'signed-in' ? session.uid : undefined}
        onSignIn={() => {
          setAuthReturn('home')
          go('auth')
        }}
      />
    )
  }

  return (
    <CustomerHome
      session={session}
      user={session.variant === 'signed-in' ? auth.currentUser : null}
      onEditLocation={() => go('locate')}
      onOpenOffer={openOffer}
      onOpenCoupons={() => go('myCoupons')}
      onOpenTrending={() => go('trending')}
      onOpenNotifications={() => go('notifications')}
      onOpenShop={(uid) => {
        setShopUid(uid)
        go('shop')
      }}
      onSignIn={() => {
        setAuthReturn('home')
        go('auth')
      }}
      onSignOut={() => setSession({ variant: 'guest' })}
    />
  )
}

export default App
