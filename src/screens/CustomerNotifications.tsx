import { useEffect, useRef, useState } from 'react'
import './customer.css'
import {
  markCustomerNotificationsRead,
  watchCustomerNotifications,
  type CustomerNotification,
} from '../business/follows'
import RateReviewDialog from './RateReviewDialog'
import { rel } from '../business/when'

/** The customer's in-app inbox — every live offer from the shops they
    follow lands here the moment the shop posts it (the serverless
    /api/notify-followers writes these docs). "How was it?" rate prompts
    open the rating dialog; offer items open the offer page. Read comes
    from the doc itself; the screen marks everything read once on open so
    the bell resets without nagging. Guests get a sign-in prompt instead
    of an inbox they cannot have. */

function BackSvg() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M15 5l-7 7 7 7" />
    </svg>
  )
}

function TicketSvg() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 9a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v1a2 2 0 0 0 0 4v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1a2 2 0 0 0 0-4V9Z" />
      <path d="M13 7v2" />
      <path d="M13 12v2" />
      <path d="M13 17v1" />
    </svg>
  )
}

function RateSvg() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </svg>
  )
}

type Props = {
  /** The signed-in customer's uid — absent means browsing as guest. */
  viewerUid?: string
  /** The session label for the review's denormalised name. */
  viewerName?: string
  onBack: () => void
  onOpenOffer: (shopUid: string, offerId: string) => void
  /** Guests are routed to sign-in from the gate state. */
  onSignIn: () => void
}

export default function CustomerNotifications({
  viewerUid,
  viewerName,
  onBack,
  onOpenOffer,
  onSignIn,
}: Props) {
  const [items, setItems] = useState<CustomerNotification[] | null>(() =>
    viewerUid ? null : [],
  )
  const [rateItem, setRateItem] = useState<CustomerNotification | null>(null)
  const marked = useRef(false)

  useEffect(() => {
    if (!viewerUid) return
    return watchCustomerNotifications(viewerUid, setItems)
  }, [viewerUid])

  // Mark everything read once per open — the bell resets as the user
  // reads their inbox instead of nagging forever.
  useEffect(() => {
    if (!viewerUid || marked.current || !items) return
    const unread = items.filter((item) => !item.read).map((item) => item.id)
    if (unread.length === 0) return
    marked.current = true
    void markCustomerNotificationsRead(viewerUid, unread)
  }, [items, viewerUid])

  if (!viewerUid) {
    return (
      <div className="cust-page">
        <div className="cust-shell">
          <div className="cust-topbar">
            <button
              type="button"
              className="cust-back"
              onClick={onBack}
              aria-label="Go back"
            >
              <BackSvg />
            </button>
            <p className="cust-crumb">Notifications</p>
            <span />
          </div>
          <div className="notif-empty">
            <span className="notif-empty-icon" aria-hidden="true">
              <TicketSvg />
            </span>
            <h1>Sign in first.</h1>
            <p>Your inbox of offers from shops you follow lives behind your account.</p>
            <button
              type="button"
              className="btn-primary biz-btn"
              style={{ marginTop: '0.6rem' }}
              onClick={onSignIn}
            >
              Sign in
            </button>
          </div>
        </div>
      </div>
    )
  }

  function openItem(item: CustomerNotification) {
    if (item.kind === 'rate-offer') {
      if (viewerUid) {
        void markCustomerNotificationsRead(viewerUid, [item.id])
      }
      setRateItem(item)
      return
    }
    if (item.shopUid && item.offerId) {
      onOpenOffer(item.shopUid, item.offerId)
    }
  }

  return (
    <div className="cust-page">
      <div className="cust-shell">
        <div className="cust-topbar">
          <button
            type="button"
            className="cust-back"
            onClick={onBack}
            aria-label="Go back"
          >
            <BackSvg />
          </button>
          <p className="cust-crumb">Notifications</p>
          <span />
        </div>

        {items === null ? (
          <p className="cust-loading" role="status">···</p>
        ) : items.length === 0 ? (
          <div className="notif-empty">
            <span className="notif-empty-icon" aria-hidden="true">
              <TicketSvg />
            </span>
            <h1>Nothing yet.</h1>
            <p>Follow a shop and you’ll hear the moment they post a new offer.</p>
          </div>
        ) : (
          <ul className="notif-list">
            {items.map((item) => {
              const isRate = item.kind === 'rate-offer'
              const time = item.at ? rel(item.at.toDate().toISOString()) : null
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    className={`notif-item${item.read ? '' : ' is-unread'}`}
                    onClick={() => openItem(item)}
                    disabled={!isRate && !item.shopUid}
                  >
                    <span className="notif-item-icon" aria-hidden="true">
                      {isRate ? <RateSvg /> : <TicketSvg />}
                    </span>
                    <span className="notif-item-text">
                      <strong>{item.title}</strong>
                      {item.body && <span>{item.body}</span>}
                      {time && <time className="notif-item-time">{time}</time>}
                    </span>
                    {!item.read && (
                      <span className="notif-item-dot" aria-label="Unread" />
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {rateItem && rateItem.shopUid && rateItem.offerId && (
        <RateReviewDialog
          shopUid={rateItem.shopUid}
          shopName={rateItem.shopName ?? 'the shop'}
          offerId={rateItem.offerId}
          offerTitle={rateItem.offerTitle}
          viewerUid={viewerUid}
          viewerName={viewerName}
          onClose={() => setRateItem(null)}
          onSignIn={onSignIn}
        />
      )}
    </div>
  )
}
