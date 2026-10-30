import { useState } from 'react'
import type { OfferRecord, OfferStatus, ViewEvent } from './shop'

/** Insights — the design's page, scoped to what the data layer truly
    records. Views arrive as raw events (one doc per landing open, written
    by the public landing — the only view write the rules let a visitor
    make), and every views number on this page aggregates them. Redemptions
    carry day buckets written by the scan flow, saves ship with the same
    bucketing for when the customer app arrives. Range chips filter
    everything through those buckets; the busiest-time chart reads the
    event stream's weekday-hour pairs, which have no dates in them — so it
    stays an all-time view and says so. "Where viewers are" stays out —
    nothing records viewer geography. */

type Props = {
  shopName: string
  offers: OfferRecord[]
  /** Raw view events from the shop's own stream. */
  views: ViewEvent[]
}

type RangeKind = '7d' | '30d' | 'puja'

const RANGES: { kind: RangeKind; label: string }[] = [
  { kind: '7d', label: '7 days' },
  { kind: '30d', label: '30 days' },
  { kind: 'puja', label: 'Puja season' },
]

/** The Puja shopping window — one constant, adjust the two dates each
    year. ISO days compare correctly as strings. */
const PUJA_SEASON = { start: '2026-09-15', end: '2026-10-31' }

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** Hours charted — the retail day the design shows, 10 AM through 8 PM. */
const CHART_HOURS = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]

const STATUS_LABEL: Partial<Record<OfferStatus, string>> = {
  draft: 'Draft',
  scheduled: 'Scheduled',
  review: 'In review',
  changes: 'Needs changes',
  paused: 'Paused',
  ended: 'Ended',
}

function isoDay(at = new Date()): string {
  const year = at.getFullYear()
  const month = String(at.getMonth() + 1).padStart(2, '0')
  const day = String(at.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function daysAgo(n: number): string {
  const at = new Date()
  at.setDate(at.getDate() - n)
  return isoDay(at)
}

function rangeWindow(kind: RangeKind): { start: string; end: string } {
  if (kind === '7d') return { start: daysAgo(6), end: isoDay() }
  if (kind === '30d') return { start: daysAgo(29), end: isoDay() }
  return PUJA_SEASON
}

/** The same-length window immediately before the selected one — the "vs
    previous" stat compares like with like. */
function prevWindow(kind: RangeKind): { start: string; end: string } {
  if (kind === '7d') return { start: daysAgo(13), end: daysAgo(7) }
  if (kind === '30d') return { start: daysAgo(59), end: daysAgo(30) }
  const length =
    (Date.parse(`${PUJA_SEASON.end}T00:00:00Z`) -
      Date.parse(`${PUJA_SEASON.start}T00:00:00Z`)) /
      86_400_000 +
    1
  return {
    start: shiftIso(PUJA_SEASON.start, -length),
    end: shiftIso(PUJA_SEASON.start, -1),
  }
}

/** Shifts an ISO day by N days (negative goes back). */
function shiftIso(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const at = new Date(y, (m || 1) - 1, d || 1)
  at.setDate(at.getDate() + days)
  return isoDay(at)
}

/** Whole days covered by an inclusive ISO window. */
function windowLength(start: string, end: string): number {
  return (
    Math.round(
      (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) /
        86_400_000,
    ) + 1
  )
}

/** Sums a day-bucket map over the window. ISO day strings order
    lexicographically, so plain comparisons do the range math. */
function sumDays(
  days: Record<string, number> | undefined,
  start: string,
  end: string,
): number {
  if (!days) return 0
  let total = 0
  for (const [key, value] of Object.entries(days)) {
    if (key >= start && key <= end) total += value ?? 0
  }
  return total
}

/** "10A", "12P", "7" — the design's compact axis labels. */
function hourLabel(hour: number): string {
  if (hour === 10) return '10A'
  if (hour === 12) return '12P'
  return String(hour % 12 === 0 ? 12 : hour % 12)
}

/** 18 → "6", 19 → "7" for the peak callout. */
function hour12(hour: number): string {
  return String(hour % 12 === 0 ? 12 : hour % 12)
}

/** Bar-chart tile for the empty state — the page's promise, not fake data. */
function ChartSvg() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 20h18" />
      <path d="M7 20v-6" />
      <path d="M12 20V9" />
      <path d="M17 20v-9" />
    </svg>
  )
}

export default function BusinessInsights({ shopName, offers, views }: Props) {
  const [range, setRange] = useState<RangeKind>('7d')
  const { start, end } = rangeWindow(range)
  const prev = prevWindow(range)
  const windowDays = windowLength(start, end)

  // Views are raw events — the public landing writes one doc per open,
  // and every views number on this page aggregates them. Saves and
  // redemptions stay on the offer's own day buckets, written by the
  // merchant's own flows.
  const inWindow = views.filter((e) => e.day >= start && e.day <= end)
  const opened = inWindow.length
  const saved = offers.reduce(
    (sum, o) => sum + sumDays(o.saveDays, start, end),
    0,
  )
  const redeemed = offers.reduce(
    (sum, o) => sum + sumDays(o.redeemDays, start, end),
    0,
  )
  const prevOpened = views.filter(
    (e) => e.day >= prev.start && e.day <= prev.end,
  ).length

  // All-time views — the first event every deep-link landing writes. Zero
  // across every offer means nothing has been measured yet, so the page
  // says so instead of showing a wall of zeros and dashes.
  const everViews = views.length
  const collecting = everViews === 0

  const rows = [
    { label: 'Opened details', value: opened, kind: 'gold' },
    { label: 'Saved', value: saved, kind: 'pale' },
    { label: 'Redeemed', value: redeemed, kind: 'red' },
  ] as const
  const max = Math.max(...rows.map((row) => row.value))

  /* Stat strip — all derived from the same buckets, nothing invented.
     Conversion is views that ended in a redemption; "views a day" spreads
     the window evenly; the busiest weekday comes from the day buckets;
     the trend compares against the equal-length window right before. */
  const conversion = opened > 0 ? Math.round((redeemed / opened) * 100) : null
  const perDay = opened / windowDays
  const perDayLabel =
    perDay >= 10 ? String(Math.round(perDay)) : perDay.toFixed(1)

  const dowTotals = [0, 0, 0, 0, 0, 0, 0]
  for (const event of inWindow) {
    const [y, m, d] = event.day.split('-').map(Number)
    if (!y || !m || !d) continue
    dowTotals[new Date(y, m - 1, d).getDay()] += 1
  }
  const busiestTotal = Math.max(...dowTotals)
  const busiest =
    busiestTotal > 0 ? WEEKDAYS[dowTotals.indexOf(busiestTotal)] : null

  let trend: { dir: 'up' | 'down' | 'flat'; text: string } | null = null
  if (prevOpened === 0 && opened > 0) {
    trend = { dir: 'up', text: 'New' }
  } else if (prevOpened > 0) {
    const pct = Math.round(((opened - prevOpened) / prevOpened) * 100)
    if (pct === 0) trend = { dir: 'flat', text: '±0%' }
    else if (pct > 0) trend = { dir: 'up', text: `+${pct}%` }
    else trend = { dir: 'down', text: `${pct}%` }
  }

  /* How redemptions happened, derived from the offer kind: coupon offers
      are scanned at the counter, every other kind is counted by staff.
      Coupon scanning wakes up with the claims system — until then this
      honestly reads 0 · N. */
  const scanned = offers
    .filter((o) => (o.redeemKind ?? 'screen') === 'coupon')
    .reduce((sum, o) => sum + sumDays(o.redeemDays, start, end), 0)
  const marked = redeemed - scanned

  /* Per-offer breakdown for the same window. */
  const offerRows = offers
    .map((offer) => {
      const opens = inWindow.filter((e) => e.offerId === offer.id).length
      const reds = sumDays(offer.redeemDays, start, end)
      return {
        offer,
        views: opens,
        redeemed: reds,
        conv: opens > 0 ? `${Math.round((reds / opens) * 100)}%` : null,
      }
    })
    .sort((a, b) => b.views - a.views || b.redeemed - a.redeemed)
  const topViews = offerRows[0]?.views ?? 0

  /* Chart — views per hour-of-day across the whole range (weekday-hour
      buckets merged), plus the single busiest weekday-hour slot. */
  const hourTotals = CHART_HOURS.map(
    (hour) => views.filter((e) => Number(e.hour.split('-')[1]) === hour).length,
  )
  const chartMax = Math.max(...hourTotals)
  const empty = chartMax === 0
  const peakIndex = hourTotals.indexOf(chartMax)

  let peak = '—'
  if (!empty) {
    // Count every weekday-hour slot the events touch, then take the
    // busiest — the same call the old bucket map made, from raw events.
    const slots = new Map<string, number>()
    for (const event of views) {
      const [dow, hourPart] = event.hour.split('-')
      const hour = Number(hourPart)
      if (!WEEKDAYS.includes(dow) || Number.isNaN(hour)) continue
      if (hour < 10 || hour > 20) continue
      const key = `${dow}-${hour}`
      slots.set(key, (slots.get(key) ?? 0) + 1)
    }
    let best: { key: string; value: number } | null = null
    for (const [key, value] of slots) {
      if (!best || value > best.value) best = { key, value }
    }
    if (best) {
      const [dow, hourPart] = best.key.split('-')
      const hour = Number(hourPart)
      peak = `${dow} ${hour12(hour)}–${hour12(hour + 1)} ${
        hour + 1 >= 12 ? 'PM' : 'AM'
      }`
    }
  }

  return (
    <div className="biz-insights">
      <h1 className="biz-insights-title">Insights</h1>
      <p className="biz-insights-sub">{shopName || 'Your shop'} · all offers</p>

      {collecting ? (
        <div className="biz-first biz-insights-hero">
          <div className="biz-first-tile biz-insights-tile" aria-hidden="true">
            <ChartSvg />
          </div>
          <div className="biz-first-main">
            <h2 className="biz-dash-h2">
              {offers.length === 0
                ? 'Nothing to measure yet.'
                : 'We’re collecting stats.'}
            </h2>
            <p className="biz-dash-body">
              {offers.length === 0
                ? 'Insights appear once your first offer is live and people start opening it.'
                : 'Every view, save and redemption from your shared links is counted here. Once people start opening your offers, the numbers appear.'}
            </p>
            <p className="biz-dash-tip">
              {offers.length === 0
                ? 'Tip: shops with a live offer get seen on the NearZoop map.'
                : 'Tip: share your offer links — every open counts as a view here.'}
            </p>
          </div>
        </div>
      ) : (
        <>
          <div className="biz-insights-chips" role="tablist" aria-label="Date range">
            {RANGES.map((item) => (
              <button
                key={item.kind}
                type="button"
                role="tab"
                aria-selected={range === item.kind}
                className={`biz-insights-chip${range === item.kind ? ' is-on' : ''}`}
                onClick={() => setRange(item.kind)}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="biz-insights-stats">
            <div className="biz-detailcard biz-insights-stat">
              <span className="biz-insights-statvalue">
                {conversion === null ? '—' : `${conversion}%`}
              </span>
              <span className="biz-insights-statlabel">Views that redeemed</span>
            </div>
            <div className="biz-detailcard biz-insights-stat">
              <span className="biz-insights-statvalue">{perDayLabel}</span>
              <span className="biz-insights-statlabel">Views a day</span>
            </div>
            <div className="biz-detailcard biz-insights-stat">
              <span className="biz-insights-statvalue">{busiest ?? '—'}</span>
              <span className="biz-insights-statlabel">Busiest day</span>
            </div>
            <div className="biz-detailcard biz-insights-stat">
              <span
                className={`biz-insights-statvalue${
                  trend ? ` is-${trend.dir}` : ''
                }`}
              >
                {trend === null
                  ? '—'
                  : `${trend.dir === 'up' ? '▲ ' : trend.dir === 'down' ? '▼ ' : ''}${trend.text}`}
              </span>
              <span className="biz-insights-statlabel">
                {range === '7d'
                  ? 'Vs previous 7 days'
                  : range === '30d'
                    ? 'Vs previous 30 days'
                    : 'Vs the weeks before'}
              </span>
            </div>
          </div>

          <div className="biz-insights-cards">
            <section className="biz-detailcard biz-insights-card">
              <h2 className="biz-insights-label">From seen to sold</h2>
              {rows.map((row) => {
                // Funnel widths — each stage as a share of the biggest. With
                // nothing counted in this range every bar rests at a visible
                // stub, so the structure reads while numbers stay true zeros.
                const pct = max === 0 ? 16 : (row.value / max) * 100
                return (
                  <div className="biz-insights-row" key={row.kind}>
                    <span className="biz-insights-barzone">
                      <span
                        className={`biz-insights-bar biz-insights-${row.kind}`}
                        style={{ width: `${pct}%` }}
                      >
                        {row.value.toLocaleString('en-IN')}
                      </span>
                    </span>
                    <span className="biz-insights-rowlabel">{row.label}</span>
                  </div>
                )
              })}
              {redeemed > 0 && (
                <p className="biz-insights-split">
                  {scanned} from scanned coupons · {marked} marked by staff
                </p>
              )}
            </section>

            <section className="biz-detailcard biz-insights-card">
              <div className="biz-insights-charttop">
                <h2 className="biz-insights-label">
                  Busiest time for views
                  <span className="biz-insights-alltime">all time</span>
                </h2>
                <span className="biz-insights-peak">{peak}</span>
              </div>
              <div className="biz-insights-chart">
                {CHART_HOURS.map((hour, index) => {
                  const value = hourTotals[index]
                  const height =
                    empty || value === 0
                      ? 0
                      : Math.max((value / chartMax) * 100, 6)
                  return (
                    <div className="biz-insights-col" key={hour}>
                      <div className="biz-insights-barzone-v">
                        <span
                          className={`biz-insights-vbar${
                            !empty && index === peakIndex ? ' is-peak' : ''
                          }${height === 0 ? ' is-zero' : ''}`}
                          style={{ height: `${empty ? 6 : height}%` }}
                        />
                      </div>
                      <span className="biz-insights-collabel">
                        {hourLabel(hour)}
                      </span>
                    </div>
                  )
                })}
              </div>
            </section>
          </div>

          <section className="biz-detailcard biz-insights-card biz-insights-wide">
            <h2 className="biz-insights-label">Offer by offer</h2>
            <div className="biz-insights-ohead">
              <span>Offer</span>
              <span>Views</span>
              <span>Redeemed</span>
              <span>Conv.</span>
            </div>
            {offerRows.map((row) => (
              <div className="biz-insights-orow" key={row.offer.id}>
                <span className="biz-insights-oname">
                  <span className="biz-insights-otitle">
                    {row.offer.title || 'Untitled offer'}
                  </span>
                  {row.offer.status !== 'live' && (
                    <span className="biz-insights-ostatus">
                      {STATUS_LABEL[row.offer.status ?? 'draft'] ?? 'Draft'}
                    </span>
                  )}
                  {row.views > 0 && row.views === topViews && (
                    <span className="biz-insights-otop">Top</span>
                  )}
                </span>
                <span className="biz-insights-onum">
                  {row.views.toLocaleString('en-IN')}
                </span>
                <span className="biz-insights-onum">
                  {row.redeemed.toLocaleString('en-IN')}
                </span>
                <span className="biz-insights-onum">{row.conv ?? '—'}</span>
              </div>
            ))}
          </section>
        </>
      )}
    </div>
  )
}
