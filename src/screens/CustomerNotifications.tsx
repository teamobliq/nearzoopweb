import { useEffect, useRef, useState } from 'react'
import './customer.css'
import {
  markCustomerNotificationsRead,
  watchCustomerNotifications,
  type CustomerNotification,
} from '../business/follows'
import { rel } from '../business/when'

/** The customer's in-app inbox — every live offer from the shops they
    follow lands here the moment the shop posts it (the serverless
    /api/notify-followers writes these docs). Tapping one opens the
    offer page. Read comes from the doc itself; the screen marks
    everything read once on open so the bell resets without nagging.
    Guests get a sign-in prompt instead of an inbox they cannot have. */

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

type Props = {
  /** The signed-in customer's uid — absent means browsing as guest. */
  viewerUid?: string
  onBack: () => void
  onOpenOffer: (shopUid: string, offerId: string) => void
  /** Guests are routed to sign-in from the gate state. */
  onSignIn: () => void
}

export default function CustomerNotifications({
  viewerUid,
  onBack,
  onOpenOffer,
  onSignIn,
}: Props) {
  const [items, setItems] = useState<CustomerNotification[] | null>(() =>
    viewerUid ? null : [],
  )
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
              const open = () => {
                if (item.shopUid && item.offerId) {
                  onOpenOffer(item.shopUid, item.offerId)
                }
              }
              const time = item.at ? rel(item.at.toDate().toISOString()) : null
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    className={`notif-item${item.read ? '' : ' is-unread'}`}
                    onClick={open}
                    disabled={!item.shopUid || !item.offerId}
                  >
                    <span className="notif-item-icon" aria-hidden="true">
                      <TicketSvg />
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
    </div>
  )
}
