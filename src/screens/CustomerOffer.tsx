import { useEffect, useState } from 'react'
import type { OfferRecord, OfferStatus, ShopRecord } from '../business/shop'
import {
  countOfferView,
  fetchOffer,
  fetchShop,
  REPORT_REASONS,
  saveReport,
} from '../business/shop'
import { fmtWhen } from '../business/when'
import './customer.css'

/** The shared-offer landing — `<base>/<shopUid>/<offerId>?source=…` lands
    here. Shows the offer with the app's own visual language (the tile,
    chip and detail-card classes come from business.css, which ships in the
    main bundle). Claiming needs an account, so the CTA routes to sign-in.
    Internal-only statuses (draft, review, changes, paused) resolve to an
    honest "not available" screen instead of pretending the offer is live. */

type Props = {
  uid: string
  offerId: string
  onSignIn: () => void
}

const CHIP: Partial<
  Record<OfferStatus, { label: string; kind: string; dot?: boolean }>
> = {
  live: { label: 'Live', kind: 'live', dot: true },
  scheduled: { label: 'Scheduled', kind: 'scheduled' },
  ended: { label: 'Ended', kind: 'gray' },
}

/** How the customer proves the offer, phrased for the visitor (the
    merchant screen's wording is staff-facing). */
function customerRedeemLine(offer: OfferRecord): string | null {
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
function termsLine(offer: OfferRecord): string | null {
  const bits: string[] = []
  if (offer.minBill && offer.minBill > 0) {
    bits.push(`min bill ₹${offer.minBill.toLocaleString('en-IN')}`)
  }
  if (offer.inStoreOnly) bits.push('in-store only')
  if (offer.newCustomersOnly) bits.push('new customers only')
  return bits.length ? bits.join(' · ') : null
}

export default function CustomerOffer({ uid, offerId, onSignIn }: Props) {
  const [offer, setOffer] = useState<OfferRecord | null>(null)
  const [shop, setShop] = useState<ShopRecord | null>(null)
  const [missing, setMissing] = useState(false)
  const [paused, setPaused] = useState(false)
  // Report flow — the one way a visitor can flag a bad offer back to the
  // shop. Declared up here with the other hooks; the dialog renders only
  // for public offers.
  const [reportOpen, setReportOpen] = useState(false)
  const [reportReason, setReportReason] = useState<string | null>(null)
  const [reportNote, setReportNote] = useState('')
  const [reportBusy, setReportBusy] = useState(false)
  const [reportError, setReportError] = useState('')
  const [reportDone, setReportDone] = useState(false)

  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        const [offerData, shopData] = await Promise.all([
          fetchOffer(uid, offerId),
          fetchShop(uid),
        ])
        if (!alive) return
        if (!offerData || !shopData) {
          setMissing(true)
          return
        }
        // Holiday mode — the shop paused its offers, so the link shows
        // that instead of the offer (and no view is counted).
        if (shopData.holidayMode) {
          setPaused(true)
          return
        }
        setOffer(offerData)
        setShop(shopData)
      } catch {
        if (alive) setMissing(true)
      }
    })()
    return () => {
      alive = false
    }
  }, [uid, offerId])

  const status: OfferStatus = offer?.status ?? 'live'
  const isPublic =
    status === 'live' || status === 'scheduled' || status === 'ended'

  // One view per landing, and only for offers a customer can actually see.
  useEffect(() => {
    const visible =
      offer !== null &&
      (offer.status ?? 'live') !== 'draft' &&
      (offer.status ?? 'live') !== 'review' &&
      (offer.status ?? 'live') !== 'changes' &&
      (offer.status ?? 'live') !== 'paused'
    if (visible) countOfferView(uid, offerId)
  }, [offer, uid, offerId])

  if (missing) {
    return (
      <div className="cust-page">
        <div className="cust-shell">
          <p className="cust-brand">NearZoop</p>
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
          <p className="cust-brand">NearZoop</p>
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

  if (!offer || !shop) {
    return (
      <div className="cust-page">
        <div className="cust-shell">
          <p className="cust-brand">NearZoop</p>
          <p className="cust-loading">···</p>
        </div>
      </div>
    )
  }

  if (!isPublic) {
    return (
      <div className="cust-page">
        <div className="cust-shell">
          <p className="cust-brand">NearZoop</p>
          <div className="cust-missing">
            <h1>This offer isn’t live yet.</h1>
            <p>Check back once the shop has published it.</p>
          </div>
        </div>
      </div>
    )
  }

  // Badge split — the same first-space rule the list tiles use.
  const label = offer.discountLabel?.trim() ?? ''
  const splitAt = label.indexOf(' ')
  const big = label === '' ? '—' : splitAt === -1 ? label : label.slice(0, splitAt)
  const small = label === '' ? '' : splitAt === -1 ? '' : label.slice(splitAt + 1)
  const chip = CHIP[status]
  const redeem = customerRedeemLine(offer)
  const terms = termsLine(offer)
  const exclusions = offer.exclusions ?? []
  const photos = offer.photos ?? []

  async function sendReport(): Promise<void> {
    if (reportBusy || !reportReason) return
    setReportBusy(true)
    setReportError('')
    try {
      await saveReport(uid, {
        offerId,
        offerTitle: offer.title,
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
        <p className="cust-brand">NearZoop</p>

        <section className="biz-detail-hero cust-hero">
          <span
            className={`biz-otile biz-otile-${offer.tileColor ?? 'yellow'}`}
            aria-hidden="true"
          >
            <span className="biz-otile-big">{big}</span>
            <span className="biz-otile-small">{small}</span>
          </span>
          <div className="biz-detail-hero-main">
            {chip && (
              <span className={`biz-ochip biz-ochip-${chip.kind}`}>
                {chip.dot && <span className="biz-offer-dot" />}
                {chip.label}
              </span>
            )}
            <h1 className="biz-detail-name">
              {offer.title ?? 'Untitled offer'}
            </h1>
            <p className="biz-detail-when">at {shop.name}</p>
          </div>
        </section>

        {offer.description && <p className="cust-desc">{offer.description}</p>}

        <div className="biz-detailcard cust-card">
          {offer.endsAt && (
            <div className="biz-detailrow">
              <span className="biz-detailrow-label">
                {status === 'ended' ? 'Ended' : 'Valid till'}
              </span>
              <span className="biz-detailrow-value">
                {fmtWhen(offer.endsAt)}
              </span>
            </div>
          )}
          {redeem && (
            <div className="biz-detailrow">
              <span className="biz-detailrow-label">Redeem</span>
              <span className="biz-detailrow-value">{redeem}</span>
            </div>
          )}
          {terms && (
            <div className="biz-detailrow">
              <span className="biz-detailrow-label">Terms</span>
              <span className="biz-detailrow-value">{terms}</span>
            </div>
          )}
          {exclusions.length > 0 && (
            <div className="biz-detailrow">
              <span className="biz-detailrow-label">Not valid for</span>
              <ul className="biz-detailrow-list">
                {exclusions.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          )}
          {photos.length > 0 && (
            <div className="biz-detailrow">
              <span className="biz-detailrow-label">Photos</span>
              <span className="biz-detailrow-photos">
                {photos.map((url) => (
                  <img key={url} src={url} alt="" />
                ))}
              </span>
            </div>
          )}
        </div>

        <button
          type="button"
          className="btn-primary biz-btn cust-cta"
          onClick={onSignIn}
        >
          Sign in to claim
        </button>
        <p className="cust-fine">Claiming needs a NearZoop account.</p>
        <button
          type="button"
          className="cust-reportlink"
          onClick={() => setReportOpen(true)}
        >
          Report a problem with this offer
        </button>
      </div>

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
