import { useEffect, useRef, useState } from 'react'
import {
  markNotificationsRead,
  respondToReport,
  watchShopNotifications,
  watchShopReports,
  REPORT_RESPONSES,
  type OfferRecord,
  type ShopNotification,
  type ShopReport,
} from './shop'

/** The Notifications page — the dashboard's inbox. Every admin verdict
    (shop and offers) and every customer report from a shared link lands
    here; the weekly summary line is computed live from the redemption
    buckets. Report cards open the report detail, where the merchant
    responds — reports have no other entry point. Opening the page clears
    the unread badges once, so later arrivals keep their dot. */

type Props = {
  uid: string
  offers: OfferRecord[]
}

/* ---- shared bits ---- */

function FlagSvg() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5.5 21V4" />
      <path d="M5.5 4.5c4-2.2 8 2.2 12 0v8c-4 2.2-8-2.2-12 0" />
    </svg>
  )
}

function CheckSvg() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </svg>
  )
}

function InfoSvg() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5" />
      <path d="M12 7.8v.4" />
    </svg>
  )
}

function TrendSvg() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m4 17 5.5-5.5 3.5 3.5L20 8" />
      <path d="M15 8h5v5" />
    </svg>
  )
}

function SendSvg() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M22 2 11 13" />
      <path d="M22 2 15 22l-4-9-9-4 20-7Z" />
    </svg>
  )
}

function BellSvg() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 9.5a6 6 0 1 0-12 0c0 5-2 6-2 6h16s-2-1-2-6" />
      <path d="M10 19a2.2 2.2 0 0 0 4 0" />
    </svg>
  )
}

/** Shared sub-screen frame: back circle, title, scrollable body. */
function SubScreen({
  title,
  backTo,
  onBack,
  children,
}: {
  title: string
  backTo: string
  onBack: () => void
  children: React.ReactNode
}) {
  return (
    <div className="biz-shopscreen">
      <header className="biz-shopedit-head">
        <button
          type="button"
          className="biz-shopedit-back"
          onClick={onBack}
          aria-label={`Back to ${backTo}`}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m15 5-7 7 7 7" />
          </svg>
        </button>
        <h1>{title}</h1>
      </header>
      {children}
    </div>
  )
}

const REL_WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** "2 h", "Yesterday", "Mon", "24 Oct" — the inbox's compact stamps. */
function relStamp(at: Date | undefined): string {
  if (!at || Number.isNaN(at.getTime())) return ''
  const now = new Date()
  const diffMin = Math.round((now.getTime() - at.getTime()) / 60000)
  if (diffMin < 1) return 'now'
  if (diffMin < 60) return `${diffMin} min`
  if (diffMin < 24 * 60) return `${Math.floor(diffMin / 60)} h`
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  )
  const startOfThat = new Date(at.getFullYear(), at.getMonth(), at.getDate())
  const dayDiff = Math.round(
    (startOfToday.getTime() - startOfThat.getTime()) / 86_400_000,
  )
  if (dayDiff === 1) return 'Yesterday'
  if (dayDiff < 7) return REL_WEEKDAYS[at.getDay()]
  return at.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

function isoDayOf(at: Date): string {
  const year = at.getFullYear()
  const month = String(at.getMonth() + 1).padStart(2, '0')
  const day = String(at.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** The design's weekly summary line, computed live from the redemption
    day buckets — rolling last 7 days vs the 7 before. Null when there is
    nothing to say yet. */
function redeemSummary(offers: OfferRecord[]): string | null {
  const recent: string[] = []
  const prior: string[] = []
  for (let i = 0; i < 7; i += 1) {
    const at = new Date()
    at.setDate(at.getDate() - i)
    recent.push(isoDayOf(at))
  }
  for (let i = 7; i < 14; i += 1) {
    const at = new Date()
    at.setDate(at.getDate() - i)
    prior.push(isoDayOf(at))
  }
  const sum = (keys: string[]) =>
    offers.reduce(
      (sum, offer) =>
        sum + keys.reduce((acc, key) => acc + (offer.redeemDays?.[key] ?? 0), 0),
      0,
    )
  const thisWeek = sum(recent)
  const lastWeek = sum(prior)
  if (thisWeek === 0 && lastWeek === 0) return null
  if (lastWeek === 0) {
    return `${thisWeek} redemption${thisWeek === 1 ? '' : 's'} this week.`
  }
  const diff = thisWeek - lastWeek
  if (diff === 0) return `${thisWeek} redemptions, level with last week.`
  return `${thisWeek} redemption${thisWeek === 1 ? '' : 's'}, ${
    diff > 0 ? 'up' : 'down'
  } ${Math.abs(diff)} from last week.`
}

/* ---- the page ---- */

export default function BusinessNotifications({ uid, offers }: Props) {
  const [items, setItems] = useState<ShopNotification[] | null>(null)
  const [reports, setReports] = useState<ShopReport[] | null>(null)
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null)
  // Opening the inbox clears the "new" badges — once, on the first
  // snapshot, so later arrivals keep their dot until the next visit.
  const markedRef = useRef(false)

  useEffect(() => {
    const un1 = watchShopNotifications(uid, (next) => {
      setItems(next)
      if (!markedRef.current) {
        markedRef.current = true
        const unread = next.filter((item) => !item.read).map((item) => item.id)
        markNotificationsRead(uid, unread).catch(() => {})
      }
    })
    const un2 = watchShopReports(uid, setReports)
    return () => {
      un1()
      un2()
    }
  }, [uid])

  if (selectedReportId) {
    const report = reports?.find((entry) => entry.id === selectedReportId)
    if (report) {
      return (
        <ReportDetail
          uid={uid}
          report={report}
          onBack={() => setSelectedReportId(null)}
        />
      )
    }
    // The report vanished — fall through to the inbox that carried it.
  }

  const summary = redeemSummary(offers)

  return (
    <div className="biz-notifpage">
      <header className="biz-notifpage-head">
        <h1 className="biz-notifpage-title">Notifications</h1>
        <p className="biz-notifpage-sub">
          Verdicts on your shop and offers, and customer reports from shared
          links.
        </p>
      </header>
      {items === null ? (
        <p className="biz-shopscreen-empty">Loading…</p>
      ) : items.length === 0 && summary === null ? (
        <div className="biz-first biz-notifpage-empty">
          <div className="biz-first-tile biz-notifpage-tile" aria-hidden="true">
            <BellSvg />
          </div>
          <div className="biz-first-main">
            <h2 className="biz-dash-h2">Nothing yet.</h2>
            <p className="biz-dash-body">
              Verdicts on your shop and offers, and customer reports from
              shared links, land here the moment they happen.
            </p>
            <p className="biz-dash-tip">
              New items show up as a red count on the bell.
            </p>
          </div>
        </div>
      ) : (
        <div className="biz-notiflist biz-notiflist-page">
          {summary !== null && (
            <article className="biz-notifcard">
              <span className="biz-notiftile is-gold">
                <TrendSvg />
              </span>
              <span className="biz-notif-main">
                <span className="biz-notif-title">Weekly summary</span>
                <span className="biz-notif-body">{summary}</span>
              </span>
              <span className="biz-notif-when">7d</span>
            </article>
          )}
          {items.map((item) => {
            const tile = KIND_TILE[item.kind] ?? {
              cls: 'pink' as const,
              icon: 'info' as const,
            }
            const inner = (
              <>
                <span className={`biz-notiftile is-${tile.cls}`}>
                  <NotifIcon icon={tile.icon} />
                </span>
                <span className="biz-notif-main">
                  <span className="biz-notif-title">{item.title}</span>
                  {item.body && (
                    <span className="biz-notif-body">{item.body}</span>
                  )}
                </span>
                <span className="biz-notif-when">
                  {relStamp(item.at?.toDate())}
                </span>
              </>
            )
            // Reports are the one actionable kind — tapping opens the report
            // so the shop can respond. Verdicts are informational.
            if (item.kind === 'report') {
              return (
                <button
                  type="button"
                  className="biz-notifcard biz-notifcard-btn"
                  key={item.id}
                  onClick={() => setSelectedReportId(item.id)}
                >
                  {inner}
                </button>
              )
            }
            return (
              <article className="biz-notifcard" key={item.id}>
                {inner}
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}

/* ---- report detail ---- */

function ReportDetail({
  uid,
  report,
  onBack,
}: {
  uid: string
  report: ShopReport
  onBack: () => void
}) {
  const [response, setResponse] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const resolved = report.status === 'resolved'

  async function handleSend(): Promise<void> {
    if (busy || !response) return
    setBusy(true)
    setError('')
    try {
      await respondToReport(uid, report.id, response, note)
    } catch {
      setError("Couldn't send that. Check the connection and try again.")
    }
    setBusy(false)
  }

  return (
    <SubScreen title="Customer report" backTo="notifications" onBack={onBack}>
      <span
        className={`biz-rpt-chip${resolved ? ' is-resolved' : ''}`}
      >{resolved ? 'Resolved' : 'Open'} · reported {relStamp(report.createdAt?.toDate())}</span>
      <h2 className="biz-rpt-headline">“{report.reason}”</h2>
      {report.offerTitle && (
        <p className="biz-rpt-on">On: {report.offerTitle}</p>
      )}
      {report.note && (
        <div className="biz-rpt-wrote">
          <span className="biz-rpt-eyebrow">Customer wrote</span>
          <p>{report.note}</p>
        </div>
      )}
      <p className="biz-rpt-privacy">Customer identity is not shared.</p>

      {resolved ? (
        <div className="biz-rpt-done">
          <h2 className="biz-shopedit-h">Your response</h2>
          <p className="biz-rpt-chosen">{report.response}</p>
          {report.responseNote && (
            <p className="biz-rpt-chosennote">“{report.responseNote}”</p>
          )}
          <p className="biz-rpt-privacy">
            Sent {relStamp(report.respondedAt?.toDate())} — thanks for closing
            the loop.
          </p>
        </div>
      ) : (
        <>
          <h2 className="biz-shopedit-h biz-rpt-resphead">Your response</h2>
          <div
            className="biz-rpt-choices"
            role="radiogroup"
            aria-label="Your response"
          >
            {REPORT_RESPONSES.map((choice) => (
              <label className="biz-rpt-choice" key={choice}>
                <input
                  type="radio"
                  name="report-response"
                  checked={response === choice}
                  onChange={() => setResponse(choice)}
                />
                <span className="biz-rpt-radio" aria-hidden="true" />
                <span className="biz-rpt-choicetext">{choice}</span>
              </label>
            ))}
          </div>
          <textarea
            className="biz-rpt-note"
            value={note}
            maxLength={300}
            placeholder="Optional note to NearZoop"
            onChange={(event) => setNote(event.target.value)}
            aria-label="Optional note to NearZoop"
          />
          {error && <p className="biz-scan-err">{error}</p>}
          <button
            type="button"
            className="btn-danger biz-btn biz-rpt-send"
            disabled={!response || busy}
            onClick={handleSend}
          >
            <SendSvg />
            {busy ? 'Sending…' : 'Send response'}
          </button>
        </>
      )}
    </SubScreen>
  )
}

/* ---- per-kind tiles ---- */

const KIND_TILE: Record<
  ShopNotification['kind'],
  { cls: 'green' | 'pink' | 'amber'; icon: 'check' | 'info' | 'flag' }
> = {
  verified: { cls: 'green', icon: 'check' },
  'offer-approved': { cls: 'green', icon: 'check' },
  'verification-failed': { cls: 'pink', icon: 'info' },
  'offer-changes': { cls: 'pink', icon: 'info' },
  'offer-removed': { cls: 'pink', icon: 'info' },
  report: { cls: 'amber', icon: 'flag' },
}

function NotifIcon({ icon }: { icon: 'check' | 'info' | 'flag' }) {
  if (icon === 'check') return <CheckSvg />
  if (icon === 'flag') return <FlagSvg />
  return <InfoSvg />
}
