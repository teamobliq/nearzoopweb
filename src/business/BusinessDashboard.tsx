import { useEffect, useRef, useState } from 'react'
import BusinessOfferCreate from './BusinessOfferCreate'
import BusinessOfferDetail from './BusinessOfferDetail'
import BusinessInsights from './BusinessInsights'
import BusinessNotifications from './BusinessNotifications'
import BusinessOffers from './BusinessOffers'
import BusinessShop from './BusinessShop'
import BusinessScan from './BusinessScan'
import { syncShopFeed } from './feed'
import { fmtDay } from './when'
import {
  feeDaysLeft,
  watchNotificationsUnread,
  watchOffers,
  watchShop,
  watchViewEvents,
  type OfferRecord,
  type ShopRecord,
  type ViewEvent,
} from './shop'

type Props = {
  uid: string
  onSignOut: () => void
  /** Opens the wizard's payment step to renew the yearly listing. */
  onRenew: () => void
}

type View = 'home' | 'offers' | 'create' | 'detail' | 'insights' | 'shop' | 'notifications'

/** Sections that live in the address bar. An offer's page is
    `/business/offers/<offerId>`; anything unknown falls back to Home. */
const VIEW_NAMES: View[] = [
  'home',
  'offers',
  'create',
  'insights',
  'shop',
  'notifications',
]

type RouteState = { view: View; detailId: string | null }

/** The section (and offer) a `/business/...` URL names — Home for anything
    else. Detail keeps its id in the path so a reload, a remount or a shared
    tab lands back on the same offer instead of the list. */
function readRouteFromPath(): RouteState {
  const segments = window.location.pathname.split('/').filter(Boolean)
  const at = segments.findIndex((s) => s.toLowerCase() === 'business')
  if (at === -1) return { view: 'home', detailId: null }
  const name = (segments[at + 1] ?? '').toLowerCase()
  const maybeId = segments[at + 2]
  if (name === 'offers' && maybeId) {
    let detailId = maybeId
    try {
      detailId = decodeURIComponent(maybeId)
    } catch {
      /* keep the raw segment */
    }
    return { view: 'detail', detailId }
  }
  return {
    view: (VIEW_NAMES as string[]).includes(name) ? (name as View) : 'home',
    detailId: null,
  }
}

/** Canonical URL for a section: Home is `/busdash`, the rest are
    `/business/<view>` — prefixed with the deploy base for sub-path hosts. */
function viewUrl(view: View): string {
  const base = import.meta.env.BASE_URL
  return base + (view === 'home' ? 'busdash' : `business/${view}`)
}

/** An offer's own page — the detail view's address. */
function detailUrl(offerId: string): string {
  const base = import.meta.env.BASE_URL
  return `${base}business/offers/${encodeURIComponent(offerId)}`
}

type NavKind = 'home' | 'offers' | 'scan' | 'insights' | 'shop' | 'bell'

function fmt(value: number): string {
  return value.toLocaleString('en-IN')
}

function ShieldSvg() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="#1fa855"
      strokeWidth={2.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
      <path d="m9 11.5 2.2 2.2 3.8-4.2" />
    </svg>
  )
}

function ClockSvg() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  )
}

function PlusSvg() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.6}
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

function QrSvg() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="3" width="7" height="7" rx="1.4" />
      <rect x="14" y="3" width="7" height="7" rx="1.4" />
      <rect x="3" y="14" width="7" height="7" rx="1.4" />
      <path d="M14 14h3.5v3.5M21 14v3.5M14 21h3.5" />
    </svg>
  )
}

function InfoSvg() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8h.01M12 11v5" />
    </svg>
  )
}

function ChevronSvg() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m9.5 5 6.5 7-6.5 7" />
    </svg>
  )
}

function LogoutSvg() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 21H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3" />
      <path d="m16 17 5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  )
}

function NavIcon({ kind }: { kind: NavKind }) {
  const props = {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2.2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  }
  switch (kind) {
    case 'home':
      return (
        <svg {...props}>
          <rect x="4" y="4" width="6.5" height="6.5" rx="1.4" />
          <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.4" />
          <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.4" />
          <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.4" />
        </svg>
      )
    case 'offers':
      return (
        <svg {...props}>
          <path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8Z" />
          <circle cx="7.5" cy="7.5" r="1.4" />
        </svg>
      )
    case 'scan':
      return (
        <svg {...props}>
          <rect x="3" y="3" width="7" height="7" rx="1.4" />
          <rect x="14" y="3" width="7" height="7" rx="1.4" />
          <rect x="3" y="14" width="7" height="7" rx="1.4" />
          <path d="M14 14h3.5v3.5M21 14v3.5M14 21h3.5" />
        </svg>
      )
    case 'insights':
      return (
        <svg {...props}>
          <path d="m3 17 6-6 4 4 8-8" />
          <path d="M15 7h6v6" />
        </svg>
      )
    case 'shop':
      return (
        <svg {...props}>
          <path d="M4.5 9.5 6 4h12l1.5 5.5" />
          <path d="M4.5 9.5a2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0 5 0" />
          <path d="M5.5 12.6V20h13v-7.4" />
          <path d="M9.5 20v-4.5h5V20" />
        </svg>
      )
    case 'bell':
      return (
        <svg {...props}>
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.7 21a2 2 0 0 1-3.4 0" />
        </svg>
      )
  }
}

/**
 * Merchant dashboard. Everything is data-driven from Firestore: shop profile
 * for name/verification, offers subcollection for stats and lists. With no
 * offers yet it shows the "Post your first offer" empty state — no invented
 * numbers anywhere.
 */
export default function BusinessDashboard({
  uid,
  onSignOut,
  onRenew,
}: Props) {
  const [shop, setShop] = useState<ShopRecord | null>(null)
  const [shopReady, setShopReady] = useState(false)
  const [offers, setOffers] = useState<OfferRecord[] | null>(null)
  const [route, setRoute] = useState<RouteState>(readRouteFromPath)
  const view = route.view
  // The details screen holds only the id — the record is read live from the
  // offers array, so a status change updates the screen in place.
  const detailId = route.detailId

  /** Section switches clear any open detail. */
  function setView(next: View): void {
    setRoute({ view: next, detailId: null })
  }
  // "Run it again" — the offer the builder opens prefilled with.
  const [runAgain, setRunAgain] = useState<OfferRecord | null>(null)
  // The scan flow overlay — opened from every Scan entry point.
  const [scanOpen, setScanOpen] = useState(false)
  // Unread inbox count — feeds the bell's badge in the nav.
  const [unread, setUnread] = useState<number | null>(null)
  const shellRef = useRef<HTMLDivElement | null>(null)

  useEffect(
    () =>
      watchShop(uid, (value) => {
        setShop(value)
        setShopReady(true)
      }),
    [uid],
  )

  useEffect(() => watchOffers(uid, setOffers), [uid])

  useEffect(() => watchNotificationsUnread(uid, setUnread), [uid])

  // Raw view events — insights aggregates them into every views number.
  // Starts empty rather than blocking the whole dashboard on this stream;
  // the numbers fill in the moment the first snapshot lands.
  const [viewEvents, setViewEvents] = useState<ViewEvent[]>([])
  useEffect(() => watchViewEvents(uid, setViewEvents), [uid])

  // Mirror reconcile on entry — re-syncs every public mirror this shop
  // owns, self-healing any drift (rules deployed late, offers approved
  // before the mirror existed) without waiting for a state transition.
  useEffect(() => {
    void syncShopFeed(uid).catch((err) => console.warn('feed sync', err))
  }, [uid])

  // Switching sections starts at the top — on desktop the shell is its own
  // scroll pane, on mobile the page itself scrolls.
  useEffect(() => {
    window.scrollTo(0, 0)
    shellRef.current?.scrollTo(0, 0)
  }, [view])

  // The address bar follows the section (and the open offer), so a reload
  // or a shared tab lands back on the same screen. Back/Forward step
  // through pages. Detail ids live in the path: `/business/offers/<id>`.
  useEffect(() => {
    const target =
      view === 'detail' && detailId ? detailUrl(detailId) : viewUrl(view)
    const here = window.location.pathname.replace(/\/+$/, '') || '/'
    if (here !== target.replace(/\/+$/, '')) {
      try {
        window.history.pushState({ nzDetail: view === 'detail' }, '', target)
      } catch {
        // History can be unavailable in sandboxed contexts; the section
        // still switched, the URL just doesn't follow.
      }
    }
  }, [view, detailId])

  useEffect(() => {
    function onPop(): void {
      setRoute(readRouteFromPath())
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  if (!shopReady || offers === null || !shop) {
    return (
      <main className="biz-page">
        <div className="biz-shell">
          <div className="biz-center">
            <p className="biz-boot">Loading your shop…</p>
          </div>
        </div>
      </main>
    )
  }

  const firstName = shop.ownerName.trim().split(/\s+/)[0] ?? ''
  const liveOffers = offers.filter((o) => (o.status ?? 'live') === 'live')
  // Offers staff can count by hand in the scan flow — everything live except
  // coupon-kind offers, whose validation waits on the claims system.
  const scanOffers = liveOffers.filter((o) => (o.redeemKind ?? 'screen') !== 'coupon')
  const liveCount = liveOffers.length
  const total = (pick: (offer: OfferRecord) => number | undefined) =>
    offers.reduce((sum, offer) => sum + (pick(offer) ?? 0), 0)
  const hasOffers = offers.length > 0

  const detailOffer =
    detailId === null ? null : (offers.find((o) => o.id === detailId) ?? null)

  function openDetail(offerId: string): void {
    setRoute({ view: 'detail', detailId: offerId })
  }

  /** Back from an offer's page — step through history when the page was
      pushed, otherwise return to the list (a directly-loaded detail). */
  function closeDetail(): void {
    const state = window.history.state as { nzDetail?: boolean } | null
    if (state?.nzDetail) {
      window.history.back()
      return
    }
    setView('offers')
  }

  function openCreate(): void {
    setRunAgain(null)
    setView('create')
  }

  const daysLeft = shop ? feeDaysLeft(shop) : null
  const renewSoon = shop?.paymentDone === true && daysLeft !== null && daysLeft <= 30

  return (
    <main
      className={`biz-dash${view === 'create' || view === 'detail' ? ' is-create' : ''}`}
    >
      <div className="biz-dash-shell" ref={shellRef}>
        {renewSoon && daysLeft !== null && (
          <div className="biz-renewbar" role="status">
            <span className="biz-renewbar-text">
              {daysLeft > 0
                ? `Your yearly listing renews in ${daysLeft} day${daysLeft === 1 ? '' : 's'} — ₹1,000 keeps you visible for another year.`
                : 'Your yearly listing has lapsed — customers can’t see your offers until you renew.'}
            </span>
            <button
              type="button"
              className="btn-danger biz-btn biz-renewbar-btn"
              onClick={onRenew}
            >
              Renew · ₹1,000
            </button>
          </div>
        )}
        {view === 'offers' && (
          <BusinessOffers
            offers={offers}
            onCreate={openCreate}
            onOpen={openDetail}
          />
        )}
        {view === 'insights' && (
          <BusinessInsights
            shopName={shop.name || 'Your shop'}
            offers={offers}
            views={viewEvents}
          />
        )}
        {view === 'shop' && (
          <BusinessShop
            uid={uid}
            shop={shop}
            unread={unread}
            onOpenInbox={() => setView('notifications')}
          />
        )}
        {view === 'notifications' && (
          <BusinessNotifications uid={uid} offers={offers} />
        )}
        {view === 'create' && (
          <BusinessOfferCreate
            uid={uid}
            shop={shop}
            initial={runAgain}
            onExit={() => setView('offers')}
          />
        )}
        {view === 'detail' &&
          (detailOffer ? (
            <BusinessOfferDetail
              uid={uid}
              shopName={shop.name || 'Your shop'}
              offer={detailOffer}
              onBack={closeDetail}
              onRunAgain={(source) => {
                setRunAgain(source)
                setView('create')
              }}
            />
          ) : (
            <section className="biz-missing">
              <h1 className="biz-detail-name">This offer isn’t here anymore.</h1>
              <p className="biz-detail-when">
                It may have been deleted from another tab or device.
              </p>
              <button
                type="button"
                className="btn-secondary biz-btn biz-missing-back"
                onClick={() => setView('offers')}
              >
                Back to offers
              </button>
            </section>
          ))}
        {view === 'home' && (
          <>
        <header className="biz-dash-top">
          <div>
            {firstName && (
              <p className="biz-dash-hello">Welcome, {firstName}</p>
            )}
            <h1 className="biz-dash-shop">
              {shop.name || 'Your shop'}
              {shop.verification === 'verified' && <ShieldSvg />}
            </h1>
          </div>
        </header>

        {!hasOffers ? (
          <>
            {shop.verification === 'pending' && (
              <div className="biz-dashnote">
                <ClockSvg />
                <p>
                  Verification in progress. Offers you create go live once
                  it’s done.
                </p>
              </div>
            )}
            <div className="biz-first">
              <div className="biz-first-tile" aria-hidden="true">
                1st
              </div>
              <div className="biz-first-main">
                <h2 className="biz-dash-h2">Post your first offer.</h2>
                <p className="biz-dash-body">
                  Shops with a live offer get seen on the NearZoop map by
                  people within 2–5 km. It takes about two minutes.
                </p>
                <button
                  type="button"
                  className="btn-primary biz-btn biz-dash-cta"
                  onClick={openCreate}
                >
                  <PlusSvg />
                  Create an offer
                </button>
                <p className="biz-dash-tip">
                  Tip: a clear, specific offer (“₹300 off tant sarees above
                  ₹2,000”) gets more saves than a vague one (“Big sale”).
                </p>
              </div>
            </div>
          </>
        ) : (
          <div className="biz-dashgrid">
            <section className="biz-hero">
              <span className="biz-hero-label">Last 7 days</span>
              <span className="biz-hero-pill">
                {liveCount} live {liveCount === 1 ? 'offer' : 'offers'}
              </span>
              <p className="biz-hero-big">{fmt(total((o) => o.redemptions))}</p>
              <p className="biz-hero-sub">verified redemptions</p>
            </section>

            <div className="biz-statrow">
              <div className="biz-statcard">
                <span className="biz-statcard-label">Views</span>
                <p className="biz-statcard-value">
                  {fmt(total((o) => o.views))}
                </p>
              </div>
              <div className="biz-statcard">
                <span className="biz-statcard-label">Saves</span>
                <p className="biz-statcard-value">
                  {fmt(total((o) => o.saves))}
                </p>
              </div>
              <div className="biz-statcard">
                <span className="biz-statcard-label">Directions</span>
                <p className="biz-statcard-value">
                  {fmt(total((o) => o.directions))}
                </p>
              </div>
            </div>

            <div className="biz-dash-actions">
              <button
                type="button"
                className="btn-primary biz-btn"
                onClick={openCreate}
              >
                <PlusSvg />
                New offer
              </button>
              <button
                type="button"
                className="btn-secondary biz-btn"
                onClick={() => setScanOpen(true)}
              >
                <QrSvg />
                Scan coupon
              </button>
            </div>

            {offers.some((o) => o.status === 'changes') && (
              <section className="biz-dash-attention">
                <h3 className="biz-dash-h3">Needs your attention</h3>
                {offers
                  .filter((o) => o.status === 'changes')
                  .map((o) => (
                    <button
                      key={o.id}
                      type="button"
                      className="biz-attention"
                      onClick={() => openDetail(o.id)}
                    >
                      <span className="biz-attention-icon">
                        <InfoSvg />
                      </span>
                      <span className="biz-attention-main">
                        <span className="biz-attention-title">
                          “{o.title ?? 'Offer'}” needs changes
                        </span>
                        <span className="biz-attention-sub">
                          {o.reviewNote || 'The review team left a note.'}
                        </span>
                      </span>
                      <span className="biz-attention-chev">
                        <ChevronSvg />
                      </span>
                    </button>
                  ))}
              </section>
            )}

            {liveOffers.length > 0 && (
            <section className="biz-dash-offers">
              <div className="biz-dash-rowhead">
                <h3 className="biz-dash-h3">Live now</h3>
                <button
                  type="button"
                  className="biz-linkbtn biz-seeall"
                  onClick={() => setView('offers')}
                >
                  All offers <span aria-hidden="true">→</span>
                </button>
              </div>
              {liveOffers.map((o) => (
                <article
                  key={o.id}
                  className="biz-offerrow"
                  onClick={() => openDetail(o.id)}
                >
                  <span className="biz-offerbadge">
                    <span className="biz-offerbadge-big">
                      {o.discountLabel ?? '—'}
                    </span>
                  </span>
                  <span className="biz-offer-main">
                    <span className="biz-offer-meta">
                      <span className="biz-offer-live">
                        <span className="biz-offer-dot" /> Live
                      </span>
                      {o.startsAt && o.endsAt && (
                        <span>
                          {fmtDay(o.startsAt)} – {fmtDay(o.endsAt)}
                        </span>
                      )}
                    </span>
                    <span className="biz-offer-title">
                      {o.title ?? 'Untitled offer'}
                    </span>
                    <span className="biz-offer-stats">
                      {fmt(o.views ?? 0)} views · {fmt(o.saves ?? 0)} saves ·{' '}
                      {fmt(o.redemptions ?? 0)} redeemed
                    </span>
                  </span>
                </article>
              ))}
            </section>
            )}
          </div>
        )}

        <button
          type="button"
          className="biz-linkbtn biz-dash-signout"
          onClick={onSignOut}
        >
          Sign out
        </button>
          </>
        )}
      </div>

      <nav className="biz-dashnav" aria-label="Business sections">
        <button
          type="button"
          className="biz-navcompose"
          onClick={() => setScanOpen(true)}
        >
          <NavIcon kind="scan" />
          Scan
        </button>
        <button
          type="button"
          className={`biz-navitem${view === 'home' ? ' is-active' : ''}`}
          onClick={() => setView('home')}
        >
          <NavIcon kind="home" />
          <span>Home</span>
        </button>
        <button
          type="button"
          className={`biz-navitem${view === 'offers' ? ' is-active' : ''}`}
          onClick={() => setView('offers')}
        >
          <NavIcon kind="offers" />
          <span>Offers</span>
        </button>
        <button type="button" className="biz-navscan" onClick={() => setScanOpen(true)}>
          <span className="biz-navscan-chip">
            <NavIcon kind="scan" />
          </span>
          <span>Scan</span>
        </button>
        <button
          type="button"
          className={`biz-navitem${view === 'insights' ? ' is-active' : ''}`}
          onClick={() => setView('insights')}
        >
          <NavIcon kind="insights" />
          <span>Insights</span>
        </button>
        <button
          type="button"
          className={`biz-navitem${view === 'shop' ? ' is-active' : ''}`}
          onClick={() => setView('shop')}
        >
          <NavIcon kind="shop" />
          <span>Shop</span>
        </button>
        <button
          type="button"
          className={`biz-navitem${view === 'notifications' ? ' is-active' : ''}`}
          onClick={() => setView('notifications')}
        >
          <NavIcon kind="bell" />
          <span>
            Notifications
            {unread !== null && unread > 0 && (
              <b className="biz-navdot" aria-label={`${unread} unread`}>
                {unread}
              </b>
            )}
          </span>
        </button>
        <button type="button" className="biz-navsignout" onClick={onSignOut}>
          <LogoutSvg />
          <span>Sign out</span>
        </button>
      </nav>

      {scanOpen && (
        <BusinessScan
          uid={uid}
          ownerName={shop.ownerName}
          manualOffers={scanOffers}
          onClose={() => setScanOpen(false)}
        />
      )}
    </main>
  )
}
