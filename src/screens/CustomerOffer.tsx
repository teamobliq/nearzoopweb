import { useEffect, useRef, useState } from 'react'
import { AttributionControl, Map as MLMap, Marker } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { FeedRecord } from '../business/feed'
import {
  fetchFeedOffer,
  feedDisplayStatus,
  feedFeeLapsed,
} from '../business/feed'
import {
  countOfferView,
  feeExpired,
  watchShop,
  REPORT_REASONS,
  saveReport,
  type ShopRecord,
} from '../business/shop'
import {
  cachedCoords,
  haversineKm,
} from '../business/geocode'
import {
  claimCoupon,
  couponState,
  findMyCoupon,
  type CouponRecord,
} from '../business/coupons'
import { requestRatePrompt, watchShopReviews, type ReviewSummary } from '../business/reviews'
import { fmtDay, fmtWhen, rel } from '../business/when'
import { nzMapStyle } from '../business/maplibreUtils'
import './customer.css'

/** The shared-offer landing — `<base>/<shopUid>/<offerId>?source=…` lands
    here. Reads the offer's public feed mirror (feed.ts): the only copy of
    an offer a visitor is allowed to see. The shop card on the right reads
    the shop doc directly — shops/{uid} is publicly readable — for the
    details the mirror intentionally omits (hours, phone, address).
    Claiming needs an account, so the CTA routes to sign-in. Internal
    statuses never get a mirror, so they resolve to an honest "not
    available" screen instead of pretending the offer is live. */

type Props = {
  uid: string
  offerId: string
  onSignIn: () => void
  /** Leaves the offer — the list it was opened from, or Home for a shared
      link. */
  onBack: () => void
  /** Opens the shop's profile — the shop card's chevron navigates there.
      Absent when the landing has no way forward (e.g. deep links). */
  onOpenShop?: (uid: string) => void
  signedIn?: boolean
  /** The signed-in customer's uid — the coupon claim is filed under it. */
  viewerUid?: string
}

const CHIP: Partial<
  Record<'live' | 'scheduled' | 'ended', { label: string; kind: string; dot?: boolean }>
> = {
  live: { label: 'Active', kind: 'live', dot: true },
  scheduled: { label: 'Scheduled', kind: 'scheduled' },
  ended: { label: 'Ended', kind: 'gray' },
}

/** How the customer proves the offer, phrased for the visitor (the
    merchant screen's wording is staff-facing). */
function customerRedeemLine(
  offer: Pick<FeedRecord, 'redeemKind' | 'redeemCode' | 'redeemCustom'>,
): string | null {
  switch (offer.redeemKind) {
    case 'screen':
      return 'Show this offer at the counter.'
    case 'code':
      return offer.redeemCode ? `Use the code “${offer.redeemCode}”.` : null
    case 'coupon':
      return 'Claim a single-use coupon in the app.'
    case 'custom':
      return offer.redeemCustom ?? null
    default:
      return null
  }
}

/** The terms the merchant set — same rule as the merchant screen. */
function termsLine(
  offer: Pick<FeedRecord, 'minBill' | 'inStoreOnly' | 'newCustomersOnly'>,
): string | null {
  const bits: string[] = []
  if (offer.minBill && offer.minBill > 0) {
    bits.push(`min bill ₹${offer.minBill.toLocaleString('en-IN')}`)
  }
  if (offer.inStoreOnly) bits.push('in-store only')
  if (offer.newCustomersOnly) bits.push('new customers only')
  return bits.length ? bits.join(' · ') : null
}

/** Date in the design's voice: "15 Oct 2026". */
function fmtFullDate(iso?: string): string | null {
  if (!iso) return null
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date
    .toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

/** Date + time in the design's voice: "31 Oct 2026, 8:30 PM". */
function fmtFullDateTime(iso?: string): string | null {
  if (!iso) return null
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date
    .toLocaleString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    })
    .replace('am', 'AM')
    .replace('pm', 'PM')
}

/** "1.2 km" — the distance labels across the screen share it. */
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
function isOpenNow(shop: ShopRecord, at: Date = new Date()): boolean {
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
  const now = at
  const minutes = now.getHours() * 60 + now.getMinutes()
  const opens = openH * 60 + openM
  const closes = closeH * 60 + closeM
  return closes > opens
    ? minutes >= opens && minutes < closes
    : minutes >= opens || minutes < closes
}

function fmtTime(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number)
  const minutes = Number.isFinite(m) ? m : 0
  const ampm = h >= 12 ? 'PM' : 'AM'
  const displayH = h % 12 || 12
  return `${displayH}:${String(minutes).padStart(2, '0')} ${ampm}`
}

function BackSvg() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M15 5l-7 7 7 7" />
    </svg>
  )
}

function UploadSvg() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="M17 8l-5-5-5 5" />
      <path d="M12 3v12" />
    </svg>
  )
}

function BookmarkSvg({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1Z" />
    </svg>
  )
}

function PlaneSvg() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M22 2L11 13" />
      <path d="M22 2l-7 20-4-9-9-4 20-7Z" />
    </svg>
  )
}

function TicketSvg() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 9a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v1a2 2 0 0 0 0 4v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1a2 2 0 0 0 0-4V9Z" />
      <path d="M13 7v2" />
      <path d="M13 12v2" />
      <path d="M13 17v1" />
    </svg>
  )
}

function ClockSvg() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  )
}

function PhoneSvg() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.128.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 11.91a16 16 0 0 0 6 6l3.27-1.27a2 2 0 0 1 2.11.45c.907.339 1.85.572 2.81.7A2 2 0 0 1 22 16.92Z" />
    </svg>
  )
}

function PinSvg() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 21s-6.5-5.4-6.5-10a6.5 6.5 0 1 1 13 0C18.5 15.6 12 21 12 21Z" />
      <circle cx="12" cy="11" r="2.4" />
    </svg>
  )
}

function ChevronSvg() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 6l6 6-6 6" />
    </svg>
  )
}

function ExpandSvg() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M15 3h6v6" />
      <path d="M9 21H3v-6" />
      <path d="M21 3l-7 7" />
      <path d="M3 21l7-7" />
    </svg>
  )
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

/** The shop's map — its own small MapLibre canvas so the card controls the
    framing and the single pin. */
function ShopMap({
  lat,
  lng,
  title,
  expanded,
}: {
  lat: number
  lng: number
  title: string
  expanded: boolean
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

  useEffect(() => {
    // The expanded state only grows the container; maplibre needs the nudge.
    const host = hostRef.current
    if (!host) return
    const frame = window.requestAnimationFrame(() => {
      host.style.setProperty('--expanded', expanded ? '1' : '0')
    })
    return () => window.cancelAnimationFrame(frame)
  }, [expanded])

  return (
    <div
      ref={hostRef}
      className={`shop-map-canvas${expanded ? ' is-expanded' : ''}`}
      role="region"
      aria-label={`Map showing ${title}`}
    />
  )
}

/** The argued offering — the claim dialog body. */
function CouponPass({ coupon, qr }: { coupon: CouponRecord; qr: string }) {
  const state = couponState(coupon)
  return (
    <section className={`cust-pass${state === 'valid' ? '' : ' is-spent'}`}>
      <div className="cust-pass-qr">
        {qr ? (
          <span dangerouslySetInnerHTML={{ __html: qr }} />
        ) : (
          <span className="cust-pass-qrwait" aria-hidden="true" />
        )}
      </div>
      <div className="cust-pass-main">
        <span className="cust-pass-eyebrow">
          {state === 'used'
            ? 'Used'
            : state === 'expired'
              ? 'Expired'
              : 'Your coupon'}
        </span>
        <p className="cust-pass-code">{coupon.code}</p>
        <p className="cust-pass-note">
          {state === 'used'
            ? `Redeemed${coupon.usedAt ? ` on ${fmtWhen(coupon.usedAt)}` : ''}.`
            : state === 'expired'
              ? 'This coupon expired with the offer.'
              : 'Single use. Show it at the counter — the shop scans it.'}
        </p>
        {coupon.endsAt && state === 'valid' && (
          <p className="cust-pass-meta">Valid till {fmtWhen(coupon.endsAt)}</p>
        )}
      </div>
    </section>
  )
}

export default function CustomerOffer({
  uid,
  offerId,
  onSignIn,
  onBack,
  onOpenShop,
  signedIn = false,
  viewerUid,
}: Props) {
  const [item, setItem] = useState<FeedRecord | null>(null)
  const [shopDoc, setShopDoc] = useState<ShopRecord | null>(null)
  const [missing, setMissing] = useState(false)
  const [paused, setPaused] = useState(false)
  const [inactive, setInactive] = useState(false)
  // Report flow — the one way a visitor can flag a bad offer back to the
  // shop. Declared up here with the other hooks; the dialog renders only
  // for public offers.
  const [reportOpen, setReportOpen] = useState(false)
  const [reportReason, setReportReason] = useState<string | null>(null)
  const [reportNote, setReportNote] = useState('')
  const [reportBusy, setReportBusy] = useState(false)
  const [reportError, setReportError] = useState('')
  const [reportDone, setReportDone] = useState(false)
  // A claimed coupon — when one exists the pass replaces the claim button,
  // so a reload never loses what the customer already owns.
  const [coupon, setCoupon] = useState<CouponRecord | null>(null)
  // QR svg keyed by the code it was generated for — a stale QR never
  // renders against a different coupon, and no sync reset is needed.
  const [couponQr, setCouponQr] = useState<{ code: string; svg: string } | null>(null)
  const [claiming, setClaiming] = useState(false)
  const [claimError, setClaimError] = useState('')
  const [claimDialog, setClaimDialog] = useState<CouponRecord | null>(null)
  const [claimDialogQr, setClaimDialogQr] = useState<{ code: string; svg: string } | null>(null)
  const [mapExpanded, setMapExpanded] = useState(false)
  const [savedIds, setSavedIds] = useState<Set<string>>(() => readSaved())
  // A fix for the distance labels, read from the shared customer cache.
  // Null when the device never granted location — every label hides then.
  const [fix] = useState<{ lat: number; lng: number } | null>(() => cachedCoords())
  // Reviews for the shop card's average chip — live from the reviews
  // collection; guests see it too (reads are public).
  const [reviewSummary, setReviewSummary] = useState<ReviewSummary>({
    reviews: [],
    count: 0,
    average: 0,
  })
  // A ticking clock — the open/closed chip and the offer's Started/Scheduled
  // chip flip on their own as time passes, without a reload.
  const [nowTs, setNowTs] = useState(() => Date.now())

  useEffect(() => {
    const id = window.setInterval(() => setNowTs(Date.now()), 30_000)
    return () => window.clearInterval(id)
  }, [])

  // Already claimed? Read it back once the offer is known. Declared before
  // any early return so the hook order never changes.
  useEffect(() => {
    if (!viewerUid || !item) return
    if ((item.redeemKind ?? 'screen') !== 'coupon') return
    let alive = true
    void findMyCoupon(viewerUid, offerId)
      .then((found) => {
        if (alive && found) setCoupon(found)
      })
      .catch(() => {
        // Offline or rules trouble — the claim button still tries.
      })
    return () => {
      alive = false
    }
  }, [viewerUid, item, offerId])

  // The pass's QR. The encoder is imported lazily so guests — the majority
  // of shared-link visitors — never download it.
  useEffect(() => {
    if (!coupon) return
    const code = coupon.code
    let alive = true
    void import('qrcode')
      .then((qr) =>
        qr.toString(code, { type: 'svg', margin: 1, width: 220 }),
      )
      .then((svg) => {
        if (alive) setCouponQr({ code, svg })
      })
      .catch(() => {
        // The printed code below works without the QR.
      })
    return () => {
      alive = false
    }
  }, [coupon])

  // The claim dialog's QR — same code, generated once when the dialog opens.
  useEffect(() => {
    if (!claimDialog) return
    const code = claimDialog.code
    let alive = true
    void import('qrcode')
      .then((qr) =>
        qr.toString(code, { type: 'svg', margin: 1, width: 220 }),
      )
      .then((svg) => {
        if (alive) setClaimDialogQr({ code, svg })
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [claimDialog])

  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        const data = await fetchFeedOffer(uid, offerId)
        if (!alive) return
        // No mirror: a dead link, an offer that was never approved, or a
        // shop that lost its verification — all say the same honest thing.
        if (!data) {
          setMissing(true)
          return
        }
        // Holiday mode — the shop paused its offers, so the link shows
        // that instead of the offer (and no view is counted).
        if (data.shopPaused) {
          setPaused(true)
          return
        }
        // A lapsed yearly subscription, judged from the copied expiry —
        // the shop's listing isn't active, so the link says so.
        if (feedFeeLapsed(data)) {
          setInactive(true)
          return
        }
        setItem(data)
      } catch {
        if (alive) setMissing(true)
      }
    })()
    return () => {
      alive = false
    }
  }, [uid, offerId])

  // The shop doc is publicly readable — the card shows hours, phone and
  // address the mirror deliberately omits. A failed stream leaves the
  // rest of the card standing (offer details, claim) untouched.
  useEffect(() => {
    const unsubscribe = watchShop(uid, (record) => setShopDoc(record))
    return unsubscribe
  }, [uid])

  // The reviews average for the card's chip — live from the reviews
  // collection; guests see it too (reads are public).
  useEffect(() => {
    return watchShopReviews(uid, setReviewSummary)
  }, [uid])

  const status = item ? feedDisplayStatus(item) : 'live'
  // Only render the QR that belongs to the coupon/dialog currently shown.
  const shownCouponQr = coupon && couponQr?.code === coupon.code ? couponQr.svg : ''
  const shownClaimDialogQr =
    claimDialog && claimDialogQr?.code === claimDialog.code ? claimDialogQr.svg : ''

  // One view per landing, and only for offers a customer can actually see.
  useEffect(() => {
    if (item && status !== 'paused') countOfferView(uid, offerId)
  }, [item, status, uid, offerId])

  function openDirections() {
    const destination =
      typeof item?.lat === 'number' && typeof item?.lng === 'number'
        ? `${item.lat},${item.lng}`
        : encodeURIComponent(shopDoc?.address ?? '')
    if (!destination) return
    window.open(
      `https://www.google.com/maps/dir/?api=1&destination=${destination}`,
      '_blank',
      'noopener,noreferrer',
    )
  }

  function toggleSaved() {
    setSavedIds((current) => {
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

  async function shareOffer() {
    const url = window.location.href
    const data = {
      title: item?.title ?? 'NearZoop offer',
      text: item ? `${item.title ?? 'Offer'} at ${item.shopName} — NearZoop` : 'NearZoop offer',
      url,
    }
    try {
      if (navigator.share) {
        await navigator.share(data)
        return
      }
      await navigator.clipboard.writeText(url)
    } catch {
      // Share sheet dismissed or clipboard blocked — nothing to report.
    }
  }

  if (missing) {
    return (
      <div className="cust-page">
        <div className="cust-shell">
          <div className="cust-topbar">
            <button type="button" className="cust-back" onClick={onBack} aria-label="Go back">
              <BackSvg />
            </button>
            <p className="cust-crumb">offer · {uid}</p>
            <span />
          </div>
          <div className="cust-missing">
            <h1>This offer isn’t available.</h1>
            <p>The link may be old, or the shop has removed the offer.</p>
          </div>
        </div>
      </div>
    )
  }

  if (paused) {
    return (
      <div className="cust-page">
        <div className="cust-shell">
          <div className="cust-topbar">
            <button type="button" className="cust-back" onClick={onBack} aria-label="Go back">
              <BackSvg />
            </button>
            <p className="cust-crumb">offers paused · {uid}</p>
            <span />
          </div>
          <div className="cust-missing">
            <h1>Offers are paused.</h1>
            <p>
              This shop has switched on holiday mode — check back later.
            </p>
          </div>
        </div>
      </div>
    )
  }

  if (inactive) {
    return (
      <div className="cust-page">
        <div className="cust-shell">
          <div className="cust-topbar">
            <button type="button" className="cust-back" onClick={onBack} aria-label="Go back">
              <BackSvg />
            </button>
            <p className="cust-crumb">offer · {uid}</p>
            <span />
          </div>
          <div className="cust-missing">
            <h1>This offer isn’t available right now.</h1>
            <p>This shop’s listing isn’t active — check back later.</p>
          </div>
        </div>
      </div>
    )
  }

  if (!item) {
    return (
      <div className="cust-page">
        <div className="cust-shell">
          <div className="cust-topbar">
            <button type="button" className="cust-back" onClick={onBack} aria-label="Go back">
              <BackSvg />
            </button>
            <span />
            <span />
          </div>
          <p className="cust-loading" role="status">···</p>
        </div>
      </div>
    )
  }

  if (status === 'paused') {
    return (
      <div className="cust-page">
        <div className="cust-shell">
          <div className="cust-topbar">
            <button type="button" className="cust-back" onClick={onBack} aria-label="Go back">
              <BackSvg />
            </button>
            <p className="cust-crumb">offer · {item.shopName}</p>
            <span />
          </div>
          <div className="cust-missing">
            <h1>This offer isn’t live yet.</h1>
            <p>Check back once the shop has published it.</p>
          </div>
        </div>
      </div>
    )
  }

  // Badge split — the same first-space rule the list tiles use.
  const label = item.discountLabel?.trim() ?? ''
  const splitAt = label.indexOf(' ')
  const big = label === '' ? '—' : splitAt === -1 ? label : label.slice(0, splitAt)
  const small = label === '' ? '' : label.slice(splitAt + 1)
  const chip = CHIP[status]
  const redeem = customerRedeemLine(item)
  const terms = termsLine(item)
  const exclusions = item.exclusions ?? []
  const redeemKind = item.redeemKind ?? 'screen'
  const couponKind = redeemKind === 'coupon'
  /** What the customer does at the counter, in the shop's own terms. */
  const counterLine =
    redeemKind === 'screen'
      ? 'Show this screen at the counter.'
      : redeemKind === 'code'
        ? item.redeemCode
          ? `Say the code “${item.redeemCode}” at the counter.`
          : null
        : redeemKind === 'custom'
          ? item.redeemCustom ?? null
          : 'Show the QR at the counter — the shop scans it.'

  // Distance to the shop, from the shared customer fix.
  const distKm =
    fix && typeof item.lat === 'number' && typeof item.lng === 'number'
      ? haversineKm(fix, { lat: item.lat, lng: item.lng })
      : null
  const distanceLine =
    distKm === null ? 'Distance unavailable' : `${fmtDistance(distKm)} from you`

  const openNow = shopDoc ? isOpenNow(shopDoc, new Date(nowTs)) : false
  const hours = shopDoc ? todayHours(shopDoc) : null
  const hoursText =
    hours && typeof hours === 'object'
      ? `${fmtTime(hours.opens)} – ${fmtTime(hours.closes)}`
      : hours === 'closed'
        ? 'Closed today'
        : 'Hours not listed'
  // The live "is the shop up" chip — holiday wins over the hours window.
  const shopStatus = shopDoc
    ? shopDoc.holidayMode
      ? { label: 'On holiday', kind: 'amber' as const }
      : openNow
        ? { label: 'Open now', kind: 'green' as const }
        : { label: 'Closed', kind: 'red' as const }
    : null
  const phone =
    shopDoc && shopDoc.showPhone !== false ? shopDoc.customerPhone?.trim() : ''
  const phoneHref = phone ? `tel:${phone.replace(/[^+\d]/g, '')}` : undefined
  const startsText = fmtFullDate(item.startsAt)
  const endsText = fmtFullDateTime(item.endsAt)
  // An offer whose start time has passed reads Started; one still ahead
  // reads Scheduled. No start time set means it went live when approved.
  const startsAtMs = item.startsAt ? Date.parse(item.startsAt) : NaN
  const startsChip =
    Number.isFinite(startsAtMs)
      ? startsAtMs <= nowTs
        ? { label: 'Started', kind: 'green' as const }
        : { label: 'Scheduled', kind: 'amber' as const }
      : null
  const checkedRel = item.updatedAt ? rel(item.updatedAt.toDate().toISOString()) : null
  const saved = savedIds.has(offerId)
  const initial = (item.shopName?.trim()?.[0] ?? 'S').toUpperCase()

  async function claim(): Promise<void> {
    if (!viewerUid || claiming || status === 'ended') return
    setClaiming(true)
    setClaimError('')
    try {
      const record = await claimCoupon({
        shopUid: uid,
        shopName: item?.shopName ?? 'this shop',
        offerId,
        offerTitle: item?.title ?? 'Offer',
        discountLabel: item?.discountLabel,
        endsAt: item?.endsAt ?? null,
        customerUid: viewerUid,
      })
      setCoupon(record)
      setClaimDialog(record)
      // The customer is one tap away from rating — write the prompt so
      // it's already in their inbox once the claim moment passes.
      requestRatePrompt({
        shopUid: uid,
        customerUid: viewerUid,
        offerId,
        offerTitle: item?.title ?? undefined,
        discountLabel: item?.discountLabel ?? undefined,
      })
    } catch {
      setClaimError("Couldn't claim that. Check the connection and try again.")
    }
    setClaiming(false)
  }

  async function sendReport(): Promise<void> {
    if (reportBusy || !reportReason) return
    setReportBusy(true)
    setReportError('')
    try {
      await saveReport(uid, {
        offerId,
        offerTitle: item?.title,
        reason: reportReason,
        note: reportNote,
      })
      setReportDone(true)
    } catch {
      setReportError("Couldn't send that. Check the connection and try again.")
    }
    setReportBusy(false)
  }

  function closeReport(): void {
    setReportOpen(false)
    setReportReason(null)
    setReportNote('')
    setReportError('')
    setReportDone(false)
  }

  return (
    <div className="cust-page">
      <div className="cust-shell">
        <div className="cust-topbar">
          <button type="button" className="cust-back" onClick={onBack} aria-label="Go back">
            <BackSvg />
          </button>
          <p className="cust-crumb">
            offer photo · {item.shopName}
          </p>
          <div className="cust-top-actions">
            <button type="button" className="cust-round" onClick={() => void shareOffer()} aria-label="Share offer">
              <UploadSvg />
            </button>
            <button
              type="button"
              className={`cust-round${saved ? ' is-on' : ''}`}
              onClick={toggleSaved}
              aria-label={saved ? 'Remove bookmark' : 'Bookmark offer'}
              aria-pressed={saved}
            >
              <BookmarkSvg filled={saved} />
            </button>
          </div>
        </div>

        <div className="cust-offer-grid">
          {/* ---- Left column ------------------------------------------- */}
          <section className="cust-offer-left">
            <div className="cust-offer-head">
              <div className="cust-offer-tile" aria-hidden="true">
                <span className="cust-offer-tile-big">{big}</span>
                {small && <span className="cust-offer-tile-small">{small}</span>}
              </div>
              <div className="cust-offer-idblock">
                <div className="cust-offer-pills">
                  {chip && (
                    <span className={`cust-pill cust-pill--${chip.kind}`}>
                      {chip.dot && <i aria-hidden="true" />}
                      {chip.label}
                      {checkedRel ? ` · checked ${checkedRel}` : ' · checked just now'}
                    </span>
                  )}
                </div>
                <h1 className="cust-offer-headline">
                  {item.title ?? 'Untitled offer'}
                </h1>
              </div>
            </div>

            {item.description && (
              <p className="cust-offer-desc">{item.description}</p>
            )}

            {(startsText || endsText) && (
              <div className="cust-offer-dates">
                {startsText && (
                  <div className="cust-offer-datebox">
                    <span className="cust-offer-datelabel">Starts</span>
                    <strong>{startsText}</strong>
                    {startsChip && (
                      <span className={`cust-minichip cust-minichip--${startsChip.kind}`}>
                        <i aria-hidden="true" />
                        {startsChip.label}
                      </span>
                    )}
                  </div>
                )}
                {endsText && (
                  <div className="cust-offer-datebox">
                    <span className="cust-offer-datelabel">Ends</span>
                    <strong>{endsText}</strong>
                  </div>
                )}
              </div>
            )}

            <div className="cust-offer-redeem">
              <div className="cust-offer-redeem-eyebrow">
                <TicketSvg />
                <span>How to redeem</span>
              </div>
              <h2>
                {couponKind
                  ? 'Claim a coupon'
                  : redeemKind === 'code'
                    ? 'Say the code'
                    : redeemKind === 'custom'
                      ? 'Redeem in store'
                      : 'Show this offer'}
              </h2>
              {couponKind ? (
                <ol>
                  <li>Claim the coupon in the app (sign-in needed).</li>
                  <li>Show the QR at the counter{item.endsAt ? ` before ${fmtDay(item.endsAt)}` : ''}.</li>
                </ol>
              ) : (
                <p className="cust-offer-redeem-line">{counterLine ?? redeem}</p>
              )}
              {terms && <p className="cust-offer-terms">{terms}</p>}
              {exclusions.length > 0 && (
                <ul className="cust-offer-exclusions">
                  {exclusions.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              )}
            </div>

            <div className="cust-offer-cta-row">
              <button
                type="button"
                className="cust-offer-dir"
                onClick={openDirections}
                aria-label="Get directions to the shop"
              >
                <PlaneSvg />
                <span>{distKm !== null ? fmtDistance(distKm) : 'Directions'}</span>
              </button>
              {status === 'ended' ? (
                <p className="cust-fine cust-offer-ended">This offer has ended.</p>
              ) : !signedIn ? (
                <button
                  type="button"
                  className="cust-offer-claim"
                  onClick={onSignIn}
                >
                  <TicketSvg />
                  <span>Sign in to claim</span>
                </button>
              ) : coupon ? (
                <p className="cust-fine cust-offer-claimed">
                  Claimed — your coupon is below. Show it at the counter.
                </p>
              ) : couponKind ? (
                <button
                  type="button"
                  className="cust-offer-claim"
                  onClick={() => void claim()}
                  disabled={claiming}
                >
                  <TicketSvg />
                  <span>{claiming ? 'Claiming…' : 'Claim offer'}</span>
                </button>
              ) : (
                counterLine && (
                  <p className="cust-fine cust-offer-counted">{counterLine}</p>
                )
              )}
            </div>
            {claimError && <p className="cust-err">{claimError}</p>}
            <button
              type="button"
              className="cust-reportlink"
              onClick={() => setReportOpen(true)}
            >
              Report a problem with this offer
            </button>
          </section>

          {/* ---- Right column: the shop card ------------------------- */}
          <aside className="cust-shopcard">
            <button
              type="button"
              className="cust-shopcard-head"
              onClick={() => onOpenShop?.(uid)}
              disabled={!onOpenShop}
              aria-label={`Open ${item.shopName}`}
            >
              <span className="cust-shopcard-avatar" aria-hidden="true">
                {initial}
              </span>
              <span className="cust-shopcard-name">
                <strong>{item.shopName}</strong>
                <small>
                  {shopDoc?.address ? `${shopDoc.address} · ` : ''}
                  {distKm !== null ? `${fmtDistance(distKm)} away` : 'Near you'}
                  {openNow ? ' · Open now' : ''}
                  {reviewSummary.count > 0 && (
                    <span className="cust-shopcard-rating">
                      {' · '}★ {reviewSummary.average.toFixed(1)} ({reviewSummary.count})
                    </span>
                  )}
                </small>
              </span>
              {onOpenShop && (
                <span className="cust-shopcard-chev">
                  <ChevronSvg />
                </span>
              )}
            </button>

            <div className="cust-shopcard-row">
              <span className="cust-shopcard-ricon" aria-hidden="true">
                <ClockSvg />
              </span>
              <span className="cust-shopcard-rmain">
                <strong>
                  Hours
                  {shopStatus && (
                    <span className={`cust-minichip cust-minichip--${shopStatus.kind}`}>
                      <i aria-hidden="true" />
                      {shopStatus.label}
                    </span>
                  )}
                </strong>
                <small>{hoursText}</small>
              </span>
            </div>

            {phone && (
              <a
                className="cust-shopcard-row cust-shopcard-row--link"
                href={phoneHref}
                aria-label={`Call ${phone}`}
              >
                <span className="cust-shopcard-ricon" aria-hidden="true">
                  <PhoneSvg />
                </span>
                <span className="cust-shopcard-rmain">
                  <strong>{phone}</strong>
                  <small>Tap to call</small>
                </span>
              </a>
            )}

            <div className="cust-shopcard-row">
              <span className="cust-shopcard-ricon" aria-hidden="true">
                <PinSvg />
              </span>
              <span className="cust-shopcard-rmain">
                <strong>{shopDoc?.address ?? 'Location not pinned'}</strong>
                <small>{distanceLine}</small>
              </span>
            </div>

            <div className="cust-shopcard-map">
              {typeof item.lat === 'number' && typeof item.lng === 'number' ? (
                <ShopMap
                  lat={item.lat}
                  lng={item.lng}
                  title={item.shopName}
                  expanded={mapExpanded}
                />
              ) : (
                <div className="cust-shopcard-mapholder">
                  <PinSvg />
                  <span>Location not pinned</span>
                </div>
              )}
              <button
                type="button"
                className="cust-shopcard-expand"
                onClick={() => setMapExpanded((v) => !v)}
                aria-label={mapExpanded ? 'Shrink map' : 'Expand map'}
                aria-pressed={mapExpanded}
              >
                <ExpandSvg />
              </button>
              <div className="cust-shopcard-mapfoot">
                <span className="cust-shopcard-mapdist">
                  <PinSvg />
                  {distanceLine}
                </span>
                <button
                  type="button"
                  className="cust-shopcard-getdir"
                  onClick={openDirections}
                >
                  <PlaneSvg />
                  <span>Get Directions</span>
                </button>
              </div>
            </div>
          </aside>
        </div>

        {coupon && <CouponPass coupon={coupon} qr={shownCouponQr} />}
      </div>

      {claimDialog && (
        <div
          className="cust-claimdialog-backdrop"
          onClick={(event) => {
            if (event.target === event.currentTarget) setClaimDialog(null)
          }}
        >
          <div className="cust-claimdialog" role="dialog" aria-modal="true" aria-label="Your coupon">
            <header className="cust-claimdialog-head">
              <h2>You claimed it.</h2>
              <button
                type="button"
                className="cust-claimdialog-close"
                onClick={() => setClaimDialog(null)}
                aria-label="Close"
              >
                ×
              </button>
            </header>
            <div className="cust-claimdialog-pass">
              <div className="cust-claimdialog-qr">
                {shownClaimDialogQr ? (
                  <span dangerouslySetInnerHTML={{ __html: shownClaimDialogQr }} />
                ) : (
                  <span className="cust-pass-qrwait" aria-hidden="true" />
                )}
              </div>
              <p className="cust-claimdialog-code">{claimDialog.code}</p>
              <p className="cust-claimdialog-note">
                Single use. Show it at the counter — the shop scans it.
              </p>
              {claimDialog.endsAt && (
                <p className="cust-claimdialog-meta">
                  Valid till {fmtWhen(claimDialog.endsAt)}
                </p>
              )}
            </div>
            <button
              type="button"
              className="btn-primary biz-btn cust-cta"
              onClick={() => setClaimDialog(null)}
            >
              Done
            </button>
          </div>
        </div>
      )}

      {reportOpen && (
        <div
          className="cust-report-backdrop"
          onClick={(event) => {
            if (event.target === event.currentTarget) closeReport()
          }}
        >
          <div className="cust-report" role="dialog" aria-modal="true" aria-label="Report a problem">
            {reportDone ? (
              <>
                <h2>Thanks — sent.</h2>
                <p>The shop sees this report and can act on it.</p>
                <button
                  type="button"
                  className="btn-primary biz-btn"
                  onClick={closeReport}
                >
                  Done
                </button>
              </>
            ) : (
              <>
                <h2>Report a problem</h2>
                <span className="cust-report-eyebrow">What’s wrong?</span>
                <div
                  className="cust-report-choices"
                  role="radiogroup"
                  aria-label="What’s wrong"
                >
                  {REPORT_REASONS.map((reason) => (
                    <label className="cust-report-choice" key={reason}>
                      <input
                        type="radio"
                        name="report-reason"
                        checked={reportReason === reason}
                        onChange={() => setReportReason(reason)}
                      />
                      <span className="cust-report-radio" aria-hidden="true" />
                      <span className="cust-report-choicetext">{reason}</span>
                    </label>
                  ))}
                </div>
                <span className="cust-report-eyebrow">Details (optional)</span>
                <textarea
                  className="cust-report-note"
                  value={reportNote}
                  maxLength={400}
                  placeholder="What did you see? e.g. Shop said offer ended on Sunday"
                  onChange={(event) => setReportNote(event.target.value)}
                  aria-label="Extra detail"
                />
                <p className="cust-report-fine">
                  Reports are reviewed by people. Misuse of reporting can
                  limit your account.
                </p>
                {reportError && <p className="cust-report-err">{reportError}</p>}
                <button
                  type="button"
                  className="btn-danger biz-btn cust-report-send"
                  disabled={!reportReason || reportBusy}
                  onClick={sendReport}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M5.5 21V4" />
                    <path d="M5.5 4.5c4-2.2 8 2.2 12 0v8c-4 2.2-8-2.2-12 0" />
                  </svg>
                  {reportBusy ? 'Sending…' : 'Submit report'}
                </button>
                <button
                  type="button"
                  className="cust-reportlink"
                  onClick={closeReport}
                >
                  Never mind
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
