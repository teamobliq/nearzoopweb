import { useEffect, useState } from 'react'
import { haversineKm, cachedCoords } from '../business/geocode'
import { watchFeed, type FeedRecord } from '../business/feed'
import { fmtDay } from '../business/when'
import { fmtKm, type Coords } from './mapUtils'
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

function BookmarkSvg({ filled }: { filled?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M7 4h10v17l-5-4.5L7 21Z" />
    </svg>
  )
}

/** Rank badge circle — red for #1, gray for the rest. */
function RankBadge({ rank }: { rank: number }) {
  return (
    <span className={`trending-rank${rank === 1 ? ' is-one' : ''}`}>
      {rank}
    </span>
  )
}

type Props = {
  /** Called when the back arrow is tapped — returns to the previous screen. */
  onBack: () => void
}

/** "Trending near you" — offers ranked by views + saves in the last 7 days,
    within ~2 km of the user's fix. Standalone screen with its own back arrow,
    opened from the customer app's Explore tab or a deep link. */
export default function TrendingNearby({ onBack }: Props) {
  const [fix] = useState<Coords | null>(() => cachedCoords())
  const [feed, setFeed] = useState<FeedRecord[] | null>(null)
  const [feedError, setFeedError] = useState(false)

  useEffect(() => {
    watchFeed(
      (items) => {
        setFeed(items)
        setFeedError(false)
      },
      () => setFeedError(true),
    )
  }, [])

  // Ranked by views + saves (trending score), nearest-first tiebreak.
  const trending = (feed ?? [])
    .filter((item) => item.status === 'live' && !item.shopPaused)
    .map((item) => ({
      ...item,
      km:
        fix && typeof item.lat === 'number' && typeof item.lng === 'number'
          ? haversineKm(fix, { lat: item.lat, lng: item.lng })
          : null,
      score: (item.views ?? 0) + (item.saves ?? 0),
    }))
    .sort((a, b) => b.score - a.score || (a.km ?? 0) - (b.km ?? 0))

  const top4 = trending.slice(0, 4)

  if (feedError) {
    return (
      <main className="trending">
        <header className="trending-head">
          <button type="button" className="trending-back" onClick={onBack} aria-label="Back">
            <CloseSvg />
          </button>
          <h1 className="trending-title">Trending near you</h1>
        </header>
        <p className="trending-empty">Couldn’t load trending offers. Check your connection.</p>
      </main>
    )
  }

  return (
    <main className="trending">
      <header className="trending-head">
        <button type="button" className="trending-back" onClick={onBack} aria-label="Back">
          <CloseSvg />
        </button>
        <h1 className="trending-title">Trending near you</h1>
      </header>
      <p className="trending-sub">
        Ranked by views and saves from people within 2 km in the last 7 days.
      </p>

      <div className="trending-list">
        {top4.map((item, idx) => {
          const rank = idx + 1
          const label = item.discountLabel?.trim() ?? ''
          const splitAt = label.indexOf(' ')
          const big = label === '' ? '—' : splitAt === -1 ? label : label.slice(0, splitAt)
          const small = label === '' ? '' : label.slice(splitAt + 1)
          return (
            <article key={item.offerId} className="trending-card">
              <RankBadge rank={rank} />
              <button
                type="button"
                className="trending-card-hit"
                aria-label={item.title ?? 'Offer'}
              >
                <span
                  className={`biz-otile biz-otile-${item.tileColor ?? 'yellow'}`}
                  aria-hidden="true"
                >
                  <span className="biz-otile-big">{big}</span>
                  <span className="biz-otile-small">{small}</span>
                </span>
                <div className="trending-card-main">
                  <h2 className="trending-card-title">{item.title ?? 'Untitled offer'}</h2>
                  <p className="trending-card-shop">{item.shopName}</p>
                  <div className="trending-card-meta">
                    {item.km !== null && (
                      <span className="trending-card-dist">
                        {'📍'} {fmtKm(item.km)}
                      </span>
                    )}
                    {item.endsAt && (
                      <span className="trending-card-ends">
                        {'⏰'} Ends {fmtDay(item.endsAt)}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  className="trending-card-bookmark"
                  aria-label="Bookmark"
                >
                  <BookmarkSvg filled={false} />
                </button>
              </button>
              <p className="trending-card-stats">
                {(item.views ?? 0).toLocaleString('en-IN')} VIEWS ·{' '}
                {(item.saves ?? 0).toLocaleString('en-IN')} SAVES THIS WEEK
              </p>
            </article>
          )
        })}
      </div>

      {top4.length === 0 && (
        <p className="trending-empty">No trending offers nearby yet.</p>
      )}
    </main>
  )
}
