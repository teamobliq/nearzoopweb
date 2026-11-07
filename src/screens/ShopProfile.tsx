import { useEffect, useState } from 'react'
import { cachedCoords, haversineKm } from '../business/geocode'
import {
  watchShop,
  watchOffers,
  feeExpired,
  type ShopRecord,
  type OfferRecord,
} from '../business/shop'
import { fmtDay } from '../business/when'
import { fmtKm } from './mapUtils'
import './customer.css'

function CloseSvg() {
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
      <path d="M18 6l-12 12M6 6l12 12" />
    </svg>
  )
}

function ShareSvg() {
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
      <path d="M18 16l6-6-6-6M13 18l-6 6 6 6M16 6l6 6-6 6" />
    </svg>
  )
}

function PinSvg() {
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
      <path d="M12 21s-6.5-5.4-6.5-10a6.5 6.5 0 1 1 13 0C18.5 15.6 12 21 12 21Z" />
      <circle cx="12" cy="11" r="2.4" />
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
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1 3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 0 7h3a2 2 0 0 1 2-2 2 2 0 0 1 2 2z" />
    </svg>
  )
}

function ClockSvg() {
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
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  )
}

function fmtTime(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const displayH = h % 12 || 12
  return `${displayH}:${m.toString().padStart(2, '0')} ${ampm}`
}

function isOpenNow(shop: ShopRecord): boolean {
  return (
    shop.verification === 'verified' &&
    shop.paymentDone === true &&
    !feeExpired(shop) &&
    !shop.holidayMode
  )
}

type Props = {
  uid: string
}

/** Shop profile screen — exact 1:1 copy of the app design:
    classic back button at top, cover photo on the left, badges row,
    action buttons row, tab bar, live offers, details, and map.
    No top nav bar. */
export default function ShopProfile({ uid }: Props) {
  const [shop, setShop] = useState<ShopRecord | null>(null)
  const [offers, setOffers] = useState<OfferRecord[] | null>(null)
  const [fix] = useState<{ lat: number; lng: number } | null>(() =>
    cachedCoords(),
  )

  useEffect(() => {
    const unsubShop = watchShop(uid, (s) => setShop(s))
    const unsubOffers = watchOffers(uid, (o) => setOffers(o))
    return () => {
      unsubShop()
      unsubOffers()
    }
  }, [uid])

  const liveOffers = (offers ?? []).filter((o) => o.status === 'live')
  const openNow = shop ? isOpenNow(shop) : false

  const distKm =
    fix && shop?.lat && shop?.lng
      ? haversineKm(fix, { lat: shop.lat, lng: shop.lng })
      : null

  const today = new Date().getDay()
  const dayHours =
    today === 0 ? shop?.openingHours?.sunday : shop?.openingHours?.monSat
  const hoursText =
    dayHours && typeof dayHours === 'object'
      ? `${fmtTime(dayHours.opens)} – ${fmtTime(dayHours.closes)}`
      : dayHours === 'closed'
      ? 'Closed today'
      : 'Hours not set'

  if (!shop) {
    return (
      <main className="shop-profile">
        <header className="shop-head">
          <button
            type="button"
            className="shop-back"
            aria-label="Back"
          >
            <CloseSvg />
          </button>
        </header>
        <p className="shop-empty">Loading shop…</p>
      </main>
    )
  }

  return (
    <main className="shop-profile">
      <header className="shop-head">
        <button
          type="button"
          className="shop-back"
          onClick={() => window.history.back()}
          aria-label="Go back"
        >
          <CloseSvg />
        </button>
        <button type="button" className="shop-share" aria-label="Share">
          <ShareSvg />
        </button>
      </header>

      <div className="shop-body">
        <div className="shop-cover-wrap">
          {shop.shopPhotoUrl ? (
            <img
              className="shop-cover"
              src={shop.shopPhotoUrl}
              alt={`${shop.name} shop front`}
            />
          ) : (
            <div className="shop-cover shop-cover--blank">
              <span className="shop-cover-icon">🏪</span>
              <p className="shop-cover-label">Shop front photo</p>
            </div>
          )}
        </div>

        <div className="shop-info">
          <div className="shop-badges">
            <span className="shop-badge shop-badge--category">
              {shop.category ?? 'Food'}
            </span>
            {shop.verification === 'verified' && (
              <span className="shop-badge shop-badge--verified">
                <span aria-hidden="true">✔</span> Verified by NearZoop
              </span>
            )}
            {openNow && (
              <span className="shop-badge shop-badge--open">
                <span aria-hidden="true">⏰</span> Open now
              </span>
            )}
          </div>

          <h1 className="shop-name">{shop.name}</h1>
          <p className="shop-address">{shop.address}</p>

          <div className="shop-actions">
            <button
              type="button"
              className="shop-action shop-action--directions"
              onClick={() => {
                if (shop.lat && shop.lng) {
                  const url = `https://www.google.com/maps/dir/?api=1&destination=${shop.lat},${shop.lng}`
                  window.open(url, '_blank')
                }
              }}
            >
              <div className="shop-action-icon">📍</div>
              <div className="shop-action-label">
                <strong>Directions</strong>
                {distKm !== null && <span className="shop-action-value">{fmtKm(distKm)}</span>}
              </div>
            </button>
            <button
              type="button"
              className="shop-action shop-action--call"
              onClick={() => {
                if (shop.customerPhone) {
                  window.location.href = `tel:${shop.customerPhone}`
                }
              }}
            >
              <div className="shop-action-icon">📞</div>
              <div className="shop-action-label">
                <strong>Call Shop</strong>
              </div>
            </button>
            <button type="button" className="shop-action shop-action--follow">
              <div className="shop-action-icon">+</div>
              <div className="shop-action-label">
                <strong>Follow</strong>
                <span className="shop-action-value">Updates</span>
              </div>
            </button>
            <button
              type="button"
              className="shop-action shop-action--save"
              onClick={() => {}}
            >
              <div className="shop-action-icon">🔖</div>
              <div className="shop-action-label">
                <strong>Save</strong>
                <span className="shop-action-value">For later</span>
              </div>
            </button>
            <button
              type="button"
              className="shop-action shop-action--share"
              onClick={() => {}}
            >
              <div className="shop-action-icon">↗</div>
              <div className="shop-action-label">
                <strong>Share</strong>
                <span className="shop-action-value">Shop link</span>
              </div>
            </button>
          </div>

          <div className="shop-tabs">
            <button className="shop-tab shop-tab--on">Overview</button>
            <button className="shop-tab">Offers</button>
            <button className="shop-tab">Details</button>
            <button className="shop-tab">Reviews</button>
          </div>
        </div>
      </div>

      {liveOffers.length > 0 && (
        <section className="shop-section">
          <div className="shop-section-head">
            <h2 className="shop-section-title">
              Live offers <span className="shop-section-count">{liveOffers.length}</span>
            </h2>
          </div>
          <ul className="shop-offers">
            {liveOffers.map((item) => (
              <li key={item.id} className="shop-offer-card">
                <button
                  type="button"
                  className="shop-offer-hit"
                  aria-label={item.title ?? 'Offer'}
                >
                  <span
                    className={`biz-otile biz-otile-${item.tileColor ?? 'yellow'}`}
                    aria-hidden="true"
                  >
                    <span className="biz-otile-big">
                      {item.discountLabel?.trim() ?? '—'}
                    </span>
                  </span>
                  <div className="shop-offer-main">
                    <span className="shop-offer-title">
                      {item.title ?? 'Untitled offer'}
                    </span>
                    <span className="shop-offer-shop">{shop.name}</span>
                    <div className="shop-offer-meta">
                      {item.endsAt && (
                        <span className="shop-offer-ends">
                          {'⏰'} Ends {fmtDay(item.endsAt)}
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="shop-offer-bookmark"
                    aria-label="Bookmark"
                  >
                    <span aria-hidden="true">🔖</span>
                  </button>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="shop-section">
        <h2 className="shop-section-title">Details</h2>
        <div className="shop-detail-row">
          <span className="shop-detail-icon">
            <ClockSvg />
          </span>
          <div className="shop-detail-text">
            <strong>Today</strong>
            <span>{hoursText}</span>
          </div>
        </div>
        {shop.customerPhone && (
          <div className="shop-detail-row">
            <span className="shop-detail-icon">
              <PhoneSvg />
            </span>
            <div className="shop-detail-text">
              <strong>{shop.customerPhone}</strong>
              <span>Listed by the shop</span>
            </div>
          </div>
        )}
        <div className="shop-detail-row">
          <span className="shop-detail-icon">
            <PinSvg />
          </span>
          <div className="shop-detail-text">
            <strong>{shop.address}</strong>{' '}
            {distKm !== null && <span>{fmtKm(distKm)} from you</span>}
          </div>
        </div>
      </section>

      <div className="shop-map-wrap">
        <div className="shop-map">
          <div className="shop-map-placeholder">
            <span className="shop-map-pin">📍</span>
          </div>
          <div className="shop-map-footer">
            <span className="shop-map-dist">{distKm !== null ? fmtKm(distKm) : '—'} from you</span>
            <button className="shop-map-getdir">Get Directions</button>
          </div>
        </div>
      </div>
    </main>
  )
}
