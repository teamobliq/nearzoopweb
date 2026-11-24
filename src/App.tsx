import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react'
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
import MerchantTerms from './business/MerchantTerms'
import OfferGuidelines from './business/OfferGuidelines'
import CustomerOffer from './screens/CustomerOffer'
import MyCoupons from './screens/MyCoupons'
import CouponPass from './screens/CouponPass'
import TrendingNearby from './screens/TrendingNearby'
import CustomerNotifications from './screens/CustomerNotifications'
import NotificationsOverlay from './components/NotificationsOverlay'
import { useDesktop } from './hooks/useDesktop'
import ShopProfile from './screens/ShopProfile'
import { cachedCoords } from './business/geocode'
import './App.css'

// The admin console ships as its own chunk — absent from the main bundle.
const AdminPanel = lazy(() => import('./admin/AdminPanel'))

type Screen = 'splash' | 'onboard' | 'auth' | 'locate' | 'home' | 'profile' | 'editProfile' | 'myCoupons' | 'couponPass' | 'trending' | 'shop' | 'notifications'
type Route = 'customer' | 'business' | 'admin' | 'shop' | 'merchantTerms' | 'offerGuidelines'
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
  if (/\/merchant-terms$/i.test(path)) {
    return 'merchantTerms'
  }
  if (/\/offer-guidelines$/i.test(path)) {
    return 'offerGuidelines'
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

/** A shared offer link — `<base>/offer?shop=<uid>&offer=<id>` — resolves to the
    offer's own landing screen. The older `<base>/<uid>/<offerId>` paths are
    still accepted so previously shared links keep working. In-app taps do
    not write either form to the address bar. */
function readDeepLink(): DeepLink | null {
  const params = new URLSearchParams(window.location.search)
  const shop = params.get('shop')
  const offer = params.get('offer')
  if (shop && offer) return { uid: shop, offerId: offer }

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
  // Desktop shows the inbox as a drawer over Home; phones keep the full page.
  const desktop = useDesktop()

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

  /** Closing the desktop inbox pops its history entry so Back behaves like
   *  a dismissed overlay instead of growing the screen stack. */
  function closeNotifications() {
    const state = window.history.state as { nzScreen?: Screen } | null
    if (state?.nzScreen === 'notifications') window.history.back()
    else go('home')
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

  /** Merchant policy documents — real URLs so they can be linked and
      reloaded, but still rendered as screens inside this SPA. */
  function openDoc(doc: 'merchantTerms' | 'offerGuidelines') {
    const path = doc === 'merchantTerms' ? 'merchant-terms' : 'offer-guidelines'
    try {
      window.history.pushState({ nzDoc: doc }, '', `${import.meta.env.BASE_URL}${path}`)
    } catch {
      // State still switches below.
    }
    setRoute(doc)
  }

  function closeDoc() {
    const state = window.history.state as { nzDoc?: string } | null
    if (state?.nzDoc) {
      window.history.back()
    } else {
      try {
        window.history.pushState({}, '', `${import.meta.env.BASE_URL}busdash`)
      } catch {
        // State still switches below.
      }
    }
    setRoute('business')
  }

  /** Opens one offer's page. The address bar stays on the clean base URL —
      this is still one SPA screen swap, not a new page. Sharing uses
      offerShareUrl() to build a deep link for recipients. */
  function openOffer(uid: string, offerId: string) {
    try {
      window.history.pushState({ nzOffer: true }, '', import.meta.env.BASE_URL || '/')
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

  /** One key per navigation state — used to reset scroll on each screen. */
  const navKey = route === 'merchantTerms' || route === 'offerGuidelines'
      ? route
      : route === 'business'
      ? 'business'
      : route === 'admin'
        ? 'admin'
        : route === 'shop'
          ? `shop:${readShopId() ?? 'missing'}`
          : deepLink
            ? `offer:${deepLink.uid}/${deepLink.offerId}`
            : screen === 'notifications' && desktop
              ? 'home'
              : screen

  // Screens are plain swaps — no enter animation. Each navigation still
  // gets a fresh mount and starts at the top of the page.
  function view(_variant: 'up' | 'lift' | 'fade', node: ReactNode) {
    return node
  }

  /** The inbox, shared by the mobile screen and the desktop drawer. */
  function notificationsNode() {
    return (
      <CustomerNotifications
        viewerUid={session.variant === 'signed-in' ? session.uid : undefined}
        viewerName={session.label}
        onBack={closeNotifications}
        onOpenOffer={openOffer}
        onSignIn={() => {
          setAuthReturn('home')
          go('auth')
        }}
      />
    )
  }

  /** Home is also the base layer behind the desktop notifications drawer. */
  function homeNode() {
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

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [navKey])

  if (route === 'merchantTerms') {
    return view('up', <MerchantTerms onBack={closeDoc} />)
  }

  if (route === 'offerGuidelines') {
    return view('up', <OfferGuidelines onBack={closeDoc} />)
  }

  if (route === 'business') {
    return view('up', <BusinessSignIn onOpenDoc={openDoc} />)
  }

  if (route === 'admin') {
    return view(
      'fade',
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
            <p role="status">Loading admin console…</p>
          </main>
        }
      >
        <AdminPanel />
      </Suspense>,
    )
  }

  if (route === 'shop') {
    // Shared shop links open the profile straight away — no splash, no
    // onboarding. Back falls to Home when the link didn't come from the app.
    const shopId = readShopId()
    if (!shopId) {
      return view(
        'fade',
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
        </main>,
      )
    }
    return view(
      'lift',
      <ShopProfile
        uid={shopId}
        onBack={closeShop}
        onOpenOffer={openOffer}
        viewerUid={session.variant === 'signed-in' ? session.uid : undefined}
        onSignIn={() => {
          setAuthReturn('home')
          go('auth')
        }}
      />,
    )
  }

  if (route === 'customer' && deepLink) {
    // Shared links skip splash/onboarding — the visitor came for one offer.
    return view(
      'lift',
      <CustomerOffer
        uid={deepLink.uid}
        offerId={deepLink.offerId}
        signedIn={session.variant === 'signed-in'}
        viewerUid={session.uid}
        onSignIn={signInFromOffer}
        onBack={closeOffer}
        onOpenShop={openShop}
      />,
    )
  }

  if (screen === 'splash') {
    // Splash gates navigation: it calls onProceed only on location grant,
    // handing back the session Firebase restored while it ran. Returning
    // users skip onboarding and auth — straight Home.
    return view(
      'fade',
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
      />,
    )
  }

  if (screen === 'onboard') {
    return view('up', <Onboarding onExit={() => go('auth')} />)
  }

  if (screen === 'auth') {
    return view(
      'up',
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
      />,
    )
  }

  if (screen === 'locate') {
    // Cancel is offered only when Home is actually behind this screen — on
    // the first run there is nothing to return to and the step is mandatory.
    return view(
      'up',
      <Locate
        onDone={() => go('home')}
        onBack={
          screenDepth > 1 && authReturn === 'home'
            ? () => go('home')
            : undefined
        }
      />,
    )
  }

  if (screen === 'myCoupons') {
    return view(
      'up',
      <MyCoupons
        user={session.variant === 'signed-in' ? auth.currentUser : null}
        onBack={() => go('home')}
        onOpenPass={(c) => {
          setCouponToOpen(c)
          go('couponPass')
        }}
      />,
    )
  }

  if (screen === 'couponPass') {
    return view(
      'lift',
      <CouponPass
        coupon={couponToOpen!}
        onBack={() => {
          setCouponToOpen(null)
          go('myCoupons')
        }}
      />,
    )
  }

  if (screen === 'trending') {
    return view(
      'up',
      <TrendingNearby
        onBack={() => go('home')}
        viewerUid={session.variant === 'signed-in' ? session.uid : undefined}
        onSignIn={() => {
          setAuthReturn('home')
          go('auth')
        }}
        onOpenOffer={openOffer}
      />,
    )
  }

  // On desktop the inbox is an overlay handled in the final Home render, so
  // the map and panel behind it stay mounted. Phones keep the full screen.
  if (screen === 'notifications' && !desktop) {
    return view('up', notificationsNode())
  }

  if (screen === 'shop') {
    return view(
      'lift',
      <ShopProfile
        uid={shopUid ?? ''}
        onBack={() => go('home')}
        onOpenOffer={openOffer}
        viewerUid={session.variant === 'signed-in' ? session.uid : undefined}
        onSignIn={() => {
          setAuthReturn('home')
          go('auth')
        }}
      />,
    )
  }

  return view(
    'up',
    <>
      {homeNode()}
      {screen === 'notifications' && desktop && (
        <NotificationsOverlay onClose={closeNotifications}>
          {notificationsNode()}
        </NotificationsOverlay>
      )}
    </>,
  )
}

export default App
