import { useState } from 'react'
import type { ReactNode } from 'react'
import type { OfferRecord, OfferStatus } from './shop'
import { fmtDay, fmtWhen, rel } from './when'

/** The "Your offers" screen — the Offers tab of the merchant dashboard.
    Everything renders from the live offers subscription; an empty shop gets
    the create pitch instead of invented rows. */

type Props = {
  offers: OfferRecord[]
  /** FAB and empty-state CTA — opens the offer builder. */
  onCreate: () => void
  /** Clicking an offer card — opens the Offer Details screen. */
  onOpen: (offerId: string) => void
}

type FilterKey = 'all' | 'live' | 'upcoming' | 'ended'

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'live', label: 'Live' },
  { key: 'upcoming', label: 'Upcoming & drafts' },
  { key: 'ended', label: 'Ended' },
]

const CHIP: Record<OfferStatus, { label: string; kind: string; dot?: boolean }> = {
  live: { label: 'Live', kind: 'live', dot: true },
  paused: { label: 'Paused', kind: 'gray' },
  scheduled: { label: 'Scheduled', kind: 'scheduled' },
  review: { label: 'In review', kind: 'review' },
  changes: { label: 'Needs changes', kind: 'changes' },
  draft: { label: 'Draft', kind: 'draft' },
  ended: { label: 'Ended', kind: 'gray' },
}

function bucket(status: OfferStatus): FilterKey {
  if (status === 'live' || status === 'paused') return 'live'
  if (status === 'ended') return 'ended'
  return 'upcoming' // draft · scheduled · review · changes
}

function fmt(value: number): string {
  return value.toLocaleString('en-IN')
}

function PlusSvg() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.6}
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

function ChevronSvg() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m9.5 5 6.5 7-6.5 7" />
    </svg>
  )
}

function TagSvg() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8Z" />
      <circle cx="7.5" cy="7.5" r="1.4" />
    </svg>
  )
}

/** Bottom line of a card, per lifecycle state — counters only where they
    exist, never invented. */
function metaLine(offer: OfferRecord, status: OfferStatus): ReactNode {
  if (status === 'scheduled') {
    return offer.startsAt ? `Starts ${fmtWhen(offer.startsAt)}` : 'Scheduled'
  }
  if (status === 'review') {
    const when = rel(offer.submittedAt)
    return when ? `Submitted ${when}` : 'In review'
  }
  if (status === 'changes') {
    return offer.reviewNote || 'Needs changes'
  }
  if (status === 'draft') {
    const when = rel(offer.updatedAt)
    return when ? `Edited ${when}` : 'Draft'
  }
  return (
    <>
      <span>{fmt(offer.views ?? 0)} views</span>
      <span>{fmt(offer.saves ?? 0)} saves</span>
      <span className="biz-ocard-strong">
        {fmt(offer.redemptions ?? 0)} redeemed
      </span>
    </>
  )
}

function OfferCard({
  offer,
  onOpen,
}: {
  offer: OfferRecord
  onOpen: (offerId: string) => void
}) {
  const status: OfferStatus = offer.status ?? 'live'
  const chip = CHIP[status]

  // Tile headline: "15% OFF" prints big "15%" over small "OFF". A draft
  // without a deal yet gets the honest dash.
  const label = offer.discountLabel?.trim() ?? ''
  const splitAt = label.indexOf(' ')
  const big = label === '' ? '—' : splitAt === -1 ? label : label.slice(0, splitAt)
  const small =
    label === '' ? 'Draft' : splitAt === -1 ? '' : label.slice(splitAt + 1)

  const tileColor =
    status === 'draft' || status === 'changes'
      ? 'gray'
      : (offer.tileColor ?? 'yellow')

  return (
    <button
      type="button"
      className="biz-offer-card"
      onClick={() => onOpen(offer.id)}
    >
      <span className={`biz-otile biz-otile-${tileColor}`} aria-hidden="true">
        <span className="biz-otile-big">{big}</span>
        <span className="biz-otile-small">{small}</span>
      </span>
      <span className="biz-ocard-main">
        <span className="biz-ocard-top">
          <span className={`biz-ochip biz-ochip-${chip.kind}`}>
            {chip.dot && <span className="biz-offer-dot" />}
            {chip.label}
          </span>
          <span className="biz-ocard-dates">
            {offer.startsAt && offer.endsAt
              ? `${fmtDay(offer.startsAt)} – ${fmtDay(offer.endsAt)}`
              : status === 'draft'
                ? 'Not scheduled'
                : ''}
          </span>
        </span>
        <span className="biz-ocard-title">
          {offer.title ?? 'Untitled offer'}
        </span>
        <span className="biz-ocard-meta">{metaLine(offer, status)}</span>
      </span>
      <span className="biz-ocard-chev" aria-hidden="true">
        <ChevronSvg />
      </span>
    </button>
  )
}

export default function BusinessOffers({ offers, onCreate, onOpen }: Props) {
  const [filter, setFilter] = useState<FilterKey>('all')

  const counts: Record<FilterKey, number> = {
    all: offers.length,
    live: 0,
    upcoming: 0,
    ended: 0,
  }
  for (const offer of offers) {
    counts[bucket(offer.status ?? 'live')] += 1
  }

  const visible =
    filter === 'all'
      ? offers
      : offers.filter((offer) => bucket(offer.status ?? 'live') === filter)

  return (
    <section className="biz-offers" aria-label="Your offers">
      <header className="biz-offers-head">
        <button
          type="button"
          className="biz-fab"
          aria-label="Create an offer"
          onClick={onCreate}
        >
          <PlusSvg />
        </button>
        <h1 className="biz-offers-title">Your offers</h1>
      </header>

      {offers.length === 0 ? (
        <div className="biz-oempty">
          <span className="biz-oempty-tile" aria-hidden="true">
            <TagSvg />
          </span>
          <h2 className="biz-oempty-h">No offers yet.</h2>
          <p className="biz-oempty-body">
            Post one and it shows up on the NearZoop map for shoppers within
            2–5 km of your shop.
          </p>
          <button type="button" className="btn-primary biz-btn" onClick={onCreate}>
            <PlusSvg />
            Create an offer
          </button>
        </div>
      ) : (
        <>
          <div className="biz-offer-filters">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                className={`biz-fchip${filter === f.key ? ' is-on' : ''}`}
                onClick={() => setFilter(f.key)}
              >
                {f.label} · {fmt(counts[f.key])}
              </button>
            ))}
          </div>
          {visible.length === 0 ? (
            <p className="biz-onone">No offers in this filter yet.</p>
          ) : (
            <div className="biz-offerlist">
              {visible.map((offer) => (
                <OfferCard key={offer.id} offer={offer} onOpen={onOpen} />
              ))}
            </div>
          )}
        </>
      )}
    </section>
  )
}
