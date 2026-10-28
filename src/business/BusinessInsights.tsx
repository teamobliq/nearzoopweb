import { useState } from 'react'
import type { OfferRecord, OfferStatus } from './shop'

/** Insights — the design's page, scoped to what the data layer truly
    records. Views carry day + weekday-hour buckets (written by every
    deep-link landing), redemptions carry day buckets (written by the scan
    flow), saves ship with the same bucketing for when the customer app
    arrives. Range chips filter everything through those buckets; the
    busiest-time chart reads the weekday-hour map, which has no dates in
    it — so it stays an all-time view and says so. "Where viewers are"
    stays out — nothing records viewer geography. */

type Props = {
  shopName: string
  offers: OfferRecord[]
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

export default function BusinessInsights({ shopName, offers }: Props) {
  const [range, setRange] = useState<RangeKind>('7d')
  const { start, end } = rangeWindow(range)
  const prev = prevWindow(range)
  const windowDays = windowLength(start, end)

  const opened = offers.reduce(
    (sum, o) => sum + sumDays(o.viewDays, start, end),
    0,
  )
  const saved = offers.reduce(
    (sum, o) => sum + sumDays(o.saveDays, start, end),
    0,
  )
  const redeemed = offers.reduce(
    (sum, o) => sum + sumDays(o.redeemDays, start, end),
    0,
  )
  const prevOpened = offers.reduce(
    (sum, o) => sum + sumDays(o.viewDays, prev.start, prev.end),
    0,
  )

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
  for (const offer of offers) {
    for (const [key, value] of Object.entries(offer.viewDays ?? {})) {
      if (key < start || key > end) continue
      const [y, m, d] = key.split('-').map(Number)
      if (!y || !m || !d) continue
      dowTotals[new Date(y, m - 1, d).getDay()] += value ?? 0
    }
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
      const views = sumDays(offer.viewDays, start, end)
      const reds = sumDays(offer.redeemDays, start, end)
      return {
        offer,
        views,
        redeemed: reds,
        conv: views > 0 ? `${Math.round((reds / views) * 100)}%` : null,
      }
    })
    .sort((a, b) => b.views - a.views || b.redeemed - a.redeemed)
  const topViews = offerRows[0]?.views ?? 0

  /* Chart — views per hour-of-day across the whole range (weekday-hour
      buckets merged), plus the single busiest weekday-hour slot. */
  const hourTotals = CHART_HOURS.map((hour) =>
    offers.reduce(
      (sum, o) =>
        sum +
        WEEKDAYS.reduce(
          (acc, dow) => acc + (o.viewHours?.[`${dow}-${hour}`] ?? 0),
          0,
        ),
      0,
    ),
  )
  const chartMax = Math.max(...hourTotals)
  const empty = chartMax === 0
  const peakIndex = hourTotals.indexOf(chartMax)

  let peak = '—'
  if (!empty) {
    let best = { dow: '', hour: 0, value: 0 }
    for (const offer of offers) {
      for (const [key, value] of Object.entries(offer.viewHours ?? {})) {
        const [dow, hourPart] = key.split('-')
        const hour = Number(hourPart)
        if (!WEEKDAYS.includes(dow) || Number.isNaN(hour)) continue
        if (hour >= 10 && hour <= 20 && (value ?? 0) > best.value) {
          best = { dow, hour, value: value ?? 0 }
        }
      }
    }
    if (best.value > 0) {
      peak = `${best.dow} ${hour12(best.hour)}–${hour12(best.hour + 1)} ${
        best.hour + 1 >= 12 ? 'PM' : 'AM'
      }`
    }
  }

  return (
    <div className="biz-insights">
      <h1 className="biz-insights-title">Insights</h1>
      <p className="biz-insights-sub">{shopName || 'Your shop'} · all offers</p>

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

      {offers.length === 0 ? (
        <div className="biz-detailcard biz-insights-card">
          <p className="biz-insights-empty">
            No offers yet — insights appear once your first offer is live.
          </p>
        </div>
      ) : (
        <>
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
