import { useEffect, useState } from 'react'
import type { AdminOfferEntry, AdminShopEntry, OfferRecord } from '../business/shop'
import { offerDiscountLabel } from '../business/shop'
import { fmtWhen, rel } from '../business/when'

type Props = {
  offers: AdminOfferEntry[]
  shops: AdminShopEntry[]
  loading: boolean
  /** Approve resolves the status from the offer's own window; changes
      records the note and flips the offer back to the merchant. */
  onDecide: (
    shopUid: string,
    offerId: string,
    verdict: 'approve' | 'changes',
    note?: string,
    fix?: string,
  ) => Promise<void>
  /** Permanently deletes the offer; the caller closes the dialog after. */
  onDelete: (shopUid: string, offerId: string) => Promise<void>
}

/** The offers tab: every offer across all shops, joined with shop names.
    Rows are a compact summary; clicking one opens the full review dialog. */
export default function AdminOffers({ offers, shops, loading, onDecide, onDelete }: Props) {
  // Which offer's dialog is open, keyed "shopUid/offerId" — the dialog
  // re-reads the live entry, so a verdict updates it in place.
  const [openKey, setOpenKey] = useState('')
  const openEntry = openKey
    ? offers.find((entry) => `${entry.shopUid}/${entry.offer.id}` === openKey)
    : undefined

  useEffect(() => {
    if (!openKey) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenKey('')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [openKey])

  if (loading) {
    return <p className="admin-empty">Loading offers…</p>
  }

  const names = new Map(
    shops.map((entry) => [entry.uid, entry.shop.name || 'Unnamed shop']),
  )

  return (
    <>
      <div className="admin-card admin-tablewrap">
        {offers.length === 0 ? (
          <p className="admin-empty">
            No offers yet — submitted offers appear here for review.
          </p>
        ) : (
          <table className="admin-table admin-offertable">
            <colgroup>
              <col className="w-offer" />
              <col className="w-shop" />
              <col className="w-status" />
              <col className="w-discount" />
              <col className="w-window" />
            </colgroup>
            <thead>
              <tr>
                <th>Offer</th>
                <th>Shop</th>
                <th>Status</th>
                <th>Discount</th>
                <th>Window</th>
              </tr>
            </thead>
            <tbody>
              {offers.map((entry) => (
                <OfferRow
                  key={`${entry.shopUid}/${entry.offer.id}`}
                  entry={entry}
                  shopName={names.get(entry.shopUid) ?? `${entry.shopUid.slice(0, 8)}…`}
                  onOpen={() =>
                    setOpenKey(`${entry.shopUid}/${entry.offer.id}`)
                  }
                />
              ))}
            </tbody>
          </table>
        )}
      </div>
      {openEntry && (
        <OfferDialog
          entry={openEntry}
          shopName={
            names.get(openEntry.shopUid) ??
            `${openEntry.shopUid.slice(0, 8)}…`
          }
          onClose={() => setOpenKey('')}
          onDecide={onDecide}
          onDelete={onDelete}
        />
      )}
    </>
  )
}

/** The discount a list screen would show — computed from the deal fields,
    falling back to any stored label for older docs. */
function dealLabel(offer: OfferRecord): string {
  if (offer.dealKind) {
    return offerDiscountLabel(
      offer.dealKind,
      offer.dealValue ?? '',
      offer.dealScope ?? '',
    )
  }
  return offer.discountLabel || '—'
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

/** The terms a reviewer should eyeball — bill floor, audience limits,
    exclusions. Null when the merchant set none of them. */
function termsLine(offer: OfferRecord): string | null {
  const bits: string[] = []
  if (offer.minBill && offer.minBill > 0) {
    bits.push(`min bill ₹${offer.minBill.toLocaleString('en-IN')}`)
  }
  if (offer.inStoreOnly) bits.push('in-store only')
  if (offer.newCustomersOnly) bits.push('new customers only')
  return bits.length ? bits.join(' · ') : null
}

/** One summary row. The whole row opens the dialog; the title stays a real
    button so keyboard users get the same action. */
function OfferRow({
  entry,
  shopName,
  onOpen,
}: {
  entry: AdminOfferEntry
  shopName: string
  onOpen: () => void
}) {
  const { offer } = entry
  const when = rel(offer.submittedAt ?? offer.createdAt)

  return (
    <tr className="admin-offerrow-row" onClick={onOpen}>
      <td>
        <button
          type="button"
          className="admin-offerlink"
          onClick={(event) => {
            event.stopPropagation()
            onOpen()
          }}
        >
          {offer.title || offer.id}
        </button>
        {(offer.ref || when) && (
          <span className="admin-cellsub">
            {[offer.ref, when].filter(Boolean).join(' · ')}
          </span>
        )}
      </td>
      <td>{shopName}</td>
      <td>
        <span className={`admin-chip admin-chip-${offer.status ?? 'draft'}`}>
          {offer.status ?? 'draft'}
        </span>
      </td>
      <td className="admin-nowrap">{dealLabel(offer)}</td>
      <td className="admin-nowrap">
        {offer.startsAt && offer.endsAt
          ? `${fmtWhen(offer.startsAt)} → ${fmtWhen(offer.endsAt)}`
          : '—'}
      </td>
    </tr>
  )
}

/** The full review dialog: pitch, facts, photos, and the verdict actions
    pinned to the footer. Backdrop click or Escape closes it. */
function OfferDialog({
  entry,
  shopName,
  onClose,
  onDecide,
  onDelete,
}: {
  entry: AdminOfferEntry
  shopName: string
  onClose: () => void
  onDecide: Props['onDecide']
  onDelete: Props['onDelete']
}) {
  const { offer } = entry
  const status = offer.status ?? 'draft'
  const when = rel(offer.submittedAt ?? offer.createdAt)
  const exclusions = offer.exclusions ?? []
  const photos = offer.photos ?? []
  const redeem = redeemLine(offer)
  const terms = termsLine(offer)

  return (
    <div className="admin-modal-backdrop" onClick={onClose}>
      <div
        className="admin-modal"
        role="dialog"
        aria-modal="true"
        aria-label={`Review ${offer.title || offer.id}`}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="admin-modalhead">
          <div>
            <h3 className="admin-modaltitle">{offer.title || offer.id}</h3>
            <span className="admin-cellsub">
              {[offer.ref, when].filter(Boolean).join(' · ')}
            </span>
          </div>
          <div className="admin-modalheadrow">
            <span className={`admin-chip admin-chip-${status}`}>
              {status}
            </span>
            <button
              type="button"
              className="admin-modalclose"
              aria-label="Close"
              onClick={onClose}
            >
              ×
            </button>
          </div>
        </header>

        <div className="admin-modalbody">
          {offer.description && (
            <p className="admin-offerpitch">{offer.description}</p>
          )}
          <div className="admin-factrow">
            <span className="admin-factlabel">Shop</span>
            <span className="admin-factvalue">{shopName}</span>
          </div>
          <div className="admin-factrow">
            <span className="admin-factlabel">Discount</span>
            <span className="admin-factvalue">{dealLabel(offer)}</span>
          </div>
          <div className="admin-factrow">
            <span className="admin-factlabel">Window</span>
            <span className="admin-factvalue">
              {offer.startsAt && offer.endsAt
                ? `${fmtWhen(offer.startsAt)} → ${fmtWhen(offer.endsAt)}`
                : '—'}
            </span>
          </div>
          <div className="admin-factrow">
            <span className="admin-factlabel">So far</span>
            <span className="admin-factvalue">
              {offer.views ?? 0} views · {offer.saves ?? 0} saves ·{' '}
              {offer.redemptions ?? 0} redemptions
            </span>
          </div>
          {redeem && (
            <div className="admin-factrow">
              <span className="admin-factlabel">Redemption</span>
              <span className="admin-factvalue">{redeem}</span>
            </div>
          )}
          {terms && (
            <div className="admin-factrow">
              <span className="admin-factlabel">Terms</span>
              <span className="admin-factvalue">{terms}</span>
            </div>
          )}
          {exclusions.length > 0 && (
            <div className="admin-factrow">
              <span className="admin-factlabel">Not valid for</span>
              <ul className="admin-factlist">
                {exclusions.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          )}
          {photos.length > 0 && (
            <div className="admin-factrow">
              <span className="admin-factlabel">Photos</span>
              <span className="admin-offerthumbs">
                {photos.map((url) => (
                  <img key={url} src={url} alt="" className="admin-offerthumb" />
                ))}
              </span>
            </div>
          )}
          {offer.reviewNote && (
            <p className="admin-offernote">
              Last review note: {offer.reviewNote}
            </p>
          )}
        </div>

        <footer className="admin-modalfoot">
          <OfferActions
            entry={entry}
            onDecide={onDecide}
            onDelete={async (shopUid, offerId) => {
              await onDelete(shopUid, offerId)
              onClose()
            }}
          />
        </footer>
      </div>
    </div>
  )
}

/** Footer actions for one offer: verdicts for offers under review, and a
    guarded Remove for any offer regardless of status. */
function OfferActions({
  entry,
  onDecide,
  onDelete,
}: {
  entry: AdminOfferEntry
  onDecide: Props['onDecide']
  onDelete: Props['onDelete']
}) {
  const { offer, shopUid } = entry
  const [rejecting, setRejecting] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [note, setNote] = useState('')
  const [fix, setFix] = useState('')
  const [working, setWorking] = useState(false)
  const [error, setError] = useState('')
  const isReview = (offer.status ?? 'draft') === 'review'

  async function act(
    verdict: 'approve' | 'changes',
    withNote = '',
    withFix = '',
  ): Promise<void> {
    setWorking(true)
    setError('')
    try {
      await onDecide(shopUid, offer.id, verdict, withNote, withFix)
      setRejecting(false)
      setNote('')
      setFix('')
    } catch {
      setError('Could not save. Try again.')
    } finally {
      setWorking(false)
    }
  }

  /** Permanent delete — on success the parent closes the dialog and the
      live feed drops the row, so no state needs resetting here. */
  async function remove(): Promise<void> {
    setWorking(true)
    setError('')
    try {
      await onDelete(shopUid, offer.id)
    } catch {
      setError('Could not delete. Try again.')
      setWorking(false)
    }
  }

  if (removing) {
    return (
      <div className="admin-offeractions">
        <p className="admin-removeconfirm">
          Permanently delete this offer? This can't be undone.
        </p>
        <div className="admin-offerrow">
          <button
            type="button"
            className="admin-btn admin-btn-reject"
            disabled={working}
            onClick={() => void remove()}
          >
            Delete offer
          </button>
          <button
            type="button"
            className="admin-ghostbtn"
            disabled={working}
            onClick={() => setRemoving(false)}
          >
            Cancel
          </button>
        </div>
        {error && <span className="admin-actionerror">{error}</span>}
      </div>
    )
  }

  if (rejecting) {
    return (
      <div className="admin-offeractions">
        <div>
          <label className="admin-rejectlabel" htmlFor="admin-reject-why">
            1. Why rejected?
          </label>
          <input
            id="admin-reject-why"
            className="admin-rejectinput"
            value={note}
            maxLength={200}
            placeholder="What should change?"
            onChange={(event) => setNote(event.target.value)}
          />
        </div>
        <div>
          <label className="admin-rejectlabel" htmlFor="admin-reject-fix">
            2. Quick fix
          </label>
          <input
            id="admin-reject-fix"
            className="admin-rejectinput"
            value={fix}
            maxLength={120}
            placeholder="Try something like… (optional)"
            onChange={(event) => setFix(event.target.value)}
          />
        </div>
        <div className="admin-offerrow">
          <button
            type="button"
            className="admin-btn admin-btn-reject"
            disabled={working || !note.trim()}
            onClick={() => void act('changes', note.trim(), fix.trim())}
          >
            Send
          </button>
          <button
            type="button"
            className="admin-ghostbtn"
            disabled={working}
            onClick={() => {
              setRejecting(false)
              setNote('')
              setFix('')
            }}
          >
            Cancel
          </button>
        </div>
        {error && <span className="admin-actionerror">{error}</span>}
      </div>
    )
  }

  if (!isReview) {
    return (
      <div className="admin-offeractions admin-offeractions-row">
        <p className="admin-modaldecided">
          Decided — this offer is {offer.status ?? 'draft'}.
        </p>
        <button
          type="button"
          className="admin-ghostbtn admin-ghostbtn-danger"
          disabled={working}
          onClick={() => setRemoving(true)}
        >
          Remove…
        </button>
        {error && <span className="admin-actionerror">{error}</span>}
      </div>
    )
  }

  return (
    <div className="admin-offeractions">
      <div className="admin-offerrow">
        <button
          type="button"
          className="admin-btn admin-btn-verify"
          disabled={working}
          title="Approval picks the status from the offer's own window — live now, scheduled for later, or already ended"
          onClick={() => void act('approve')}
        >
          Approve (goes live)
        </button>
        <button
          type="button"
          className="admin-btn admin-btn-reject"
          disabled={working}
          onClick={() => {
            // Prefill from any earlier verdict so a re-review edits the
            // existing note instead of starting blank.
            setNote(offer.reviewNote ?? '')
            setFix(offer.reviewFix ?? '')
            setRejecting(true)
          }}
        >
          Changes…
        </button>
        <button
          type="button"
          className="admin-ghostbtn admin-ghostbtn-danger"
          disabled={working}
          onClick={() => setRemoving(true)}
        >
          Remove…
        </button>
      </div>
      {error && <span className="admin-actionerror">{error}</span>}
    </div>
  )
}
