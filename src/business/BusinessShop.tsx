import { useState, type ChangeEvent } from 'react'
import {
  saveShop,
  type DayHours,
  type OpeningHours,
  type ShopRecord,
} from './shop'
import { uploadToImgbb } from './imgbb'
import { validateHours } from './BusinessSetup'

/** The Shop screen — the merchant's public profile plus the settings that
    are real today: opening hours and the holiday switch. The notification
    inbox is a dashboard view of its own (BusinessNotifications); this
    page's row is a shortcut into it. "Edit shop page" opens the editor
    mode below, which writes through saveShop; a name change on a verified
    shop drops it back to pending, exactly as the helper line promises. */

type Props = {
  uid: string
  shop: ShopRecord
  /** Unread inbox count — the dashboard owns the subscription. */
  unread: number | null
  /** Opens the dashboard's Notifications view. */
  onOpenInbox: () => void
}

type Mode = 'overview' | 'edit'

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

/* ---- the screen ---- */

export default function BusinessShop({
  uid,
  shop,
  unread,
  onOpenInbox,
}: Props) {
  const [mode, setMode] = useState<Mode>('overview')
  const [toggleError, setToggleError] = useState('')

  if (mode === 'edit') {
    return <ShopEdit uid={uid} shop={shop} onDone={() => setMode('overview')} />
  }

  const open = openNow(shop.openingHours)

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
        </div>
        {toggleError && <p className="biz-scan-err">{toggleError}</p>}

        <h2 className="biz-shop-h2">Account</h2>
        <div className="biz-detailcard biz-shopcard">
          <button
            type="button"
            className="biz-shoprow"
            onClick={onOpenInbox}
          >
            <span className="biz-shoprow-icon">
              <BellSvg />
            </span>
            <span className="biz-shoprow-main">
              <span className="biz-shoprow-title">Notifications</span>
              <span className="biz-shoprow-sub">
                {unread === null
                  ? '…'
                  : unread > 0
                    ? `${unread} new`
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
    <div className={`biz-hourrow${closed ? ' is-closed' : ''}`}>
      <div className="biz-hourrow-top">
        <span className="biz-hourrow-day">{label}</span>
        <Switch
          checked={!closed}
          label={`${label} open`}
          onChange={(next) =>
            onChange(next ? (times ?? { opens: '', closes: '' }) : 'closed')
          }
        />
      </div>
      <div className="biz-hourrow-body">
        {closed ? (
          <span className="biz-hourrow-closedlabel">Closed all day</span>
        ) : (
          <>
            <label className="biz-hourfield">
              <span className="biz-hourfield-cap">Opens</span>
              <input
                type="time"
                className="biz-timeinput"
                value={times?.opens ?? ''}
                onChange={(event) =>
                  onChange({
                    opens: event.target.value,
                    closes: times?.closes ?? '',
                  })
                }
              />
            </label>
            <label className="biz-hourfield">
              <span className="biz-hourfield-cap">Closes</span>
              <input
                type="time"
                className="biz-timeinput"
                value={times?.closes ?? ''}
                onChange={(event) =>
                  onChange({
                    opens: times?.opens ?? '',
                    closes: event.target.value,
                  })
                }
              />
            </label>
          </>
        )}
      </div>
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

