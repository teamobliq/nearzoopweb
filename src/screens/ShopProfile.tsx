import { useEffect, useRef, useState } from 'react'
import { AttributionControl, Map as MLMap, Marker } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { cachedCoords, haversineKm } from '../business/geocode'
import { watchShop, feeExpired, type ShopRecord } from '../business/shop'
import {
  followShop,
  unfollowShop,
  watchFollowState,
} from '../business/follows'
import { enablePush } from '../business/push'
import { watchFeed, type FeedRecord } from '../business/feed'
import { fmtDay } from '../business/when'
import { nzMapStyle } from '../business/maplibreUtils'
import './customer.css'

/* ---- Icons ------------------------------------------------------------- */

function BackSvg() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M15 5l-7 7 7 7" />
    </svg>
  )
}

function UploadSvg() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 15V3" />
      <path d="M8 7l4-4 4 4" />
      <path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
    </svg>
  )
}

function DirectionsSvg() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21.5 2.5 2.8 9.9c-.8.3-.8 1.4 0 1.7l7.6 2.7 2.7 7.6c.3.8 1.4.8 1.7 0L21.5 2.5Z" />
    </svg>
  )
}

function PhoneSvg() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92Z" />
    </svg>
  )
}

function PlusSvg() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

function CheckSvg() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 6L9 17l-5-5" />
    </svg>
  )
}

function BookmarkSvg({ filled }: { filled?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M7 4h10v17l-5-4.5L7 21Z" />
    </svg>
  )
}

function ShareSvg() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <path d="M8.6 10.7l6.8-4.1M8.6 13.3l6.8 4.1" />
    </svg>
  )
}

function ShieldCheckSvg() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 2.4 4.8 5v6c0 4.5 3 8.4 7.2 9.6 4.2-1.2 7.2-5.1 7.2-9.6V5L12 2.4Z"
      />
      <path
        d="m8.7 11.8 2.3 2.3 4.3-4.6"
        fill="none"
        stroke="#ffffff"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function StoreSvg() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4.5 9.5V6.2c0-.7.5-1.2 1.2-1.2h12.6c.7 0 1.2.5 1.2 1.2v3.3" />
      <path d="M3 9.5h18l-1.4 2.4a2.2 2.2 0 0 1-3.8 0 2.2 2.2 0 0 1-3.8 0 2.2 2.2 0 0 1-3.8 0 2.2 2.2 0 0 1-3.8 0L3 9.5Z" />
      <path d="M5 12v7h14v-7" />
      <path d="M9.6 19v-4h4.8v4" />
    </svg>
  )
}

function StoreSmallSvg() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.1"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4.5 10V6.4c0-.5.4-.9.9-.9h13.2c.5 0 .9.4.9.9V10" />
      <path d="M3 10h18l-1.2 2a2 2 0 0 1-3.5 0 2 2 0 0 1-3.5 0 2 2 0 0 1-3.5 0 2 2 0 0 1-3.5 0L3 10Z" />
      <path d="M5 12.5V19h14v-6.5" />
    </svg>
  )
}

function PinSvg() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.1"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 21s-6.5-5.4-6.5-10a6.5 6.5 0 1 1 13 0C18.5 15.6 12 21 12 21Z" />
      <circle cx="12" cy="11" r="2.4" />
    </svg>
  )
}

function ClockSvg() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.1"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  )
}

function ExpandSvg() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" />
    </svg>
  )
}

function NavSvg() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 11.5 21 3l-8.5 18-2.2-7.3L3 11.5Z" />
    </svg>
  )
}

/* ---- Formatting -------------------------------------------------------- */

function fmtTime(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const displayH = h % 12 || 12
  return `${displayH}:${m.toString().padStart(2, '0')} ${ampm}`
}

/** "1.1 km" — the shop page keeps one decimal so short walks read honestly. */
function fmtDistance(km: number): string {
  if (km < 0.1) return '<0.1 km'
  return `${km < 10 ? km.toFixed(1) : String(Math.round(km))} km`
}

function todayHours(shop: ShopRecord) {
  return new Date().getDay() === 0
    ? shop.openingHours?.sunday
    : shop.openingHours?.monSat
}

/** Whether the doors are open right now — verified, paid, not on holiday,
    and inside today's saved window. A missing window means no claim. */
function isOpenNow(shop: ShopRecord): boolean {
  if (
    shop.verification !== 'verified' ||
    shop.paymentDone !== true ||
    feeExpired(shop) ||
    shop.holidayMode
  ) {
    return false
  }
  const hours = todayHours(shop)
  if (!hours || hours === 'closed') return false
  const [openH, openM] = hours.opens.split(':').map(Number)
  const [closeH, closeM] = hours.closes.split(':').map(Number)
  if (![openH, openM, closeH, closeM].every(Number.isFinite)) return false
  const now = new Date()
  const minutes = now.getHours() * 60 + now.getMinutes()
  const opens = openH * 60 + openM
  const closes = closeH * 60 + closeM
  return closes > opens
    ? minutes >= opens && minutes < closes
    : minutes >= opens || minutes < closes
}

/** Bookmarks ride in the same `nz.saved` list as the home feed, so an offer
    saved here is already lit on its card when the customer goes back. */
function readSaved(): Set<string> {
  try {
    return new Set<string>(JSON.parse(localStorage.getItem('nz.saved') ?? '[]'))
  } catch {
    return new Set<string>()
  }
}

/** The shop's map — its own small MapLibre canvas so the profile controls
    the framing and the single pin. */
function ShopMap({
  lat,
  lng,
  title,
}: {
  lat: number
  lng: number
  title: string
}) {
  const hostRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    let cancelled = false
    let map: MLMap | null = null
    let marker: Marker | null = null
    let observer: ResizeObserver | null = null

    void (async () => {
      const style = await nzMapStyle()
      if (cancelled || !hostRef.current) return
      map = new MLMap({
        container: hostRef.current,
        style,
        center: [lng, lat],
        zoom: 14.6,
        attributionControl: false,
        scrollZoom: false,
        dragRotate: false,
        pitchWithRotate: false,
      })
      map.addControl(new AttributionControl({ compact: true }), 'top-left')

      const el = document.createElement('div')
      el.className = 'shop-map-pin'
      el.innerHTML =
        '<svg viewBox="0 0 32 40" width="30" height="38" aria-hidden="true">' +
        '<path d="M16 38.5S2.5 24.2 2.5 15.2C2.5 7.9 8.5 2 16 2s13.5 5.9 13.5 13.2C29.5 24.2 16 38.5 16 38.5Z" fill="#fb4b32" stroke="#1c1b19" stroke-width="2.2"/>' +
        '<circle cx="16" cy="15" r="4.3" fill="#ffffff"/>' +
        '</svg>'
      marker = new Marker({ element: el, anchor: 'bottom' })
        .setLngLat([lng, lat])
        .addTo(map)

      observer = new ResizeObserver(() => map?.resize())
      observer.observe(host)
    })()

    return () => {
      cancelled = true
      observer?.disconnect()
      marker?.remove()
      map?.remove()
      map = null
    }
  }, [lat, lng])

  return (
    <div
      ref={hostRef}
      className="shop-map-canvas"
      role="region"
      aria-label={`Map showing ${title}`}
    />
  )
}

/* ---- Screen ------------------------------------------------------------ */

type ShopTab = 'overview' | 'offers' | 'details' | 'reviews'

const TABS: Array<{ key: ShopTab; label: string }> = [
  { key: 'overview', label: 'Overview' },
  { key: 'offers', label: 'Offers' },
  { key: 'details', label: 'Details' },
  { key: 'reviews', label: 'Reviews' },
]

type Props = {
  uid: string
  /** Fallback when there is no shop history entry to pop. */
  onBack: () => void
  /** Opens an offer from the Live offers section — without it the cards
      still render, just inert. */
  onOpenOffer?: (shopUid: string, offerId: string) => void
  /** The signed-in customer's uid — absent means browsing as guest, and
      the Follow button routes to sign-in instead of writing. */
  viewerUid?: string
  /** Guests are routed to sign-in from the Follow button. */
  onSignIn?: () => void
}

/** The customer-facing shop profile: cover, identity, actions, tabs, live
    offers, details and the map — the shopkeeper's page. Opened by tapping a
    shop name on an offer card. */
export default function ShopProfile({
  uid,
  onBack,
  onOpenOffer,
  viewerUid,
  onSignIn,
}: Props) {
  const [shop, setShop] = useState<ShopRecord | null>(null)
  const [shopLoaded, setShopLoaded] = useState(false)
  const [feed, setFeed] = useState<FeedRecord[] | null>(null)
  const [tab, setTab] = useState<ShopTab>('overview')
  const [saved, setSaved] = useState<Set<string>>(readSaved)
  const [now, setNow] = useState(() => Date.now())
  const [mapExpanded, setMapExpanded] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [fix] = useState(() => cachedCoords())
  // Follow state — null while the first read is in flight, so the button never
  // flashes a false "Follow" before the answer lands. Guests start at
  // false and their tap routes to sign-in instead of writing.
  const [following, setFollowing] = useState<boolean | null>(() =>
    viewerUid ? null : false,
  )
  const [followBusy, setFollowBusy] = useState(false)

  // Opening a shop from a scrolled offer list should land at the cover,
  // not halfway down the page.
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [uid])

  useEffect(() => {
    if (!viewerUid) return
    return watchFollowState(uid, viewerUid, setFollowing)
  }, [uid, viewerUid])

  useEffect(() => {
    const unsub = watchShop(uid, (record) => {
      setShop(record)
      setShopLoaded(true)
    })
    return unsub
  }, [uid])

  useEffect(() => {
    const unsub = watchFeed((items) => {
      setNow(Date.now())
      setFeed(items)
    })
    return unsub
  }, [])

  useEffect(() => {
    if (!note) return
    const timer = window.setTimeout(() => setNote(null), 2400)
    return () => window.clearTimeout(timer)
  }, [note])

  useEffect(() => {
    if (!mapExpanded) return
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setMapExpanded(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mapExpanded])

  /** The offer mirrors the public feed carries for this shop, narrowed to
      what a customer may see right now — same rules as the home feed. */
  const liveOffers = (feed ?? []).filter((item) => {
    if (item.shopUid !== uid) return false
    if (item.status !== 'live' || item.shopPaused) return false
    if (
      item.feeExpiresAt &&
      item.feeExpiresAt <= new Date(now).toISOString()
    ) {
      return false
    }
    if (item.startsAt && Date.parse(item.startsAt) > now) return false
    if (item.endsAt && Date.parse(item.endsAt) < now) return false
    return true
  })

  const distKm =
    fix && typeof shop?.lat === 'number' && typeof shop?.lng === 'number'
      ? haversineKm(fix, { lat: shop.lat, lng: shop.lng })
      : null
  const distanceLine =
    distKm === null ? 'Distance unavailable' : `${fmtDistance(distKm)} from you`

  const hours = shop ? todayHours(shop) : null
  const hoursText =
    hours && typeof hours === 'object'
      ? `${fmtTime(hours.opens)} – ${fmtTime(hours.closes)}`
      : hours === 'closed'
        ? 'Closed today'
        : 'Hours not set'

  const openNow = shop ? isOpenNow(shop) : false
  const phone =
    shop && shop.showPhone !== false ? shop.customerPhone?.trim() : ''
  const hasCoords =
    typeof shop?.lat === 'number' && typeof shop?.lng === 'number'

  function goBack() {
    const state = window.history.state as { nzScreen?: string } | null
    if (state?.nzScreen === 'shop') {
      window.history.back()
      return
    }
    onBack()
  }

  function openDirections() {
    if (!shop) return
    const destination = hasCoords
      ? `${shop.lat},${shop.lng}`
      : encodeURIComponent(shop.address ?? '')
    window.open(
      `https://www.google.com/maps/dir/?api=1&destination=${destination}`,
      '_blank',
      'noopener,noreferrer',
    )
  }

  async function shareShop() {
    if (!shop) return
    const offer = liveOffers[0]
    const url = offer
      ? `${window.location.origin}${import.meta.env.BASE_URL}${encodeURIComponent(uid)}/${encodeURIComponent(offer.offerId)}`
      : window.location.href
    const data = {
      title: shop.name,
      text: `${shop.name} on NearZoop`,
      url,
    }
    try {
      if (navigator.share) {
        await navigator.share(data)
        return
      }
      await navigator.clipboard.writeText(url)
      setNote('Shop link copied')
    } catch {
      // Share sheet dismissed or clipboard blocked — nothing to report.
    }
  }

  /** The Follow button — signs the customer in if they're a guest, flips
      their follow state in both indexes, and asks for push permission on
      the first follow (a user gesture, so the browser allows it). */
  async function toggleFollow() {
    if (!shop || followBusy) return
    if (!viewerUid) {
      onSignIn?.()
      return
    }
    setFollowBusy(true)
    const currently = following === true
    try {
      if (currently) {
        await unfollowShop(uid, viewerUid)
        setNote(`Unfollowed ${shop.name}`)
      } else {
        // Fire the push ask before any await — browsers only honour a
        // notification-permission prompt inside a user gesture window.
        void enablePush(viewerUid)
        await followShop(uid, viewerUid, {
          shopName: shop.name,
          shopCategory: shop.category,
          shopPhotoUrl: shop.shopPhotoUrl,
        })
        setNote(`Following ${shop.name} — you'll hear the moment they post new offers.`)
      }
    } catch {
      setNote("Couldn't update that — check the connection and try again.")
    }
    setFollowBusy(false)
  }

  function toggleSaved(offerId: string) {
    setSaved((current) => {
      const next = new Set(current)
      if (next.has(offerId)) {
        next.delete(offerId)
      } else {
        next.add(offerId)
      }
      try {
        localStorage.setItem('nz.saved', JSON.stringify([...next]))
      } catch {
        // Storage blocked — the bookmark lasts this visit only.
      }
      return next
    })
  }

  function toggleMap() {
    setMapExpanded((value) => !value)
  }

  const offersSection = (
    <section className="shop-section">
      <h2 className="shop-section-title">
        Live offers <span className="shop-section-dot">•</span>{' '}
        <span className="shop-section-count">{liveOffers.length}</span>
      </h2>
      {feed === null ? (
        <div className="shop-empty-card">Loading offers…</div>
      ) : liveOffers.length === 0 ? (
        <div className="shop-empty-card">
          No live offers right now — check back soon.
        </div>
      ) : (
        <ul className="shop-offers">
          {liveOffers.map((item) => {
            const label = item.discountLabel?.trim() ?? ''
            const splitAt = label.indexOf(' ')
            const big =
              label === '' ? '—' : splitAt === -1 ? label : label.slice(0, splitAt)
            const small = label === '' ? '' : label.slice(splitAt + 1)
            return (
              <li key={item.offerId}>
                <article className="shop-offer-card">
                  <button
                    type="button"
                    className="shop-offer-hit"
                    onClick={() => onOpenOffer?.(uid, item.offerId)}
                    aria-label={`Open ${item.title ?? 'offer'} at ${item.shopName}`}
                  >
                    <span
                      className={`shop-offer-tile shop-offer-tile--${item.tileColor ?? 'red'}`}
                      aria-hidden="true"
                    >
                      <span className="shop-offer-tile-big">{big}</span>
                      {small && (
                        <span className="shop-offer-tile-small">{small}</span>
                      )}
                    </span>
                    <div className="shop-offer-body">
                      <h3 className="shop-offer-title">
                        {item.title ?? 'Untitled offer'}
                      </h3>
                      <p className="shop-offer-shop">
                        <StoreSmallSvg />
                        {item.shopName}
                      </p>
                      <div className="shop-offer-meta">
                        {distKm !== null && (
                          <span className="shop-offer-pill">
                            <PinSvg />
                            {fmtDistance(distKm)}
                          </span>
                        )}
                        {item.endsAt && (
                          <span className="shop-offer-pill">
                            <ClockSvg />
                            Ends {fmtDay(item.endsAt)}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                  <button
                    type="button"
                    className="shop-offer-save"
                    aria-label={
                      saved.has(item.offerId)
                        ? 'Remove bookmark'
                        : 'Bookmark offer'
                    }
                    aria-pressed={saved.has(item.offerId)}
                    onClick={() => toggleSaved(item.offerId)}
                  >
                    <BookmarkSvg filled={saved.has(item.offerId)} />
                  </button>
                </article>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )

  const detailsSection = (
    <section className="shop-section">
      <h2 className="shop-section-title">Details</h2>
      <div className="shop-detail-card">
        <div className="shop-detail-row">
          <span className="shop-detail-icon">
            <ClockSvg />
          </span>
          <div className="shop-detail-text">
            <strong>Today</strong>
            <span>{hoursText}</span>
          </div>
        </div>
        {phone && (
          <div className="shop-detail-row">
            <span className="shop-detail-icon">
              <PhoneSvg />
            </span>
            <div className="shop-detail-text">
              <strong>{phone}</strong>
              <span>Listed by the shop</span>
            </div>
          </div>
        )}
        <div className="shop-detail-row">
          <span className="shop-detail-icon">
            <PinSvg />
          </span>
          <div className="shop-detail-text">
            <strong>{shop?.address}</strong>
            <span>{distanceLine}</span>
          </div>
        </div>
      </div>
    </section>
  )

  if (!shop && shopLoaded) {
    return (
      <main className="shop-profile">
        <div className="shop-shell">
          <header className="shop-head">
            <button
              type="button"
              className="shop-round"
              onClick={goBack}
              aria-label="Go back"
            >
              <BackSvg />
            </button>
            <button
              type="button"
              className="shop-round"
              aria-label="Share shop"
              disabled
            >
              <UploadSvg />
            </button>
          </header>
          <div className="shop-unavailable">
            <StoreSvg />
            <h1>This shop isn’t available.</h1>
            <p>It may have closed or moved — head back and keep looking.</p>
          </div>
        </div>
      </main>
    )
  }

  if (!shop) {
    return (
      <main className="shop-profile">
        <div className="shop-shell">
          <header className="shop-head">
            <button
              type="button"
              className="shop-round"
              onClick={goBack}
              aria-label="Go back"
            >
              <BackSvg />
            </button>
            <span />
          </header>
          <p className="shop-loading" role="status">
            Loading shop…
          </p>
        </div>
      </main>
    )
  }

  return (
    <main className="shop-profile">
      <div className="shop-shell">
        <header className="shop-head">
          <button
            type="button"
            className="shop-round"
            onClick={goBack}
            aria-label="Go back"
          >
            <BackSvg />
          </button>
          <button
            type="button"
            className="shop-round"
            onClick={shareShop}
            aria-label="Share shop"
          >
            <UploadSvg />
          </button>
        </header>

        <section className="shop-hero">
          <div className="shop-cover-card">
            {shop.shopPhotoUrl ? (
              <img
                className="shop-cover-img"
                src={shop.shopPhotoUrl}
                alt={`${shop.name} shop front`}
              />
            ) : (
              <div className="shop-cover-blank">
                <span className="shop-cover-store">
                  <StoreSvg />
                </span>
                <span className="shop-cover-label">Shop front photo</span>
              </div>
            )}
          </div>

          <div className="shop-info">
            <div className="shop-badges">
              <span className="shop-badge shop-badge--category">
                {shop.category?.trim() || 'Shop'}
              </span>
              {shop.verification === 'verified' && (
                <span className="shop-badge shop-badge--verified">
                  <ShieldCheckSvg />
                  Verified by NearZoop
                </span>
              )}
              {openNow && (
                <span className="shop-badge shop-badge--open">Open now</span>
              )}
            </div>

            <h1 className="shop-name">{shop.name}</h1>
            <p className="shop-address">{shop.address}</p>

            <div className="shop-actions">
              <button
                type="button"
                className="shop-action shop-action--directions"
                onClick={openDirections}
              >
                <span className="shop-action-icon">
                  <DirectionsSvg />
                </span>
                <span className="shop-action-text">
                  <strong>Directions</strong>
                  <span>
                    {distKm !== null ? fmtDistance(distKm) : 'Open maps'}
                  </span>
                </span>
              </button>
              <button
                type="button"
                className="shop-action"
                onClick={() => {
                  if (phone) window.location.href = `tel:${phone}`
                }}
                disabled={!phone}
              >
                <span className="shop-action-icon">
                  <PhoneSvg />
                </span>
                <span className="shop-action-text">
                  <strong>Call</strong>
                  <span>Shop</span>
                </span>
              </button>
              <button
                type="button"
                className={`shop-action${following ? ' is-on' : ''}`}
                onClick={() => void toggleFollow()}
                aria-pressed={following === true}
                disabled={followBusy}
              >
                <span className="shop-action-icon">
                  {following ? <CheckSvg /> : <PlusSvg />}
                </span>
                <span className="shop-action-text">
                  <strong>{following ? 'Following' : 'Follow'}</strong>
                  <span>{following ? 'Updates on' : 'Updates'}</span>
                </span>
              </button>
              <button
                type="button"
                className="shop-action"
                onClick={shareShop}
              >
                <span className="shop-action-icon">
                  <ShareSvg />
                </span>
                <span className="shop-action-text">
                  <strong>Share</strong>
                  <span>Shop link</span>
                </span>
              </button>
            </div>
          </div>
        </section>

        <div className="shop-tabs" role="tablist" aria-label="Shop sections">
          {TABS.map((entry) => (
            <button
              key={entry.key}
              type="button"
              role="tab"
              aria-selected={tab === entry.key}
              className={`shop-tab${tab === entry.key ? ' is-on' : ''}`}
              onClick={() => setTab(entry.key)}
            >
              {entry.label}
            </button>
          ))}
        </div>

        <div className="shop-grid">
          <div className="shop-main">
            {tab === 'overview' && (
              <>
                {offersSection}
                {detailsSection}
              </>
            )}
            {tab === 'offers' && offersSection}
            {tab === 'details' && detailsSection}
            {tab === 'reviews' && (
              <section className="shop-section">
                <h2 className="shop-section-title">Reviews</h2>
                <div className="shop-empty-card">
                  No reviews yet. Be the first to review {shop.name} after
                  your next visit.
                </div>
              </section>
            )}
          </div>

          <aside className="shop-side">
            <div
              className={`shop-map-card${mapExpanded ? ' is-expanded' : ''}`}
            >
              {hasCoords ? (
                <ShopMap
                  lat={shop.lat as number}
                  lng={shop.lng as number}
                  title={shop.name}
                />
              ) : (
                <div className="shop-map-fallback">
                  <PinSvg />
                  <span>Location not pinned</span>
                </div>
              )}
              <button
                type="button"
                className="shop-map-expand"
                onClick={toggleMap}
                aria-label={mapExpanded ? 'Close map' : 'Expand map'}
                aria-pressed={mapExpanded}
              >
                <ExpandSvg />
              </button>
              <div className="shop-map-foot">
                <span className="shop-map-dist">
                  <PinSvg />
                  {distanceLine}
                </span>
                <button
                  type="button"
                  className="shop-map-dir"
                  onClick={openDirections}
                >
                  <NavSvg />
                  Get Directions
                </button>
              </div>
            </div>
          </aside>
        </div>
      </div>

      {note && (
        <p className="shop-toast" role="status">
          {note}
        </p>
      )}
    </main>
  )
}
