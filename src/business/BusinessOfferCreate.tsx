import { useEffect, useRef, useState } from 'react'
import { Map as MLMap, Marker } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import {
  offerDiscountLabel,
  offerTileColor,
  saveOffer,
  type OfferDealKind,
  type OfferRecord,
  type OfferRedeemKind,
  type OfferWrite,
  type ShopRecord,
} from './shop'
import { uploadToImgbb } from './imgbb'
import { nzMapStyle } from './MaplibrePicker'
import { fmtDay, fmtWhen } from './when'

/** The offer builder — four steps plus the sent screen. Lives inside the
    dashboard shell: its own header and pinned action bar on mobile, the
    content column beside the sidebar on desktop. Everything writes to the
    shops/{uid}/offers collection; nothing here is simulated. */

type Props = {
  uid: string
  shop: ShopRecord
  /** Back circle, "Save draft", and "See my offers" — all land on the list. */
  onExit: () => void
  /** "Run it again" — the builder opens prefilled from an earlier offer. */
  initial?: OfferRecord | null
}

type Draft = {
  dealKind: OfferDealKind
  dealValue: string
  dealScope: string
  headline: string
  description: string
  photo0: string
  photo1: string
  redeemKind: OfferRedeemKind
  redeemCode: string
  redeemCustom: string
  /** datetime-local input values; converted to ISO on save. */
  startsAt: string
  endsAt: string
  minBillOn: boolean
  minBill: string
  inStoreOnly: boolean
  newOnly: boolean
  /** One exclusion per line. */
  exclusions: string
  honour: boolean
}

const EMPTY: Draft = {
  dealKind: 'percent',
  dealValue: '',
  dealScope: '',
  headline: '',
  description: '',
  photo0: '',
  photo1: '',
  redeemKind: 'screen',
  redeemCode: '',
  redeemCustom: '',
  startsAt: '',
  endsAt: '',
  minBillOn: false,
  minBill: '',
  inStoreOnly: true,
  newOnly: false,
  exclusions: '',
  honour: false,
}

/** ISO stamp → datetime-local input value, in the device's timezone — the
    exact inverse of the save path's new Date(...).toISOString(). */
function isoToLocalInput(iso?: string): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** "Run it again" — maps a saved offer back into builder draft state. */
function draftFromOffer(offer: OfferRecord): Draft {
  const ended = (offer.status ?? 'live') === 'ended'
  return {
    dealKind: offer.dealKind ?? 'percent',
    dealValue: offer.dealValue ?? '',
    dealScope: offer.dealScope ?? '',
    headline: offer.title ?? '',
    description: offer.description ?? '',
    photo0: offer.photos?.[0] ?? '',
    photo1: offer.photos?.[1] ?? '',
    redeemKind: offer.redeemKind ?? 'screen',
    redeemCode: offer.redeemCode ?? '',
    redeemCustom: offer.redeemCustom ?? '',
    // An ended run's window is history — a repeat needs fresh dates the
    // merchant picks, not a silently expired copy of the old ones.
    startsAt: ended ? '' : isoToLocalInput(offer.startsAt),
    endsAt: ended ? '' : isoToLocalInput(offer.endsAt),
    minBillOn: typeof offer.minBill === 'number' && offer.minBill > 0,
    minBill: offer.minBill ? String(offer.minBill) : '',
    inStoreOnly: offer.inStoreOnly ?? true,
    newOnly: offer.newCustomersOnly ?? false,
    exclusions: (offer.exclusions ?? []).join('\n'),
    honour: false,
  }
}

const DEALS: { kind: OfferDealKind; big: string; small: string }[] = [  { kind: 'percent', big: '20%', small: '% off' },
  { kind: 'flat', big: '₹300', small: '₹ off' },
  { kind: 'bogo', big: 'BOGO', small: 'Buy X get Y' },
  { kind: 'free', big: 'FREE', small: 'Free item' },
  { kind: 'special', big: '₹999', small: 'Special price' },
]

const UNIT: Record<OfferDealKind, string> = {
  percent: '%',
  flat: '₹',
  special: '₹',
  bogo: '',
  free: '',
}

const VALUE_PH: Record<OfferDealKind, string> = {
  percent: '15',
  flat: '300',
  special: '999',
  bogo: 'Buy 1, get 1',
  free: 'fall & pico',
}

const SCOPE_PH: Record<OfferDealKind, string> = {
  percent: 'on silk sarees',
  flat: 'on sarees above ₹2,000',
  special: 'gift box',
  bogo: 'on silk sarees',
  free: 'with any saree',
}

const REDEEM: {
  kind: OfferRedeemKind
  title: string
  sub: string
  icon: 'phone' | 'tag' | 'scan' | 'store'
}[] = [
  {
    kind: 'screen',
    title: 'Customer shows the screen',
    sub: 'Simplest. Staff look at the phone and apply the discount.',
    icon: 'phone',
  },
  {
    kind: 'code',
    title: 'Customer says a code',
    sub: 'You pick a code. Good for billing software.',
    icon: 'tag',
  },
  {
    kind: 'coupon',
    title: 'Customer claims a QR coupon',
    sub: 'Single use. You scan it here — gives you verified redemption counts.',
    icon: 'scan',
  },
  {
    kind: 'custom',
    title: 'Your own process',
    sub: 'Describe it in a sentence.',
    icon: 'store',
  },
]

const STEP_CAPS = [
  'What’s the deal?',
  'How do customers redeem?',
  'When & who',
  'Preview & submit',
]

function BackSvg() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m15 5-7 7 7 7" />
    </svg>
  )
}

function CheckSvg() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m4.5 12.5 5 5 10-11" />
    </svg>
  )
}

function PlusSvg() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

function SendSvg() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M22 2 11 13" />
      <path d="M22 2 15 22l-4-9-9-4 20-7Z" />
    </svg>
  )
}

function BookmarkSvg() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 3h12v18l-6-4.2L6 21V3Z" />
    </svg>
  )
}

function ClockSvg() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  )
}

function TagSvg() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8Z" />
      <circle cx="7.5" cy="7.5" r="1.4" />
    </svg>
  )
}

function PhoneSvg() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="7" y="3" width="10" height="18" rx="2.2" />
      <path d="M10.5 6h3" />
      <circle cx="12" cy="17.5" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  )
}

function QrSvg() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="7" height="7" rx="1.4" />
      <rect x="14" y="3" width="7" height="7" rx="1.4" />
      <rect x="3" y="14" width="7" height="7" rx="1.4" />
      <path d="M14 14h3.5v3.5M21 14v3.5M14 21h3.5" />
    </svg>
  )
}

function TicketSvg() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 9V7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a2 2 0 0 0 0 6v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-6Z" />
      <path d="M13 5.5v2M13 11v2M13 16.5v2" />
    </svg>
  )
}

function StoreSvg() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4.5 9.5 6 4h12l1.5 5.5" />
      <path d="M4.5 9.5a2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0 5 0" />
      <path d="M5.5 12.6V20h13v-7.4" />
      <path d="M9.5 20v-4.5h5V20" />
    </svg>
  )
}

function RedeemIcon({ kind }: { kind: 'phone' | 'tag' | 'scan' | 'store' }) {
  if (kind === 'phone') return <PhoneSvg />
  if (kind === 'tag') return <TagSvg />
  if (kind === 'scan') return <QrSvg />
  return <StoreSvg />
}

/** Non-interactive map preview with the offer's pin — same painted style as
    the location picker, keyless tiles, centred on the shop's saved pin. */
function OfferMapPreview({ lat, lng, label }: { lat: number; lng: number; label: string }) {
  const hostRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    let cancelled = false
    let map: MLMap | null = null

    void (async () => {
      const style = await nzMapStyle()
      if (cancelled) return

      const created = new MLMap({
        container: host,
        style,
        // MapLibre order: [lng, lat].
        center: [lng, lat],
        zoom: 15.5,
        interactive: false,
        attributionControl: false,
      })
      map = created

      const pin = document.createElement('div')
      pin.className = 'biz-map-pin'
      pin.textContent = label
      new Marker({ element: pin, anchor: 'bottom' })
        .setLngLat([lng, lat])
        .addTo(created)
    })()

    return () => {
      cancelled = true
      map?.remove()
    }
  }, [lat, lng, label])

  return (
    <div className="biz-ob-map">
      <div ref={hostRef} className="biz-ob-map-canvas" />
    </div>
  )
}

/** On desktop the dashboard shell is its own scroll pane — reset it too;
    on mobile the page itself scrolls. */
function scrollTop(): void {
  window.scrollTo(0, 0)
  document.querySelector('.biz-dash-shell')?.scrollTo(0, 0)
}

function stepValid(draft: Draft, step: number): boolean {  if (step === 0) {
    if (!draft.headline.trim()) return false
    if (draft.dealKind === 'bogo' || draft.dealKind === 'free') {
      return draft.dealValue.trim().length > 0
    }
    return /^\d+(\.\d+)?$/.test(draft.dealValue.trim()) && Number(draft.dealValue) > 0
  }
  if (step === 1) {
    if (draft.redeemKind === 'code') {
      return /^[A-Za-z0-9]{4,12}$/.test(draft.redeemCode.trim())
    }
    if (draft.redeemKind === 'custom') {
      return draft.redeemCustom.trim().length > 0
    }
    return true
  }
  if (step === 2) {
    if (!draft.startsAt || !draft.endsAt) return false
    const start = new Date(draft.startsAt).getTime()
    const end = new Date(draft.endsAt).getTime()
    return Number.isFinite(start) && Number.isFinite(end) && end > start
  }
  return draft.honour
}

export default function BusinessOfferCreate({
  uid,
  shop,
  onExit,
  initial,
}: Props) {
  const [draft, setDraft] = useState<Draft>(() =>
    initial ? draftFromOffer(initial) : EMPTY,
  )
  const [step, setStep] = useState(0)
  const [sent, setSent] = useState(false)
  const [sentRef, setSentRef] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [photoBusy, setPhotoBusy] = useState<0 | 1 | null>(null)

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }))

  /** Drafts and rejected offers are edited in place — resubmitting keeps the
      same doc (and its history) instead of leaving a stale copy on the list.
      Ended offers are copied into a fresh submission. */
  const editingId =
    initial && (initial.status === 'draft' || initial.status === 'changes')
      ? initial.id
      : undefined

  /** Writes the draft as-is — drafts skip validation on purpose. */
  async function persist(status: 'draft' | 'review', ref?: string): Promise<void> {
    const now = new Date().toISOString()
    const needsValue =
      draft.dealKind === 'percent' ||
      draft.dealKind === 'flat' ||
      draft.dealKind === 'special'
    const label =
      draft.dealValue.trim() || !needsValue
        ? offerDiscountLabel(draft.dealKind, draft.dealValue.trim(), draft.dealScope.trim())
        : ''
    const minBillNumber = Number(draft.minBill.replace(/[^\d.]/g, ''))

    const write: OfferWrite = {
      title: draft.headline.trim(),
      discountLabel: label,
      tileColor: offerTileColor(draft.dealKind),
      dealKind: draft.dealKind,
      dealValue: draft.dealValue.trim(),
      dealScope: draft.dealScope.trim(),
      description: draft.description.trim(),
      photos: [draft.photo0, draft.photo1].filter(Boolean),
      redeemKind: draft.redeemKind,
      redeemCode:
        draft.redeemKind === 'code' ? draft.redeemCode.trim().toUpperCase() : '',
      redeemCustom:
        draft.redeemKind === 'custom' ? draft.redeemCustom.trim() : '',
      startsAt: draft.startsAt ? new Date(draft.startsAt).toISOString() : '',
      endsAt: draft.endsAt ? new Date(draft.endsAt).toISOString() : '',
      status,
      inStoreOnly: draft.inStoreOnly,
      newCustomersOnly: draft.newOnly,
      exclusions: draft.exclusions
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean),
      updatedAt: now,
      createdAt: initial?.createdAt ?? now,
      // A resubmission is a clean slate — the old verdict no longer applies.
      ...(status === 'review' ? { reviewNote: '', reviewFix: '' } : {}),
    }
    if (ref) {
      write.ref = ref
      write.submittedAt = now
    }
    if (draft.minBillOn && Number.isFinite(minBillNumber) && minBillNumber > 0) {
      write.minBill = minBillNumber
    }
    await saveOffer(uid, write, editingId)
  }

  async function handleSaveDraft() {
    setSaving(true)
    setError('')
    try {
      await persist('draft')
      onExit()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save the draft.")
    } finally {
      setSaving(false)
    }
  }

  async function handleSubmit() {
    setSaving(true)
    setError('')
    const ref = `B-${Math.floor(10000 + Math.random() * 90000)}`
    try {
      await persist('review', ref)
      setSentRef(ref)
      setSent(true)
      scrollTop()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't submit. Try again.")
    } finally {
      setSaving(false)
    }
  }

  function handleContinue() {
    if (!stepValid(draft, step) || saving) return
    if (step < 3) {
      setStep(step + 1)
      scrollTop()
    } else {
      void handleSubmit()
    }
  }

  async function pickPhoto(slot: 0 | 1, file: File | undefined) {
    if (!file) return
    setPhotoBusy(slot)
    setError('')
    try {
      const url = await uploadToImgbb(file)
      set(slot === 0 ? 'photo0' : 'photo1', url)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't upload the photo.")
    } finally {
      setPhotoBusy(null)
    }
  }

  function reset() {
    setDraft(EMPTY)
    setStep(0)
    setSent(false)
    setSentRef('')
    setError('')
    scrollTop()
  }

  if (sent) {
    return (
      <section className="biz-sent" aria-live="polite">
        <span className="biz-sent-tile" aria-hidden="true">
          <CheckSvg />
        </span>
        <h1 className="biz-sent-h">Sent for a quick check.</h1>
        <p className="biz-sent-body">
          We review every offer so customers can trust it. Most are approved
          within 2 hours. It goes live at your start time.
        </p>
        <p className="biz-sent-ref">Offer · {sentRef} · Status: in review</p>
        <button type="button" className="btn-primary biz-btn biz-sent-go" onClick={onExit}>
          See my offers
        </button>
        <button type="button" className="biz-linkbtn biz-sent-again" onClick={reset}>
          Create another
        </button>
      </section>
    )
  }

  // --- Step renderers (called as functions — no remount, focus stays) -----

  const renderPhotoSlot = (slot: 0 | 1) => {
    const url = slot === 0 ? draft.photo0 : draft.photo1
    const busy = photoBusy === slot
    return (
      <span
        key={slot}
        className={`biz-photoslot${url ? ' has-photo' : ''}${busy ? ' is-busy' : ''}`}
      >
        {url ? (
          <>
            <img src={url} alt={`Offer photo ${slot + 1}`} />
            <button
              type="button"
              className="biz-photodel"
              aria-label="Remove photo"
              onClick={() => set(slot === 0 ? 'photo0' : 'photo1', '')}
            >
              ×
            </button>
          </>
        ) : (
          <>
            <PlusSvg />
            <span>{busy ? 'Uploading…' : 'Add photo'}</span>
            <input
              type="file"
              accept="image/*"
              className="biz-photopick"
              disabled={busy}
              aria-label={busy ? 'Uploading' : 'Add photo'}
              onChange={(event) => {
                void pickPhoto(slot, event.target.files?.[0])
                event.target.value = ''
              }}
            />
          </>
        )}
      </span>
    )
  }

  const renderDeal = () => (
    <div className="biz-ob-cols">
      <div className="biz-ob-col">
        <label className="biz-label biz-field">Offer type</label>
        <div className="biz-dealgrid" role="radiogroup" aria-label="Offer type">
          {DEALS.map((deal) => (
            <button
              key={deal.kind}
              type="button"
              className={`biz-dealtile${draft.dealKind === deal.kind ? ' is-on' : ''}`}
              aria-pressed={draft.dealKind === deal.kind}
              onClick={() => set('dealKind', deal.kind)}
            >
              <span className="biz-dealtile-big">{deal.big}</span>
              <span className="biz-dealtile-small">{deal.small}</span>
            </button>
          ))}
        </div>

        <label className="biz-label biz-field" htmlFor="ob-deal-value">
          Discount
        </label>
        <div className="biz-duo biz-duo-deal">
          <div className="biz-inputrow">
            <input
              id="ob-deal-value"
              className="biz-input-plain"
              inputMode={UNIT[draft.dealKind] ? 'decimal' : 'text'}
              value={draft.dealValue}
              placeholder={VALUE_PH[draft.dealKind]}
              onChange={(event) => set('dealValue', event.target.value)}
            />
            {UNIT[draft.dealKind] && (
              <span className="biz-unit" aria-hidden="true">
                {UNIT[draft.dealKind]}
              </span>
            )}
          </div>
          <div className="biz-inputrow">
            <input
              className="biz-input-plain"
              value={draft.dealScope}
              placeholder={SCOPE_PH[draft.dealKind]}
              aria-label="What the discount applies to"
              onChange={(event) => set('dealScope', event.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="biz-ob-col">
        <label className="biz-label biz-field" htmlFor="ob-headline">
          Headline
        </label>
        <input
          id="ob-headline"
          className="biz-input"
          value={draft.headline}
          maxLength={60}
          placeholder="Kali Puja & Diwali — 15% off silk"
          onChange={(event) => set('headline', event.target.value)}
        />
        <p className="biz-hint">
          Be specific. Say what’s discounted and by how much.{' '}
          {draft.headline.length}/60
        </p>

        <label className="biz-label biz-field" htmlFor="ob-desc">
          Description (optional)
        </label>
        <textarea
          id="ob-desc"
          className="biz-input biz-textarea"
          value={draft.description}
          maxLength={280}
          placeholder="15% off all silk sarees including Murshidabad and Bishnupuri silk. Valid in-store."
          onChange={(event) => set('description', event.target.value)}
        />

        <span className="biz-label biz-field">Photo (optional)</span>
        <div className="biz-photoduo">{renderPhotoSlot(0)}{renderPhotoSlot(1)}</div>
      </div>
    </div>
  )

  const renderRedeem = () => (
    <div className="biz-ob-narrow">
      <div className="biz-redlist" role="radiogroup" aria-label="How customers redeem">
        {REDEEM.map((option) => (
          <button
            key={option.kind}
            type="button"
            className={`biz-redcard${draft.redeemKind === option.kind ? ' is-on' : ''}`}
            aria-pressed={draft.redeemKind === option.kind}
            onClick={() => set('redeemKind', option.kind)}
          >
            <span className="biz-redradio" aria-hidden="true" />
            <span className="biz-redicon" aria-hidden="true">
              <RedeemIcon kind={option.icon} />
            </span>
            <span className="biz-redmain">
              <span className="biz-redtitle">{option.title}</span>
              <span className="biz-redsub">{option.sub}</span>
            </span>
          </button>
        ))}
      </div>

      {draft.redeemKind === 'code' && (
        <>
          <label className="biz-label biz-field" htmlFor="ob-code">
            Code
          </label>
          <input
            id="ob-code"
            className="biz-input"
            value={draft.redeemCode}
            maxLength={12}
            placeholder="DIWALI15"
            onChange={(event) => set('redeemCode', event.target.value.toUpperCase())}
          />
          <p className="biz-hint">Letters and numbers, 4–12 characters.</p>
        </>
      )}
      {draft.redeemKind === 'custom' && (
        <>
          <label className="biz-label biz-field" htmlFor="ob-custom">
            How it works
          </label>
          <textarea
            id="ob-custom"
            className="biz-input biz-textarea"
            value={draft.redeemCustom}
            maxLength={140}
            placeholder="Tell staff the code word at the counter."
            onChange={(event) => set('redeemCustom', event.target.value)}
          />
          <p className="biz-hint">One sentence. Customers see this on the offer.</p>
        </>
      )}
    </div>
  )

  const renderWhen = () => (
    <div className="biz-ob-narrow">
      <div className="biz-duo biz-field">
        <div className="biz-duo-cell">
          <label className="biz-label" htmlFor="ob-starts">
            Starts
          </label>
          <div className="biz-inputrow">
            <ClockSvg />
            <input
              id="ob-starts"
              type="datetime-local"
              className="biz-input-plain"
              value={draft.startsAt}
              onChange={(event) => set('startsAt', event.target.value)}
            />
          </div>
        </div>
        <div className="biz-duo-cell">
          <label className="biz-label" htmlFor="ob-ends">
            Ends
          </label>
          <div className="biz-inputrow">
            <ClockSvg />
            <input
              id="ob-ends"
              type="datetime-local"
              className="biz-input-plain"
              value={draft.endsAt}
              onChange={(event) => set('endsAt', event.target.value)}
            />
          </div>
        </div>
      </div>
      <p className="biz-hint">
        Offers disappear from the app automatically at the end time.
      </p>

      <span className="biz-label biz-field">Who can use it</span>
      <div className="biz-optlist">
        <div className="biz-optrow">
          <button
            type="button"
            className={`biz-optbox${draft.minBillOn ? ' is-on' : ''}`}
            role="checkbox"
            aria-checked={draft.minBillOn}
            aria-label="Minimum bill"
            onClick={() => set('minBillOn', !draft.minBillOn)}
          >
            {draft.minBillOn && <CheckSvg />}
          </button>
          <span className="biz-optlabel">Minimum bill</span>
          {draft.minBillOn && (
            <div className="biz-inputrow biz-optinput">
              <input
                className="biz-input-plain"
                inputMode="decimal"
                value={draft.minBill}
                placeholder="1,500"
                aria-label="Minimum bill amount in rupees"
                onChange={(event) => set('minBill', event.target.value)}
              />
            </div>
          )}
        </div>
        <div className="biz-optrow">
          <button
            type="button"
            className={`biz-optbox${draft.inStoreOnly ? ' is-on' : ''}`}
            role="checkbox"
            aria-checked={draft.inStoreOnly}
            aria-label="In-store only"
            onClick={() => set('inStoreOnly', !draft.inStoreOnly)}
          >
            {draft.inStoreOnly && <CheckSvg />}
          </button>
          <span className="biz-optlabel">In-store only</span>
        </div>
        <div className="biz-optrow">
          <button
            type="button"
            className={`biz-optbox${draft.newOnly ? ' is-on' : ''}`}
            role="checkbox"
            aria-checked={draft.newOnly}
            aria-label="New customers only"
            onClick={() => set('newOnly', !draft.newOnly)}
          >
            {draft.newOnly && <CheckSvg />}
          </button>
          <span className="biz-optlabel">New customers only</span>
        </div>
      </div>

      <label className="biz-label biz-field" htmlFor="ob-exclusions">
        Not included
      </label>
      <textarea
        id="ob-exclusions"
        className="biz-input biz-textarea"
        value={draft.exclusions}
        placeholder={'Not on bridal Banarasi range\nNo exchange on discounted items'}
        onChange={(event) => set('exclusions', event.target.value)}
      />
      <p className="biz-hint">One per line. Customers see these clearly before visiting.</p>
    </div>
  )

  const renderPreview = () => {
    const label = offerDiscountLabel(
      draft.dealKind,
      draft.dealValue.trim(),
      draft.dealScope.trim(),
    )
    const splitAt = label.indexOf(' ')
    const tileBig = splitAt === -1 ? label : label.slice(0, splitAt)
    const tileSmall = splitAt === -1 ? '' : label.slice(splitAt + 1)
    const tileColor = offerTileColor(draft.dealKind)

    const redeemSummary =
      draft.redeemKind === 'code'
        ? `Customer says code ${draft.redeemCode.trim().toUpperCase()}`
        : draft.redeemKind === 'custom'
          ? draft.redeemCustom.trim()
          : draft.redeemKind === 'coupon'
            ? 'Customer claims a QR coupon'
            : 'Customer shows the screen'

    const runsSummary =
      draft.startsAt && draft.endsAt
        ? `${fmtWhen(draft.startsAt)} → ${fmtWhen(draft.endsAt)}`
        : 'Not scheduled'

    const termsParts: string[] = []
    if (draft.minBillOn && draft.minBill.trim()) {
      termsParts.push(`Min. bill ₹${draft.minBill.trim()}`)
    }
    if (draft.inStoreOnly) termsParts.push('In-store')
    if (draft.newOnly) termsParts.push('New customers only')
    const exclusionCount = draft.exclusions
      .split('\n')
      .filter((line) => line.trim())
      .length
    if (exclusionCount > 0) {
      termsParts.push(
        `${exclusionCount} ${exclusionCount === 1 ? 'exclusion' : 'exclusions'}`,
      )
    }

    return (
      <>
        <div className="biz-pv-duo">
          <div>
            <p className="biz-ob-cap">How customers see it in the list</p>
            <div className="biz-pv-card">
              <span className={`biz-otile biz-otile-${tileColor}`} aria-hidden="true">
                <span className="biz-otile-big">{tileBig}</span>
                <span className="biz-otile-small">{tileSmall}</span>
              </span>
              <span className="biz-pv-main">
                <span className="biz-pv-title">
                  {draft.headline.trim() || 'Untitled offer'}
                </span>
                <span className="biz-pv-shop">
                  <StoreSvg /> {shop.name || 'Your shop'}
                </span>
                {draft.endsAt && (
                  <span className="biz-pv-chips">
                    <span className="biz-pv-chip">
                      <ClockSvg /> Ends {fmtDay(draft.endsAt)}
                    </span>
                  </span>
                )}
              </span>
              <span className="biz-pv-mark" aria-hidden="true">
                <BookmarkSvg />
              </span>
            </div>
          </div>

          <div>
            <p className="biz-ob-cap">On the map</p>
            {shop.lat != null && shop.lng != null ? (
              <OfferMapPreview lat={shop.lat} lng={shop.lng} label={tileBig} />
            ) : (
              <p className="biz-hint">
                Set your shop location to preview the map pin.
              </p>
            )}
          </div>
        </div>

        <div className="biz-sumcard">
          <div className="biz-sumrow">
            <div>
              <p className="biz-sumlabel">Redeem</p>
              <p className="biz-sumvalue">{redeemSummary}</p>
            </div>
            <button type="button" className="biz-sumedit" onClick={() => setStep(1)}>
              Edit
            </button>
          </div>
          <div className="biz-sumrow">
            <div>
              <p className="biz-sumlabel">Runs</p>
              <p className="biz-sumvalue">{runsSummary}</p>
            </div>
            <button type="button" className="biz-sumedit" onClick={() => setStep(2)}>
              Edit
            </button>
          </div>
          <div className="biz-sumrow">
            <div>
              <p className="biz-sumlabel">Terms</p>
              <p className="biz-sumvalue">
                {termsParts.length > 0 ? termsParts.join(' · ') : 'No extra terms'}
              </p>
            </div>
            <button type="button" className="biz-sumedit" onClick={() => setStep(2)}>
              Edit
            </button>
          </div>
        </div>

        <div className="biz-honour">
          <button
            type="button"
            className={`biz-optbox${draft.honour ? ' is-on' : ''}`}
            role="checkbox"
            aria-checked={draft.honour}
            aria-label="I'll honour this offer as written"
            onClick={() => set('honour', !draft.honour)}
          >
            {draft.honour && <CheckSvg />}
          </button>
          <p>
            I’ll honour this offer as written until the end time, or end it
            early from the app.
          </p>
        </div>
      </>
    )
  }

  return (
    <section className="biz-ob">
      <header className="biz-ob-top">
        <button
          type="button"
          className="biz-ob-back"
          aria-label="Back to my offers"
          onClick={onExit}
        >
          <BackSvg />
        </button>
        <h1 className="biz-ob-title">New offer</h1>
        {step < 3 && (
          <button
            type="button"
            className="biz-ob-savedraft"
            onClick={() => void handleSaveDraft()}
            disabled={saving}
          >
            Save draft
          </button>
        )}
      </header>

      <div className="biz-progress" aria-hidden="true">
        {[0, 1, 2, 3].map((segment) => (
          <span
            key={segment}
            className={`biz-seg${segment <= step ? ' is-done' : ''}`}
          />
        ))}
      </div>
      <p className="biz-stepcap">
        Step {step + 1} of 4 · {STEP_CAPS[step]}
      </p>

      {error && <p className="biz-ob-error" role="alert">{error}</p>}

      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          handleContinue()
        }}
      >
        {step === 0 && renderDeal()}
        {step === 1 && renderRedeem()}
        {step === 2 && renderWhen()}
        {step === 3 && renderPreview()}

        <div className="biz-ob-foot">
          {step > 0 && (
            <button
              type="button"
              className="btn-secondary biz-btn biz-ob-backbtn"
              onClick={() => {
                setStep(step - 1)
                scrollTop()
              }}
            >
              Back
            </button>
          )}
          <button
            type="submit"
            className="btn-primary biz-btn biz-ob-go"
            disabled={!stepValid(draft, step) || saving}
          >
            {step === 0 && 'Next: redemption'}
            {step === 1 && 'Next: dates & terms'}
            {step === 2 && 'Preview'}
            {step === 3 && (saving ? 'Submitting…' : <><SendSvg /> Submit for review</>)}
          </button>
        </div>
      </form>
    </section>
  )
}
