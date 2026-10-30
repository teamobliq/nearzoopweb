import { useEffect, useState } from 'react'
import type { FeedRecord } from '../business/feed'
import {
  countOfferView,
  REPORT_REASONS,
  saveReport,
} from '../business/shop'
import {
  fetchFeedOffer,
  feedDisplayStatus,
  feedFeeLapsed,
} from '../business/feed'
import {
  claimCoupon,
  couponState,
  findMyCoupon,
  type CouponRecord,
} from '../business/coupons'
import { fmtWhen } from '../business/when'
import './customer.css'

/** The shared-offer landing — `<base>/<shopUid>/<offerId>?source=…` lands
    here. Reads the offer's public feed mirror (feed.ts): the only copy of
    an offer a visitor is allowed to see. Shows the offer with the app's
    own visual language (the tile, chip and detail-card classes come from
    business.css, which ships in the main bundle). Claiming needs an
    account, so the CTA routes to sign-in. Internal statuses never get a
    mirror, so they resolve to an honest "not available" screen instead of
    pretending the offer is live. */

type Props = {
  uid: string
  offerId: string
  onSignIn: () => void
  /** Leaves the offer — the list it was opened from, or Home for a shared
      link. */
  onBack: () => void
  signedIn?: boolean
  /** The signed-in customer's uid — the coupon claim is filed under it. */
  viewerUid?: string
}

const CHIP: Partial<
  Record<'live' | 'scheduled' | 'ended', { label: string; kind: string; dot?: boolean }>
> = {
  live: { label: 'Live', kind: 'live', dot: true },
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

/** The brand row with a way out — the detail is a page, so it always has
    a back arrow (the list, or Home when the page was a shared link). */
function CustTopbar({ onBack }: { onBack: () => void }) {
  return (
    <div className="cust-topbar">
      <button
        type="button"
        className="cust-back"
        onClick={onBack}
        aria-label="Go back"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M15 5 8 12l7 7" />
        </svg>
      </button>
      <p className="cust-brand">NearZoop</p>
    </div>
  )
}

/** The claimed coupon — QR, code and validity in one card. Rendered only
    for coupon offers the customer has actually claimed; the QR is an SVG
    string produced client-side (qrcode), and the code underneath is what
    staff type when the camera can't read it. */
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
  signedIn = false,
  viewerUid,
}: Props) {
  const [item, setItem] = useState<FeedRecord | null>(null)
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
  const [couponQr, setCouponQr] = useState('')
  const [claiming, setClaiming] = useState(false)
  const [claimError, setClaimError] = useState('')
  const [claimDialog, setClaimDialog] = useState<CouponRecord | null>(null)
  const [claimDialogQr, setClaimDialogQr] = useState('')

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
    if (!coupon) {
      setCouponQr('')
      return
    }
    let alive = true
    void import('qrcode')
      .then((qr) =>
        qr.toString(coupon.code, { type: 'svg', margin: 1, width: 220 }),
      )
      .then((svg) => {
        if (alive) setCouponQr(svg)
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
    if (!claimDialog) {
      setClaimDialogQr('')
      return
    }
    let alive = true
    void import('qrcode')
      .then((qr) =>
        qr.toString(claimDialog.code, { type: 'svg', margin: 1, width: 220 }),
      )
      .then((svg) => {
        if (alive) setClaimDialogQr(svg)
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

  const status = item ? feedDisplayStatus(item) : 'live'

  // One view per landing, and only for offers a customer can actually see.
  useEffect(() => {
    if (item && status !== 'paused') countOfferView(uid, offerId)
  }, [item, status, uid, offerId])

  if (missing) {
    return (
      <div className="cust-page">
        <div className="cust-shell">
          <CustTopbar onBack={onBack} />
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
          <CustTopbar onBack={onBack} />
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
          <CustTopbar onBack={onBack} />
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
          <CustTopbar onBack={onBack} />
          <p className="cust-loading">···</p>
        </div>
      </div>
    )
  }

  if (status === 'paused') {
    return (
      <div className="cust-page">
        <div className="cust-shell">
          <CustTopbar onBack={onBack} />
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
  const photos = item.photos ?? []
  // The lead photo becomes the cover; the deal tile becomes the picture
  // that sits over its bottom edge.
  const cover = photos[0]
  const rest = photos.slice(1)
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
        <CustTopbar onBack={onBack} />

        {/* The offer as a profile page: the lead photo runs the full width
            as the cover, the deal tile sits over its bottom edge as the
            picture, and everything else reads down from there. */}
        <section className="cust-cover">
          {cover ? (
            <img
              className="cust-cover-img"
              src={cover}
              alt={`${item.title ?? 'Offer'} at ${item.shopName}`}
            />
          ) : (
            <div className="cust-cover-blank" aria-hidden="true" />
          )}
          <span
            className={`biz-otile biz-otile-${item.tileColor ?? 'yellow'} cust-avatar`}
            aria-hidden="true"
          >
            <span className="biz-otile-big">{big}</span>
            <span className="biz-otile-small">{small}</span>
          </span>
        </section>

        <header className="cust-id">
          <div className="cust-id-text">
            <h1 className="biz-detail-name cust-name">
              {item.title ?? 'Untitled offer'}
            </h1>
            <p className="cust-id-sub">
              <span className="cust-id-shop">at {item.shopName}</span>
              {chip && (
                <span className={`biz-ochip biz-ochip-${chip.kind}`}>
                  {chip.dot && <span className="biz-offer-dot" />}
                  {chip.label}
                </span>
              )}
            </p>
          </div>

          <div className="cust-actions">
            {status === 'ended' ? (
              <p className="cust-fine">This offer has ended.</p>
            ) : !signedIn ? (
              <>
                <button
                  type="button"
                  className="btn-primary biz-btn cust-cta"
                  onClick={onSignIn}
                >
                  Sign in to claim
                </button>
                <p className="cust-fine">
                  Claiming needs a NearZoop account.
                </p>
              </>
            ) : coupon ? (
              <p className="cust-fine">
                Claimed — your coupon is below. Show it at the shop.
              </p>
            ) : couponKind ? (
              <>
                <button
                  type="button"
                  className="btn-primary biz-btn cust-cta"
                  onClick={() => void claim()}
                  disabled={claiming}
                >
                  {claiming ? 'Claiming…' : 'Claim this offer'}
                </button>
                <p className="cust-fine">
                  One single-use coupon. The shop scans it at the counter.
                </p>
              </>
            ) : (
              counterLine && <p className="cust-fine">{counterLine}</p>
            )}
            {claimError && <p className="cust-err">{claimError}</p>}
            <button
              type="button"
              className="cust-reportlink"
              onClick={() => setReportOpen(true)}
            >
              Report a problem with this offer
            </button>
          </div>
        </header>

        {item.description && <p className="cust-desc">{item.description}</p>}

        {coupon && <CouponPass coupon={coupon} qr={couponQr} />}

        <div className={`cust-cols${rest.length > 0 ? '' : ' is-single'}`}>
          <section className="cust-panel">
            <h2 className="cust-panel-title">Offer details</h2>
            <div className="biz-detailcard cust-card">
              {item.endsAt && (
                <div className="biz-detailrow">
                  <span className="biz-detailrow-label">
                    {status === 'ended' ? 'Ended' : 'Valid till'}
                  </span>
                  <span className="biz-detailrow-value">
                    {fmtWhen(item.endsAt)}
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
            </div>
          </section>

          {rest.length > 0 && (
            <section className="cust-panel">
              <h2 className="cust-panel-title">More photos</h2>
              <div className="cust-photos">
                {rest.map((url) => (
                  <img
                    key={url}
                    src={url}
                    alt={`${item.title ?? 'Offer'} at ${item.shopName}`}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
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
                {claimDialogQr ? (
                  <span dangerouslySetInnerHTML={{ __html: claimDialogQr }} />
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
