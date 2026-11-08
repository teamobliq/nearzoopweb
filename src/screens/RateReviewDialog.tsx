import { useState } from 'react'
import './customer.css'
import { saveReview } from '../business/reviews'

/** The rate prompt's dialog — opened from a "How was it?" notification.
    Two star rows: the offer itself, and the shop overall (the shop rating
    is what lands on the shop's page and the average chip). The customer's
    name is denormalised from the session so the review list can credit
    them without reading anyone's profile. */

function StarSvg({ filled }: { filled: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </svg>
  )
}

const LABELS = ['', 'Terrible', 'Poor', 'Okay', 'Good', 'Great'] as const

type Props = {
  shopUid: string
  shopName: string
  offerId: string
  offerTitle?: string
  /** The signed-in customer — absent means browsing as guest; the dialog
      still lets them pick stars but routes the write through sign-in. */
  viewerUid?: string
  viewerName?: string
  onClose: () => void
  onSubmitted?: () => void
  /** Guests are routed to sign-in instead of writing. */
  onSignIn?: () => void
}

export default function RateReviewDialog({
  shopUid,
  shopName,
  offerId,
  offerTitle,
  viewerUid,
  viewerName,
  onClose,
  onSubmitted,
  onSignIn,
}: Props) {
  const [offerRating, setOfferRating] = useState(0)
  const [shopRating, setShopRating] = useState(0)
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  async function submit() {
    if (shopRating === 0 || busy) return
    if (!viewerUid) {
      // Guests get the picker, but the write goes through sign-in.
      onSignIn?.()
      return
    }
    setBusy(true)
    setError('')
    try {
      await saveReview({
        shopUid,
        offerId,
        customerUid: viewerUid,
        rating: shopRating,
        offerRating: offerRating || undefined,
        comment,
        customerName: viewerName ?? undefined,
      })
      setDone(true)
      onSubmitted?.()
    } catch {
      setError("Couldn't save that. Check the connection and try again.")
    }
    setBusy(false)
  }

  function starRow(
    value: number,
    onChange: (next: number) => void,
    label: string,
  ) {
    return (
      <div className="rate-row">
        <span className="rate-row-label">{label}</span>
        <div className="rate-stars" role="radiogroup" aria-label={label}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={value === n}
              aria-label={`${n} out of 5 — ${LABELS[n]}`}
              className={`rate-star${value >= n ? ' is-lit' : ''}`}
              onClick={() => onChange(n)}
            >
              <StarSvg filled={value >= n} />
            </button>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div
      className="rate-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="rate-dialog" role="dialog" aria-modal="true" aria-label="Rate the offer and shop">
        {done ? (
          <>
            <h2>Thanks!</h2>
            <p>Your rating is live — it helps other customers choose well.</p>
            <button
              type="button"
              className="btn-primary biz-btn"
              onClick={onClose}
            >
              Done
            </button>
          </>
        ) : (
          <>
            <header className="rate-head">
              <h2>How was it?</h2>
              <button
                type="button"
                className="rate-close"
                onClick={onClose}
                aria-label="Close"
              >
                ×
              </button>
            </header>
            <p className="rate-sub">
              {offerTitle ? `${offerTitle} at ${shopName}` : shopName}
            </p>

            {starRow(offerRating, setOfferRating, 'Rate the offer')}
            {starRow(shopRating, setShopRating, `Rate ${shopName}`)}

            <label className="rate-commentlabel" htmlFor="rate-comment">
              What did you like? (optional)
            </label>
            <textarea
              id="rate-comment"
              className="rate-comment"
              value={comment}
              maxLength={400}
              placeholder="Details the shopkeeper can use…"
              onChange={(event) => setComment(event.target.value)}
            />
            {error && <p className="cust-err">{error}</p>}
            <button
              type="button"
              className="btn-primary biz-btn rate-submit"
              disabled={shopRating === 0 || busy}
              onClick={() => void submit()}
            >
              {busy ? 'Saving…' : 'Submit rating'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
