import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import {
  saveShop,
  watchShopReports,
  respondToReport,
  watchShopNotifications,
  markNotificationsRead,
  REPORT_RESPONSES,
  type DayHours,
  type OpeningHours,
  type OfferRecord,
  type ShopRecord,
  type ShopReport,
  type ShopNotification,
} from './shop'
import { uploadToImgbb } from './imgbb'
import { validateHours } from './BusinessSetup'

/** The Shop screen — the merchant's public profile plus the settings that
    are real today: opening hours, the holiday switch, customer reports
    (filed from shared offer links, answered here), and the notification
    inbox that admin verdicts and new reports write to. "Edit shop page"
    opens the editor mode below, which writes through saveShop; a name
    change on a verified shop drops it back to pending, exactly as the
    helper line promises. */

type Props = {
  uid: string
  shop: ShopRecord
  offers: OfferRecord[]
}

type Mode = 'overview' | 'edit' | 'reports' | 'report' | 'notifications'

/* ---- shared bits ---- */

function ChevronSvg() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m9 5 7 7-7 7" />
    </svg>
  )
}

function PencilSvg() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m16.5 3.5 4 4L7 21H3v-4L16.5 3.5Z" />
    </svg>
  )
}

function ShieldSvg() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3 5 6v5c0 4.4 3 8.4 7 10 4-1.6 7-5.6 7-10V6l-7-3Z" />
      <path d="m9 12 2 2 4-4.5" />
    </svg>
  )
}

function ClockSvg() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  )
}

function CalendarSvg() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3.5" y="5" width="17" height="16" rx="2.5" />
      <path d="M3.5 10h17M8 2.5V6M16 2.5V6" />
    </svg>
  )
}

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

/** Pill switch — green when on, pale when off, per the design. */
function Switch({
  checked,
  label,
  onChange,
}: {
  checked: boolean
  label: string
  onChange: (next: boolean) => void
}) {
  return (
    <label className="biz-switch">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        aria-label={label}
      />
      <span className="biz-switch-track" aria-hidden="true" />
    </label>
  )
}

/** Shared sub-screen frame: back circle, title, scrollable body. */
function SubScreen({
  title,
  onBack,
  children,
}: {
  title: string
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
          aria-label={`Back to shop page`}
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

/* ---- hours helpers ---- */

/** "10:30" → "10:30 AM", "21:00" → "9 PM". */
function fmtTime(time: string): string {
  const [rawH, rawM] = time.split(':')
  const hours = Number(rawH)
  const minutes = Number(rawM || 0)
  if (Number.isNaN(hours)) return '—'
  const suffix = hours >= 12 ? 'PM' : 'AM'
  const h12 = hours % 12 === 0 ? 12 : hours % 12
  return minutes === 0
    ? `${h12} ${suffix}`
    : `${h12}:${String(minutes).padStart(2, '0')} ${suffix}`
}

function groupSummary(value: DayHours): string {
  if (value === 'closed') return 'closed'
  if (!value || !value.opens || !value.closes) return 'not set'
  return `${fmtTime(value.opens)} – ${fmtTime(value.closes)}`
}

/** "Mon–Sat 10:30 AM – 9:00 PM · Sun 11 AM – 7 PM" — the design's line. */
function hoursSummary(hours: OpeningHours | null | undefined): string {
  if (!hours) return 'Not set yet'
  const hasMonSat = hours.monSat !== null
  const hasSunday = hours.sunday !== null
  if (!hasMonSat && !hasSunday) return 'Not set yet'
  const parts: string[] = []
  if (hasMonSat) parts.push(`Mon–Sat ${groupSummary(hours.monSat)}`)
  if (hasSunday) parts.push(`Sun ${groupSummary(hours.sunday)}`)
  return parts.join(' · ')
}

/** Whether the doors are open right now, from the saved schedule. Null
    when no hours are set — the chip stays off the hero rather than
    guessing. */
function openNow(hours: OpeningHours | null | undefined): 'open' | 'closed' | null {
  if (!hours) return null
  const slot = new Date().getDay() === 0 ? hours.sunday : hours.monSat
  if (!slot) return null
  if (slot === 'closed') return 'closed'
  if (!slot.opens || !slot.closes) return null
  const toMinutes = (time: string) => {
    const [h, m] = time.split(':').map(Number)
    return (h || 0) * 60 + (m || 0)
  }
  const now = new Date()
  const minutes = now.getHours() * 60 + now.getMinutes()
  return minutes >= toMinutes(slot.opens) && minutes < toMinutes(slot.closes)
    ? 'open'
    : 'closed'
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

/* ---- the screen ---- */

export default function BusinessShop({ uid, shop, offers }: Props) {
  const [mode, setMode] = useState<Mode>('overview')
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null)
  const [toggleError, setToggleError] = useState('')
  // Row counts for the overview — live subscriptions for reports and the
  // notification inbox. The same streams feed the sub-screens.
  const [reports, setReports] = useState<ShopReport[] | null>(null)
  const [notifications, setNotifications] = useState<ShopNotification[] | null>(
    null,
  )

  useEffect(() => {
    const un2 = watchShopReports(uid, setReports)
    const un3 = watchShopNotifications(uid, setNotifications)
    return () => {
      un2()
      un3()
    }
  }, [uid])

  if (mode === 'edit') {
    return <ShopEdit uid={uid} shop={shop} onDone={() => setMode('overview')} />
  }
  if (mode === 'notifications') {
    return (
      <NotificationsScreen
        uid={uid}
        offers={offers}
        onBack={() => setMode('overview')}
      />
    )
  }
  if (mode === 'report') {
    const report = reports?.find((entry) => entry.id === selectedReportId)
    if (report) {
      return (
        <ReportDetail
          uid={uid}
          report={report}
          onBack={() => {
            setSelectedReportId(null)
            setMode('reports')
          }}
        />
      )
    }
    // The report vanished — settle for the list.
  }
  return (
    <ReportsScreen
      reports={reports}
      onBack={() => setMode('overview')}
      onOpen={(id) => {
        setSelectedReportId(id)
        setMode('report')
      }}
    />
  )

  const open = openNow(shop.openingHours)
  const openReports = reports?.filter((report) => report.status === 'open')
  const unread = notifications?.filter((item) => !item.read)

  return (
    <div className="biz-shop">
      <section className="biz-shophero">
        <div className="biz-shophero-photo">
          {shop.shopPhotoUrl ? (
            <img src={shop.shopPhotoUrl} alt="" />
          ) : (
            <span className="biz-shophero-tag">shop front photo</span>
          )}
        </div>
        <div className="biz-shophero-body">
          <div className="biz-shophero-chips">
            {shop.category && (
              <span className="biz-ochip biz-shopchip-cat">{shop.category}</span>
            )}
            {shop.verification === 'verified' && (
              <span className="biz-ochip biz-shopchip-verified">
                <ShieldSvg />
                Verified
              </span>
            )}
            {open === 'open' && (
              <span className="biz-ochip biz-shopchip-open">Open now</span>
            )}
            {open === 'closed' && (
              <span className="biz-ochip biz-ochip-gray">Closed now</span>
            )}
          </div>
          <h1 className="biz-shophero-name">{shop.name || 'Your shop'}</h1>
          {shop.address && (
            <p className="biz-shophero-addr">{shop.address}</p>
          )}
          <button
            type="button"
            className="btn-secondary biz-btn biz-shophero-edit"
            onClick={() => setMode('edit')}
          >
            <PencilSvg />
            Edit shop page
          </button>
        </div>
      </section>

      <div className="biz-shop-side">
        <h2 className="biz-shop-h2">Shop</h2>
        <div className="biz-detailcard biz-shopcard">
          <button
            type="button"
            className="biz-shoprow"
            onClick={() => setMode('edit')}
          >
            <span className="biz-shoprow-icon">
              <ClockSvg />
            </span>
            <span className="biz-shoprow-main">
              <span className="biz-shoprow-title">Opening hours</span>
              <span className="biz-shoprow-sub">
                {hoursSummary(shop.openingHours)}
              </span>
            </span>
            <ChevronSvg />
          </button>
          <div className="biz-shoprow">
            <span className="biz-shoprow-icon">
              <CalendarSvg />
            </span>
            <span className="biz-shoprow-main">
              <span className="biz-shoprow-title">Holiday / closed today</span>
              <span className="biz-shoprow-sub">
                Temporarily hide your offers
              </span>
            </span>
            <Switch
              checked={shop.holidayMode === true}
              label="Holiday — closed today"
              onChange={(next) => {
                setToggleError('')
                saveShop(uid, { holidayMode: next }).catch(() => {
                  setToggleError("Couldn't save that. Check the connection.")
                })
              }}
            />
          </div>
          <button
            type="button"
            className="biz-shoprow"
            onClick={() => setMode('reports')}
          >
            <span className="biz-shoprow-icon">
              <FlagSvg />
            </span>
            <span className="biz-shoprow-main">
              <span className="biz-shoprow-title">Customer reports</span>
              <span className="biz-shoprow-sub">
                {reports === null
                  ? '…'
                  : openReports && openReports.length > 0
                    ? `${openReports.length} open`
                    : 'Nothing open'}
              </span>
            </span>
            <ChevronSvg />
          </button>
        </div>
        {toggleError && <p className="biz-scan-err">{toggleError}</p>}

        <h2 className="biz-shop-h2">Account</h2>
        <div className="biz-detailcard biz-shopcard">
          <button
            type="button"
            className="biz-shoprow"
            onClick={() => setMode('notifications')}
          >
            <span className="biz-shoprow-icon">
              <BellSvg />
            </span>
            <span className="biz-shoprow-main">
              <span className="biz-shoprow-title">Notifications</span>
              <span className="biz-shoprow-sub">
                {notifications === null
                  ? '…'
                  : unread && unread.length > 0
                    ? `${unread.length} new`
                    : 'You’re all caught up'}
              </span>
            </span>
            <ChevronSvg />
          </button>
        </div>
      </div>
    </div>
  )
}

/* ---- editor mode ---- */

function HourRow({
  label,
  value,
  onChange,
}: {
  label: string
  value: DayHours
  onChange: (value: DayHours) => void
}) {
  const closed = value === 'closed'
  const times = value !== null && value !== 'closed' ? value : null
  return (
    <div className="biz-hourrow">
      <span className="biz-hourrow-day">{label}</span>
      <span className="biz-hourrow-times">
        <input
          type="time"
          className="biz-timeinput"
          aria-label={`${label} opening time`}
          value={times?.opens ?? ''}
          disabled={closed}
          onChange={(event) =>
            onChange({
              opens: event.target.value,
              closes: times?.closes ?? '',
            })
          }
        />
        <span className="biz-hourrow-dash" aria-hidden="true">
          –
        </span>
        <input
          type="time"
          className="biz-timeinput"
          aria-label={`${label} closing time`}
          value={times?.closes ?? ''}
          disabled={closed}
          onChange={(event) =>
            onChange({
              opens: times?.opens ?? '',
              closes: event.target.value,
            })
          }
        />
      </span>
      <Switch
        checked={!closed}
        label={`${label} open`}
        onChange={(next) =>
          onChange(next ? (times ?? { opens: '', closes: '' }) : 'closed')
        }
      />
    </div>
  )
}

function ShopEdit({
  uid,
  shop,
  onDone,
}: {
  uid: string
  shop: ShopRecord
  onDone: () => void
}) {
  const [name, setName] = useState(shop.name ?? '')
  const [phone, setPhone] = useState(shop.customerPhone ?? '')
  const [hours, setHours] = useState<OpeningHours>(
    shop.openingHours ?? { monSat: null, sunday: null },
  )
  const [staged, setStaged] = useState<File | string | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const shown = preview ?? shop.shopPhotoUrl ?? null

  function pickPhoto(event: ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setStaged(file)
    setPreview(URL.createObjectURL(file))
  }

  async function handleSave(): Promise<void> {
    if (saving) return
    const trimmedName = name.trim()
    if (!trimmedName) {
      setError('The shop needs a name.')
      return
    }
    const hoursError = validateHours(hours)
    if (hoursError) {
      setError(hoursError)
      return
    }
    setSaving(true)
    setError('')
    try {
      let photoUrl = shop.shopPhotoUrl ?? null
      if (staged) photoUrl = await uploadToImgbb(staged)
      // A verified shop that changes its name goes back to pending — the
      // admin re-checks the signboard against the new name.
      const nameChanged = trimmedName !== (shop.name ?? '')
      await saveShop(uid, {
        name: trimmedName,
        customerPhone: phone.trim(),
        shopPhotoUrl: photoUrl,
        openingHours:
          hours.monSat === null && hours.sunday === null ? null : hours,
        ...(nameChanged && shop.verification === 'verified'
          ? { verification: 'pending' as const }
          : {}),
      })
      onDone()
    } catch {
      setError("Couldn't save. Check the connection and try again.")
    }
    setSaving(false)
  }

  return (
    <div className="biz-shopedit">
      <header className="biz-shopedit-head">
        <button
          type="button"
          className="biz-shopedit-back"
          onClick={onDone}
          aria-label="Back to shop page"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m15 5-7 7 7 7" />
          </svg>
        </button>
        <h1>Edit shop page</h1>
      </header>

      <section className="biz-shopedit-sec biz-sec-photos">
        <h2 className="biz-shopedit-h">Photos</h2>
        <div className="biz-shopedit-photos">
          <label className={`biz-photobox${saving ? ' is-busy' : ''}`}>
            {shown && <img src={shown} alt="" />}
            <span className="biz-phototag">{shown ? 'tap to change' : 'front'}</span>
            <input
              className="biz-photoinput"
              type="file"
              accept="image/*"
              aria-label="Shop front photo"
              disabled={saving}
              onChange={pickPhoto}
            />
          </label>
        </div>
      </section>

      <section className="biz-shopedit-sec biz-sec-name">
        <h2 className="biz-shopedit-h">Shop name</h2>
        <input
          className="biz-input"
          value={name}
          maxLength={60}
          onChange={(event) => setName(event.target.value)}
          aria-label="Shop name"
        />
        <p className="biz-shopedit-note">
          Changing your name sends it for re-verification.
        </p>
      </section>

      <section className="biz-shopedit-sec biz-sec-phone">
        <h2 className="biz-shopedit-h">Customer phone</h2>
        <input
          className="biz-input"
          value={phone}
          inputMode="tel"
          maxLength={18}
          onChange={(event) => setPhone(event.target.value)}
          aria-label="Customer phone"
        />
      </section>

      <section className="biz-shopedit-sec biz-sec-hours">
        <h2 className="biz-shopedit-h">Opening hours</h2>
        <div className="biz-detailcard biz-hourcard">
          <HourRow
            label="Mon – Sat"
            value={hours.monSat}
            onChange={(value) => setHours({ ...hours, monSat: value })}
          />
          <div className="biz-hoursep" />
          <HourRow
            label="Sunday"
            value={hours.sunday}
            onChange={(value) => setHours({ ...hours, sunday: value })}
          />
        </div>
      </section>

      {error && <p className="biz-scan-err">{error}</p>}
      <button
        type="button"
        className="btn-danger biz-btn biz-shopedit-save"
        onClick={handleSave}
        disabled={saving}
      >
        {saving ? 'Saving…' : 'Save'}
      </button>
    </div>
  )
}

/* ---- reports mode ---- */

function ReportsScreen({
  reports,
  onBack,
  onOpen,
}: {
  reports: ShopReport[] | null
  onBack: () => void
  onOpen: (id: string) => void
}) {
  const open = reports?.filter((report) => report.status === 'open') ?? []
  const resolved = reports?.filter((report) => report.status === 'resolved') ?? []

  return (
    <SubScreen title="Customer reports" onBack={onBack}>
      <p className="biz-shopscreen-intro">
        What customers flag from a shared offer link. Opening one lets you
        respond — the customer is never messaged back.
      </p>
      {reports === null ? (
        <p className="biz-shopscreen-empty">Loading…</p>
      ) : reports.length === 0 ? (
        <div className="biz-detailcard biz-shopcard">
          <p className="biz-shopscreen-empty">
            No reports — nothing to fix right now.
          </p>
        </div>
      ) : (
        <>
          {open.length > 0 && (
            <>
              <h2 className="biz-shopedit-h">Open</h2>
              <div className="biz-detailcard biz-shopcard">
                {open.map((report) => (
                  <button
                    type="button"
                    className="biz-report"
                    key={report.id}
                    onClick={() => onOpen(report.id)}
                  >
                    <div className="biz-report-main">
                      <span className="biz-report-offer">
                        {report.offerTitle ?? 'An offer'}
                      </span>
                      <span className="biz-report-reason">
                        “{report.reason}”
                      </span>
                      <span className="biz-report-stamp">
                        Open · {relStamp(report.createdAt?.toDate())}
                      </span>
                    </div>
                    <ChevronSvg />
                  </button>
                ))}
              </div>
            </>
          )}
          {resolved.length > 0 && (
            <>
              <h2 className="biz-shopedit-h">Resolved</h2>
              <div className="biz-detailcard biz-shopcard">
                {resolved.map((report) => (
                  <button
                    type="button"
                    className="biz-report"
                    key={report.id}
                    onClick={() => onOpen(report.id)}
                  >
                    <div className="biz-report-main">
                      <span className="biz-report-offer">
                        {report.offerTitle ?? 'An offer'}
                      </span>
                      <span className="biz-report-reason">
                        “{report.reason}”
                      </span>
                      <span className="biz-report-stamp">
                        Resolved · {relStamp(report.createdAt?.toDate())}
                      </span>
                    </div>
                    <ChevronSvg />
                  </button>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </SubScreen>
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
    <SubScreen title="Customer report" onBack={onBack}>
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

/* ---- notifications mode ---- */

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

function NotificationsScreen({
  uid,
  offers,
  onBack,
}: {
  uid: string
  offers: OfferRecord[]
  onBack: () => void
}) {
  const [items, setItems] = useState<ShopNotification[] | null>(null)
  // Opening the inbox clears the "new" badges — once, on the first
  // snapshot, so later arrivals keep their dot until the next visit.
  const markedRef = useRef(false)

  useEffect(
    () =>
      watchShopNotifications(uid, (next) => {
        setItems(next)
        if (!markedRef.current) {
          markedRef.current = true
          const unread = next.filter((item) => !item.read).map((item) => item.id)
          markNotificationsRead(uid, unread).catch(() => {})
        }
      }),
    [uid],
  )

  const summary = redeemSummary(offers)

  return (
    <SubScreen title="Notifications" onBack={onBack}>
      {items === null ? (
        <p className="biz-shopscreen-empty">Loading…</p>
      ) : items.length === 0 && summary === null ? (
        <div className="biz-detailcard biz-shopcard">
          <p className="biz-shopscreen-empty">
            You’re all caught up — verdicts on your shop and offers land here.
          </p>
        </div>
      ) : (
        <div className="biz-notiflist">
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
            return (
              <article className="biz-notifcard" key={item.id}>
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
              </article>
            )
          })}
        </div>
      )}
    </SubScreen>
  )
}
