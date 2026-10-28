import { useEffect, useRef, useState } from 'react'
import type { OfferRecord, OfferStatus } from './shop'
import { deleteOffer, setOfferStatus } from './shop'
import { fmtDay, fmtWhen, rel } from './when'

/** The Offer Details screen — one offer, everything about it: hero badge,
    live performance stats, the full submission details, and the status's
    action bar (live → Pause/End, paused → End/Resume, ended → Run again).
    Adapted from the app design for the dashboard shell: the sidebar yields
    (is-create) and the back circle returns to the offers list. */

type Props = {
  uid: string
  shopName: string
  offer: OfferRecord
  onBack: () => void
  /** Run it again — opens the builder prefilled with this offer's values. */
  onRunAgain: (offer: OfferRecord) => void
}

const CHIP: Record<OfferStatus, { label: string; kind: string; dot?: boolean }> = {
  live: { label: 'Live', kind: 'live', dot: true },
  paused: { label: 'Paused', kind: 'gray' },
  scheduled: { label: 'Scheduled', kind: 'scheduled' },
  review: { label: 'In review', kind: 'review' },
  changes: { label: 'Needs changes', kind: 'changes' },
  draft: { label: 'Draft', kind: 'draft' },
  ended: { label: 'Ended', kind: 'gray' },
}

function fmt(value: number): string {
  return value.toLocaleString('en-IN')
}

/** One line on how the customer proves the offer at the counter. */
function redeemLine(offer: OfferRecord): string | null {
  switch (offer.redeemKind) {
    case 'screen':
      return 'Customer shows the screen at the counter.'
    case 'code':
      return offer.redeemCode
        ? `Customer says the code “${offer.redeemCode}”.`
        : 'Customer says a code.'
    case 'coupon':
      return 'Customer claims a single-use QR coupon.'
    case 'custom':
      return offer.redeemCustom
        ? `Own process: ${offer.redeemCustom}`
        : 'Own process.'
    default:
      return null
  }
}

/** The terms the merchant set — bill floor and audience limits. */
function termsLine(offer: OfferRecord): string | null {
  const bits: string[] = []
  if (offer.minBill && offer.minBill > 0) {
    bits.push(`min bill ₹${offer.minBill.toLocaleString('en-IN')}`)
  }
  if (offer.inStoreOnly) bits.push('in-store only')
  if (offer.newCustomersOnly) bits.push('new customers only')
  return bits.length ? bits.join(' · ') : null
}

function BackSvg() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m14.5 5-6.5 7 6.5 7" />
    </svg>
  )
}

function ShareSvg() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 15V4m0 0-4 4m4-4 4 4" />
      <path d="M4 14v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" />
    </svg>
  )
}

function DotsSvg() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true">
      <circle cx="5.5" cy="12" r="1.7" />
      <circle cx="12" cy="12" r="1.7" />
      <circle cx="18.5" cy="12" r="1.7" />
    </svg>
  )
}

function ClockSvg() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  )
}

function ResumeSvg() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1L3.5 8.3" />
      <path d="M3.5 3.5v4.8h4.8" />
    </svg>
  )
}

function CopySvg() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="8.5" y="8.5" width="12" height="12" rx="2" />
      <path d="M15.5 4.5h-9a2 2 0 0 0-2 2v9" />
    </svg>
  )
}

function WhatsAppSvg() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3.8a8.2 8.2 0 0 1 0 16.4c-1.5 0-3-.4-4.2-1.1L4 20.2l1.2-3.6A8.2 8.2 0 0 1 12 3.8Z" />
      <path d="M9.2 9c.4 2.5 2.4 4.5 4.9 4.9" />
    </svg>
  )
}

function FacebookSvg() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M15.5 4.5h-1.7a2.8 2.8 0 0 0-2.8 2.8V10H8.8v2.9H11V20h3v-7.1h2.3l.5-2.9h-2.8V7.6c0-.6.5-1.1 1.1-1.1h1.4Z" />
    </svg>
  )
}

function XSvg() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" aria-hidden="true">
      <path d="M5 4.5 19 19.5M19 4.5 5 19.5" />
    </svg>
  )
}

function PlaneSvg() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 4 3.5 11.2l5.3 2 2 5.3L21 4Z" />
      <path d="M8.8 13.2 21 4" />
    </svg>
  )
}

function MailSvg() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3.5" y="5.5" width="17" height="13" rx="2" />
      <path d="m4.5 7.5 7.5 5.7 7.5-5.7" />
    </svg>
  )
}

function TrashSvg() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 7h16" />
      <path d="M9.5 7V5a1.5 1.5 0 0 1 1.5-1.5h2A1.5 1.5 0 0 1 14.5 5v2" />
      <path d="M6.5 7 7.4 19a1.8 1.8 0 0 0 1.8 1.6h5.6a1.8 1.8 0 0 0 1.8-1.6L17.5 7" />
      <path d="M10 11v5.5M14 11v5.5" />
    </svg>
  )
}

function PencilSvg() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M16.5 3.5 20.5 7.5 7 21H3v-4L16.5 3.5Z" />
      <path d="m13.8 6.2 4 4" />
    </svg>
  )
}

const enc = encodeURIComponent

/** Web share targets open a new tab; mailto has to navigate the page. */
function openShareUrl(url: string, external: boolean): void {
  if (external) {
    window.open(url, '_blank', 'noopener,noreferrer')
  } else {
    window.location.href = url
  }
}

export default function BusinessOfferDetail({
  uid,
  shopName,
  offer,
  onBack,
  onRunAgain,
}: Props) {
  const status: OfferStatus = offer.status ?? 'live'
  const chip = CHIP[status]
  const [working, setWorking] = useState(false)
  const [error, setError] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirmingRemove, setConfirmingRemove] = useState(false)
  const [copied, setCopied] = useState(false)
  const copyTimer = useRef<number | null>(null)
  const [shareOpen, setShareOpen] = useState(false)
  const [endOpen, setEndOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  // Escape closes whichever overlay is open — share dialog, end-offer
  // confirm, or delete confirm.
  useEffect(() => {
    if (!shareOpen && !endOpen && !deleteOpen) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShareOpen(false)
        setEndOpen(false)
        setDeleteOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [shareOpen, endOpen, deleteOpen])

  // Badge split — the same first-space rule the list tiles use.
  const label = offer.discountLabel?.trim() ?? ''
  const splitAt = label.indexOf(' ')
  const big = label === '' ? '—' : splitAt === -1 ? label : label.slice(0, splitAt)
  const small =
    label === '' ? 'Draft' : splitAt === -1 ? '' : label.slice(splitAt + 1)
  const tileColor =
    status === 'ended' || status === 'changes'
      ? 'gray'
      : (offer.tileColor ?? 'yellow')

  // The one date line under the title, phrased for the status.
  const headline =
    status === 'scheduled'
      ? offer.startsAt
        ? `Starts ${fmtWhen(offer.startsAt)}`
        : 'Scheduled'
      : status === 'ended'
        ? offer.endsAt
          ? `Ended ${fmtWhen(offer.endsAt)}`
          : 'Ended'
        : status === 'review'
          ? (rel(offer.submittedAt)
              ? `Submitted ${rel(offer.submittedAt)}`
              : 'In review')
          : status === 'changes'
            ? ''
            : status === 'draft'
              ? (rel(offer.updatedAt)
                  ? `Edited ${rel(offer.updatedAt)}`
                  : 'Draft')
              : offer.endsAt
                ? `Ends ${fmtWhen(offer.endsAt)}`
                : ''

  async function act(next: OfferStatus): Promise<void> {
    setWorking(true)
    setError('')
    try {
      await setOfferStatus(uid, offer.id, next)
    } catch {
      setError('Could not update the offer. Try again.')
    } finally {
      setWorking(false)
    }
  }

  /** Resume puts a paused offer back live — unless its window has passed,
      in which case the honest outcome is ended. */
  async function resume(): Promise<void> {
    const over = offer.endsAt
      ? new Date(offer.endsAt).getTime() < Date.now()
      : false
    await act(over ? 'ended' : 'live')
  }

  /** End confirmed from the dialog; act() reports any failure on the page. */
  async function confirmEnd(): Promise<void> {
    await act('ended')
    setEndOpen(false)
  }

  // The shared link lands directly on this offer:
  //   <base>/<shopUid>/<offerId>?source=<provider>
  // The customer app resolves that route to the offer's own screen; the
  // source value rides along for per-channel analytics when they exist.
  const linkFor = (source: string) =>
    `${window.location.origin}${import.meta.env.BASE_URL}${uid}/${offer.id}?source=${source}`
  const summary = [
    offer.discountLabel ?? '',
    offer.title ?? '',
    `at ${shopName}`,
    offer.endsAt ? `Valid till ${fmtWhen(offer.endsAt)}` : '',
  ]
    .filter(Boolean)
    .join('\n')

  const shareLinks = [
    {
      label: 'WhatsApp',
      url: `https://wa.me/?text=${enc(`${summary}\n\n${linkFor('whatsapp')}`)}`,
      external: true,
      icon: <WhatsAppSvg />,
    },
    {
      label: 'Facebook',
      url: `https://www.facebook.com/sharer/sharer.php?u=${enc(linkFor('facebook'))}&quote=${enc(summary)}`,
      external: true,
      icon: <FacebookSvg />,
    },
    {
      label: 'X',
      url: `https://twitter.com/intent/tweet?text=${enc(summary)}&url=${enc(linkFor('x'))}`,
      external: true,
      icon: <XSvg />,
    },
    {
      label: 'Telegram',
      url: `https://t.me/share/url?url=${enc(linkFor('telegram'))}&text=${enc(summary)}`,
      external: true,
      icon: <PlaneSvg />,
    },
    {
      label: 'Email',
      url: `mailto:?subject=${enc(offer.title ?? shopName)}&body=${enc(`${summary}\n\n${linkFor('email')}`)}`,
      external: false,
      icon: <MailSvg />,
    },
  ]

  /** Copy tile — the full summary plus the offer's deep link. */
  async function copyShare(): Promise<void> {
    try {
      await navigator.clipboard.writeText(`${summary}\n\n${linkFor('copy')}`)
      setCopied(true)
      if (copyTimer.current !== null) {
        window.clearTimeout(copyTimer.current)
      }
      copyTimer.current = window.setTimeout(() => setCopied(false), 2200)
    } catch {
      setError("Couldn't copy. Try again.")
    }
  }

  async function remove(): Promise<void> {
    setWorking(true)
    setError('')
    try {
      await deleteOffer(uid, offer.id)
      onBack()
    } catch {
      setError('Could not delete the offer. Try again.')
      setWorking(false)
    }
  }

  const redeem = redeemLine(offer)
  const terms = termsLine(offer)
  const exclusions = offer.exclusions ?? []
  const photos = offer.photos ?? []
  const isLive = status === 'live'
  const isPaused = status === 'paused'
  const isScheduled = status === 'scheduled'
  const isEnded = status === 'ended'
  const isChanges = status === 'changes'

  return (
    <div className="biz-detail">
      <header className="biz-ob-top">
        <button
          type="button"
          className="biz-ob-back"
          aria-label="Back to my offers"
          onClick={onBack}
        >
          <BackSvg />
        </button>
        <h1 className="biz-ob-title">{isChanges ? 'Needs changes' : 'Offer'}</h1>
        {!isChanges && (
        <div className="biz-detail-toprow">
          <button
            type="button"
            className="biz-detail-circle"
            aria-label="Share offer"
            title="Share offer"
            aria-haspopup="dialog"
            onClick={() => setShareOpen(true)}
          >
            <ShareSvg />
          </button>
          <div className="biz-detail-menuwrap">
            <button
              type="button"
              className="biz-detail-circle"
              aria-label="More actions"
              aria-expanded={menuOpen}
              onClick={() => {
                setMenuOpen((value) => !value)
                setConfirmingRemove(false)
              }}
            >
              <DotsSvg />
            </button>
            {menuOpen && (
              <>
                <div
                  className="biz-menu-veil"
                  onClick={() => setMenuOpen(false)}
                />
                <div className="biz-menu" role="menu">
                  {confirmingRemove ? (
                    <>
                      <p className="biz-menu-confirm">
                        Delete this offer permanently?
                      </p>
                      <div className="biz-menu-row">
                        <button
                          type="button"
                          className="btn-secondary biz-btn"
                          disabled={working}
                          onClick={() => {
                            setConfirmingRemove(false)
                            setMenuOpen(false)
                          }}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          className="btn-danger biz-btn"
                          disabled={working}
                          onClick={() => void remove()}
                        >
                          Delete
                        </button>
                      </div>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="biz-menu-item"
                      onClick={() => setConfirmingRemove(true)}
                    >
                      Remove offer
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
        )}
      </header>

      {shareOpen && (
        <div className="biz-share-backdrop" onClick={() => setShareOpen(false)}>
          <div
            className="biz-share-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Share offer"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="biz-share-head">
              <h2 className="biz-share-title">Share offer</h2>
              <button
                type="button"
                className="biz-detail-circle biz-share-close"
                aria-label="Close share dialog"
                onClick={() => setShareOpen(false)}
              >
                ×
              </button>
            </header>
            <div className="biz-share-grid">
              {shareLinks.map((link) => (
                <button
                  key={link.label}
                  type="button"
                  className="biz-share-tile"
                  onClick={() => openShareUrl(link.url, link.external)}
                >
                  <span className="biz-share-tile-icon">{link.icon}</span>
                  <span className="biz-share-tile-label">{link.label}</span>
                </button>
              ))}
              <button
                type="button"
                className="biz-share-tile"
                onClick={() => void copyShare()}
              >
                <span className="biz-share-tile-icon">
                  {copied ? '✓' : <CopySvg />}
                </span>
                <span className="biz-share-tile-label">
                  {copied ? 'Copied!' : 'Copy'}
                </span>
              </button>
            </div>
            {error && (
              <p className="biz-share-error" role="alert">
                {error}
              </p>
            )}
          </div>
        </div>
      )}

      <section className="biz-detail-hero">
        <span
          className={`biz-otile biz-dtile biz-otile-${tileColor}${isChanges ? ' biz-dtile-flat' : ''}`}
          aria-hidden="true"
        >
          <span className="biz-otile-big">{big}</span>
          <span className="biz-otile-small">{small}</span>
        </span>
        <div className="biz-detail-hero-main">
          <span className={`biz-ochip biz-ochip-${chip.kind}`}>
            {chip.dot && <span className="biz-offer-dot" />}
            {chip.label}
          </span>
          <h2 className="biz-detail-name">{offer.title ?? 'Untitled offer'}</h2>
          {headline && <p className="biz-detail-when">{headline}</p>}
        </div>
      </section>

      {isChanges && offer.reviewNote && (
        <section className="biz-reviewnote">
          <span className="biz-reviewnote-label">Reviewer note</span>
          <p>{offer.reviewNote}</p>
        </section>
      )}

      {isChanges && offer.reviewFix && (
        <section className="biz-quickfix">
          <h2 className="biz-dash-h2">Quick fix</h2>
          <div className="biz-quickfix-card">
            <span className="biz-quickfix-try">Try something like</span>
            <p className="biz-quickfix-text">“{offer.reviewFix}”</p>
          </div>
          <p className="biz-quickfix-more">
            Read the Offer Guidelines. Questions? Reply to the reviewer from
            Help.
          </p>
        </section>
      )}

      {isPaused && offer.endsAt && (
        <div className="biz-detail-banner">
          <ClockSvg />
          <p>
            Paused — hidden from customers. Resume any time before{' '}
            {fmtDay(offer.endsAt)}.
          </p>
        </div>
      )}

      {!isChanges && (
      <section className="biz-detail-section">
        <h2 className="biz-dash-h2">{isEnded ? 'Final results' : 'Performance'}</h2>
        <p className="biz-detail-sub">Since it went live</p>
        <div className="biz-statrow biz-detail-stats">
          <div className="biz-statcard">
            <span className="biz-statcard-label">Views</span>
            <p className="biz-statcard-value">{fmt(offer.views ?? 0)}</p>
          </div>
          <div className="biz-statcard">
            <span className="biz-statcard-label">Saves</span>
            <p className="biz-statcard-value">{fmt(offer.saves ?? 0)}</p>
          </div>
          <div className="biz-statcard">
            <span className="biz-statcard-label">Directions</span>
            <p className="biz-statcard-value">{fmt(offer.directions ?? 0)}</p>
          </div>
          <div className="biz-statcard">
            <span className="biz-statcard-label">Redeemed</span>
            <p className="biz-statcard-value">{fmt(offer.redemptions ?? 0)}</p>
          </div>
        </div>
        <p className="biz-detail-fine">
          Redemptions count only when staff tap “Mark redeemed” or scan. Code
          offers can’t be tracked otherwise.
        </p>
      </section>
      )}

      {!isChanges && (
      <section className="biz-detail-section">
        <h2 className="biz-dash-h2">Details</h2>
        <div className="biz-detailcard">
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
          {offer.description && (
            <div className="biz-detailrow">
              <span className="biz-detailrow-label">About</span>
              <span className="biz-detailrow-value">{offer.description}</span>
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
          {offer.ref && (
            <div className="biz-detailrow">
              <span className="biz-detailrow-label">Reference</span>
              <span className="biz-detailrow-value">{offer.ref}</span>
            </div>
          )}
        </div>
      </section>
      )}

      {error && (
        <p className="biz-detail-error" role="alert">
          {error}
        </p>
      )}

      {endOpen && (
        <div className="biz-modal-backdrop" onClick={() => setEndOpen(false)}>
          <div
            className="biz-modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="biz-end-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 className="biz-modal-title" id="biz-end-title">
              End this offer now?
            </h2>
            <p className="biz-modal-body">
              It disappears from the app immediately.{' '}
              {(offer.saves ?? 0) > 0
                ? `${fmt(offer.saves ?? 0)} people saved it — they’ll see it as “Ended by shop”.`
                : 'No one has saved it yet.'}{' '}
              Claimed coupons still valid will be honoured until they expire.
            </p>
            <div className="biz-modal-actions">
              <button
                type="button"
                className="btn-danger biz-btn"
                disabled={working}
                onClick={() => void confirmEnd()}
              >
                End offer
              </button>
              <button
                type="button"
                className="btn-secondary biz-btn"
                disabled={working}
                onClick={() => setEndOpen(false)}
              >
                Keep it running
              </button>
            </div>
            {error && (
              <p className="biz-modal-error" role="alert">
                {error}
              </p>
            )}
          </div>
        </div>
      )}

      {deleteOpen && (
        <div
          className="biz-modal-backdrop"
          onClick={() => setDeleteOpen(false)}
        >
          <div
            className="biz-modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="biz-delete-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 className="biz-modal-title" id="biz-delete-title">
              Delete this offer?
            </h2>
            <p className="biz-modal-body">
              Permanently deletes this rejected offer. This can’t be undone.
            </p>
            <div className="biz-modal-actions">
              <button
                type="button"
                className="btn-danger biz-btn"
                disabled={working}
                onClick={() => void remove()}
              >
                Delete offer
              </button>
              <button
                type="button"
                className="btn-secondary biz-btn"
                disabled={working}
                onClick={() => setDeleteOpen(false)}
              >
                Keep it
              </button>
            </div>
            {error && (
              <p className="biz-modal-error" role="alert">
                {error}
              </p>
            )}
          </div>
        </div>
      )}

      {(isLive || isPaused || isScheduled || isEnded || isChanges) && (
        <div className="biz-ob-foot biz-detail-foot">
          {isLive && (
            <>
              <button
                type="button"
                className="btn-secondary biz-btn biz-detail-half"
                disabled={working}
                onClick={() => void act('paused')}
              >
                <ClockSvg /> Pause
              </button>
              <button
                type="button"
                className="btn-danger biz-btn biz-detail-half"
                disabled={working}
                onClick={() => setEndOpen(true)}
              >
                End offer now
              </button>
            </>
          )}
          {isPaused && (
            <>
              <button
                type="button"
                className="btn-secondary biz-btn biz-detail-half"
                disabled={working}
                onClick={() => setEndOpen(true)}
              >
                End
              </button>
              <button
                type="button"
                className="btn-primary biz-btn biz-detail-half"
                disabled={working}
                onClick={() => void resume()}
              >
                <ResumeSvg /> Resume
              </button>
            </>
          )}
          {isScheduled && (
            <button
              type="button"
              className="btn-danger biz-btn biz-detail-full"
              disabled={working}
              onClick={() => setEndOpen(true)}
            >
              End offer now
            </button>
          )}
          {isEnded && (
            <button
              type="button"
              className="btn-primary biz-btn biz-detail-full"
              disabled={working}
              onClick={() => onRunAgain(offer)}
            >
              <CopySvg /> Run it again
            </button>
          )}
          {isChanges && (
            <>
              <button
                type="button"
                className="btn-secondary biz-btn biz-detail-half"
                disabled={working}
                onClick={() => setDeleteOpen(true)}
              >
                <TrashSvg /> Delete
              </button>
              <button
                type="button"
                className="btn-primary biz-btn biz-detail-half"
                onClick={() => onRunAgain(offer)}
              >
                <PencilSvg /> Edit &amp; resubmit
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
