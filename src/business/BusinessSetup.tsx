import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from 'react'
import ImageCropDialog from './ImageCropDialog'
import LocationPicker, { type LocationFix } from './LocationPicker'
import { verifyGstin } from './gstin'
import { uploadToImgbb } from './imgbb'
import { loadCheckout, razorpayKeyId } from './razorpay'
import type { DayHours, OpeningHours, ShopPatch } from './shop'

type Props = {
  /** Registered business number (10 digits) — pre-fills "Phone for customers". */
  phone: string
  /** Substep to open on (retrying document upload re-enters at step 3;
      an unpaid saved shop re-enters at the payment step). */
  startStep?: 0 | 1 | 2 | 3
  /** Fires on every Continue/Submit with that step's fields; the wizard only
      advances once the returned promise resolves. */
  onSave: (patch: ShopPatch, completedStep: 0 | 1 | 2) => Promise<void>
  /** Set when saving failed — shown above the CTA. */
  submitError?: string
  /** Shop being activated — woven into the payment step's copy. */
  shopName?: string
  /** Merchant's name — prefills Razorpay's contact details. */
  ownerName?: string
  /** Runs after Razorpay reports success: saves the payment, flips setupDone
      and navigates. Throws on save failure so the save can be retried with
      the same payment id — the money is already taken. */
  onPaid: (paymentId: string) => Promise<void>
}

type DocType = 'gstin' | 'licence' | 'udyam' | 'signboard'

const CATEGORIES = [
  'Food',
  'Mishti',
  'Fashion',
  'Groceries',
  'Electronics',
  'Beauty',
  'Services',
]

const DOCS: Array<{
  id: DocType
  name: string
  sub: string
  recommended?: boolean
}> = [
  { id: 'gstin', name: 'GSTIN', sub: 'Fastest — verified automatically', recommended: true },
  { id: 'licence', name: 'Trade licence (KMC)', sub: 'Photo of your licence' },
  { id: 'udyam', name: 'Udyam registration', sub: 'MSME certificate' },
  { id: 'signboard', name: 'Shop photo with signboard', sub: 'If you have none of the above' },
]

const DOC_PHOTO_LABEL: Record<Exclude<DocType, 'gstin'>, string> = {
  licence: 'Trade licence photo',
  udyam: 'Udyam certificate',
  signboard: 'Signboard photo',
}

/** Structural check only: 15 uppercase letters/digits = valid format. */
/** Structural GSTIN check: 2 state digits, PAN (5 letters, 4 digits, 1
    letter), entity code, 'Z', checksum char. The authoritative legal-name
    match happens server-side once a verification backend exists. */
const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/

const STEP_INFO = [
  { title: 'Set up your shop', caption: 'Step 1 of 4 · Shop details' },
  { title: 'Where’s your shop?', caption: 'Step 2 of 4 · Location & hours' },
  { title: 'Verify your shop', caption: 'Step 3 of 4 · Verification' },
  { title: 'Pay to go live', caption: 'Step 4 of 4 · Payment' },
]

function ChevronSvg({ className }: { className: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9.5 5 16 12l-6.5 7" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="#12894B"
      strokeWidth={3.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m5 12.5 4.5 4.5L19 7" />
    </svg>
  )
}

function ClockSmallIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="#D08708"
      strokeWidth={2.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3.2 2.2" />
    </svg>
  )
}

function ArrowIcon() {
  return (
    <svg
      className="biz-cta-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4.5 12h15" />
      <path d="m13.5 6 6 6-6 6" />
    </svg>
  )
}

/** Upload-any-photo box: hatched placeholder that becomes a live preview.
    Choosing an image only STAGES it (local preview) — the parent uploads to
    imgbb when the step's Continue runs. Pass `aspect` to force the crop
    dialog. */
function PhotoBox({
  tag,
  url,
  preview,
  busy,
  onPicked,
  aspect,
}: {
  tag: string
  url: string | null
  /** Staged local image, shown until the parent commits it. */
  preview?: string | null
  /** Dims the box while the parent is saving/uploading. */
  busy?: boolean
  onPicked: (source: File | string) => void
  aspect?: number
}) {
  const [pending, setPending] = useState<File | null>(null)
  const shown = preview ?? url

  return (
    <div className={`biz-photobox${busy ? ' is-busy' : ''}`}>
      {shown && <img src={shown} alt="" />}
      <span className="biz-phototag">{shown ? 'tap to change' : tag}</span>
      <input
        className="biz-photoinput"
        type="file"
        accept="image/*"
        aria-label={tag}
        disabled={busy}
        onChange={(event: ChangeEvent<HTMLInputElement>) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (!file) return
          if (aspect) {
            setPending(file)
          } else {
            onPicked(file)
          }
        }}
      />
      {pending && (
        <ImageCropDialog
          file={pending}
          aspect={aspect ?? 1}
          onCancel={() => setPending(null)}
          onDone={(dataUrl) => {
            setPending(null)
            onPicked(dataUrl)
          }}
        />
      )}
    </div>
  )
}

/** Returns an onPicked handler that stages an image and previews it locally. */
function stagePhoto(
  setStage: (value: File | string | null) => void,
  setPreview: (value: string | null) => void,
) {
  return (source: File | string) => {
    setStage(source)
    setPreview(typeof source === 'string' ? source : URL.createObjectURL(source))
  }
}

/** Row summary for an hours group: the window, "Closed", or "Not set". */
/** Formats a day group for display — shared with the shop-page editor. */
export function hoursLabel(value: DayHours): string {
  if (value === 'closed') return 'Closed'
  if (value === null || !value.opens || !value.closes) return 'Not set'
  return `${value.opens} – ${value.closes}`
}

/** Validates the hours editor — returns an error message or ''. Shared
    with the shop-page editor. */
export function validateHours(hours: OpeningHours): string {
  const groups: Array<[string, DayHours]> = [
    ['Mon — Sat', hours.monSat],
    ['Sunday', hours.sunday],
  ]
  for (const [label, value] of groups) {
    if (value === null || value === 'closed') continue
    if (!value.opens || !value.closes) {
      return `Set both opening and closing times for ${label}.`
    }
    if (value.opens >= value.closes) {
      return `Closing time must be after opening time for ${label}.`
    }
  }
  return ''
}

/** One expandable opening-hours group — a summary row that opens into
    opens/closes time inputs with a "closed all day" switch. */
function HoursGroup({
  label,
  value,
  open,
  onToggle,
  onChange,
}: {
  label: string
  value: DayHours
  open: boolean
  onToggle: () => void
  onChange: (value: DayHours) => void
}) {
  const closed = value === 'closed'
  const times = value !== null && value !== 'closed' ? value : null

  return (
    <div className={`biz-hoursgroup${open ? ' is-open' : ''}`}>
      <button
        type="button"
        className="biz-hoursrow"
        aria-expanded={open}
        onClick={onToggle}
      >
        <span className="biz-hoursrow-main">
          <span className="biz-hoursname">{label}</span>
          <span
            className={`biz-hourstime${hoursLabel(value) === 'Not set' ? ' is-empty' : ''}`}
          >
            {hoursLabel(value)}
          </span>
        </span>
        <ChevronSvg className="biz-chev" />
      </button>
      {open ? (
        <div className="biz-hoursedit">
          <input
            type="time"
            className="biz-timeinput"
            aria-label={`${label} opening time`}
            value={times?.opens ?? ''}
            disabled={closed}
            onChange={(event) =>
              onChange({ opens: event.target.value, closes: times?.closes ?? '' })
            }
          />
          <span className="biz-hoursdash" aria-hidden="true">
            –
          </span>
          <input
            type="time"
            className="biz-timeinput"
            aria-label={`${label} closing time`}
            value={times?.closes ?? ''}
            disabled={closed}
            onChange={(event) =>
              onChange({ opens: times?.opens ?? '', closes: event.target.value })
            }
          />
          <label className="biz-hoursclosed">
            <input
              type="checkbox"
              checked={closed}
              onChange={(event) => onChange(event.target.checked ? 'closed' : null)}
            />
            Closed all day
          </label>
        </div>
      ) : null}
    </div>
  )
}

export default function BusinessSetup({
  phone,
  startStep = 0,
  onSave,
  submitError,
  shopName = '',
  ownerName = '',
  onPaid,
}: Props) {
  const [substep, setSubstep] = useState<0 | 1 | 2 | 3>(startStep)
  const [name, setName] = useState('')
  const [category, setCategory] = useState<string | null>(null)
  const [owner, setOwner] = useState('')
  const [customerPhone, setCustomerPhone] = useState(
    phone ? `+91 ${phone}` : '',
  )
  const [address, setAddress] = useState('')
  const [latlng, setLatLng] = useState<{ lat: number; lng: number } | null>(null)
  const addressTouched = useRef(false) // merchant typed a custom address
  const addressAuto = useRef(false) // current text came from the map
  const [hours, setHours] = useState<OpeningHours>({ monSat: null, sunday: null })
  const [openHoursRow, setOpenHoursRow] = useState<'monSat' | 'sunday' | null>(null)
  const [hoursError, setHoursError] = useState('')
  const [docError, setDocError] = useState('')
  const [showPhone, setShowPhone] = useState(true)
  const [shopPhoto, setShopPhoto] = useState<string | null>(null)
  const [shopPhotoStage, setShopPhotoStage] = useState<File | string | null>(null)
  const [shopPhotoPreview, setShopPhotoPreview] = useState<string | null>(null)
  const [docPhoto, setDocPhoto] = useState<string | null>(null)
  const [docPhotoStage, setDocPhotoStage] = useState<File | string | null>(null)
  const [docPhotoPreview, setDocPhotoPreview] = useState<string | null>(null)
  const [photoError, setPhotoError] = useState('')
  const [doc, setDoc] = useState<DocType>('gstin')
  const [gstin, setGstin] = useState('')
  const [saving, setSaving] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [payOpening, setPayOpening] = useState(false)
  const [payConfirming, setPayConfirming] = useState(false)
  const [payError, setPayError] = useState('')
  const [payConfirmId, setPayConfirmId] = useState('')
  const gstinValid = GSTIN_RE.test(gstin)

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [substep])

  /** Uploads the staged storefront image (if any) and returns its hosted URL. */
  async function commitShopPhoto(): Promise<string | null> {
    if (!shopPhotoStage) return shopPhoto
    try {
      const hosted = await uploadToImgbb(shopPhotoStage)
      setShopPhoto(hosted)
      setShopPhotoStage(null)
      setShopPhotoPreview(null)
      return hosted
    } catch (err) {
      setPhotoError(
        err instanceof Error ? err.message : 'Upload failed. Try again.',
      )
      throw err
    }
  }

  /** Uploads the staged document photo (if any) and returns its hosted URL. */
  async function commitDocPhoto(): Promise<string | null> {
    if (!docPhotoStage) return docPhoto
    try {
      const hosted = await uploadToImgbb(docPhotoStage)
      setDocPhoto(hosted)
      setDocPhotoStage(null)
      setDocPhotoPreview(null)
      return hosted
    } catch (err) {
      setPhotoError(
        err instanceof Error ? err.message : 'Upload failed. Try again.',
      )
      throw err
    }
  }

  /** The map reports the pin's fix: remember the coordinates and mirror the
      resolved street address into the field — unless the merchant typed their
      own, which we never overwrite. */
  function handleLocation(fix: LocationFix): void {
    setLatLng({ lat: fix.lat, lng: fix.lng })
    if (!fix.address) return
    if (addressTouched.current && !addressAuto.current) return
    setAddress(fix.address)
    addressAuto.current = true
  }

  function updateHours(day: 'monSat' | 'sunday', value: DayHours): void {
    setHoursError('')
    setHours((current) => ({ ...current, [day]: value }))
  }

  /** Opens Razorpay's checkout for the one-time ₹1,000 fee. The handler
      fires when the payment succeeds; a closed sheet or a failed attempt
      just returns here — nothing is charged unless Razorpay reports
      success. */
  async function startPayment(): Promise<void> {
    const keyId = razorpayKeyId()
    if (!keyId || payOpening || payConfirming) return
    setPayError('')
    setPayOpening(true)
    const loaded = await loadCheckout()
    const Razorpay = window.Razorpay
    if (!loaded || !Razorpay) {
      setPayOpening(false)
      setPayError(
        "Couldn't reach Razorpay. Check your connection and try again.",
      )
      return
    }
    const checkout = new Razorpay({
      key: keyId,
      amount: 100000, // ₹1,000 in paise
      currency: 'INR',
      name: 'NearZoop',
      description: 'One-time shop verification fee',
      ...(ownerName || phone
        ? {
            prefill: {
              ...(ownerName ? { name: ownerName } : {}),
              ...(phone ? { contact: `+91${phone}` } : {}),
            },
          }
        : {}),
      theme: { color: '#fb4b32' },
      handler: (response) => {
        setPayOpening(false)
        const id = response.razorpay_payment_id
        if (!id) {
          setPayError(
            'Payment went through but no reference came back — contact support before paying again.',
          )
          return
        }
        void confirmPayment(id)
      },
      modal: { ondismiss: () => setPayOpening(false) },
    })
    checkout.open()
  }

  /** Saves the payment result via the parent. On failure the reference is
      kept so the save (never the payment) can be retried. */
  async function confirmPayment(paymentId: string): Promise<void> {
    setPayConfirming(true)
    setPayConfirmId('')
    try {
      await onPaid(paymentId)
      // Success: the parent navigates away and the wizard unmounts.
    } catch {
      setPayConfirming(false)
      setPayConfirmId(paymentId)
    }
  }

  async function handleContinue(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving || verifying || payOpening || payConfirming) return
    const completed = substep
    if (completed === 1) {
      const hoursErrorText = validateHours(hours)
      if (hoursErrorText) {
        setHoursError(hoursErrorText)
        return
      }
    }
    if (completed === 2) {
      // The document is the point of this step — block submitting without it.
      if (doc === 'gstin' && !gstinValid) {
        setDocError('Enter your 15-character GSTIN to submit.')
        return
      }
      if (doc !== 'gstin' && !docPhotoStage && !docPhoto) {
        setDocError('Add a photo of your document to submit.')
        return
      }
    }
    if (completed === 3) {
      // The payment step: open Razorpay's checkout; the handler takes it
      // from there. Nothing to save here.
      await startPayment()
      return
    }
    setSaving(true)
    setPhotoError('')
    try {
      if (completed === 0) {
        const shopPhotoUrl = await commitShopPhoto()
        await onSave(
          {
            name: name.trim(),
            category: category ?? '',
            ownerName: owner.trim(),
            customerPhone: customerPhone.trim(),
            showPhone,
            shopPhotoUrl,
          },
          0,
        )
      } else if (completed === 1) {
        await onSave(
          {
            address: address.trim(),
            ...(latlng ? { lat: latlng.lat, lng: latlng.lng } : {}),
            // Null when nothing was set — also how a previously saved
            // schedule gets cleared on re-edit.
            openingHours:
              hours.monSat === null && hours.sunday === null ? null : hours,
          },
          1,
        )
      } else if (doc === 'gstin') {
        // Auto-verify against the GST network before anything is saved.
        setVerifying(true)
        const check = await verifyGstin(gstin)
        if (!check.ok && check.reason === 'not-found') {
          setDocError(
            "This GSTIN isn't on the GST portal. Check the number and try again.",
          )
          return
        }
        if (check.ok && check.status !== 'Active') {
          setDocError(
            `This GSTIN is ${check.status.toLowerCase()} on the GST portal — ` +
              'verification needs an active registration.',
          )
          return
        }
        if (check.ok) {
          // Verified on the spot — the parent skips the checking screen.
          await onSave(
            {
              docKind: 'gstin',
              gstin,
              docPhotoUrl: null,
              gstinLegalName: check.legalName,
              verification: 'verified',
            },
            2,
          )
        } else {
          // Lookup unreachable (key, credits, rate limit, network) — don't
          // block the merchant; fall back to the manual-review path.
          await onSave({ docKind: 'gstin', gstin, docPhotoUrl: null }, 2)
        }
      } else {
        const docPhotoUrl = await commitDocPhoto()
        await onSave(
          {
            docKind: doc,
            gstin: '',
            docPhotoUrl,
          },
          2,
        )
      }
    } catch {
      // Upload or save failed — the error is surfaced; stay on this step.
      return
    } finally {
      setSaving(false)
      setVerifying(false)
    }
    if (completed < 2) {
      setSubstep((current) => (current + 1) as 0 | 1 | 2)
    } else {
      // Documents saved — on to the payment step. (A paid merchant
      // re-submitting after a failed check is navigated away by the parent
      // before this runs; the update is then a harmless no-op.)
      setSubstep(3)
    }
  }

  const info = STEP_INFO[substep]

  return (
    <main className="biz-page">
      <form className="biz-shell" onSubmit={handleContinue} noValidate>
        <header>
          <div className="biz-steptop">
            <h1 className="biz-steptitle">{info.title}</h1>
          </div>
          <div className="biz-progress" aria-hidden="true">
            {[0, 1, 2, 3].map((segment) => (
              <span
                key={segment}
                className={`biz-seg${segment <= substep ? ' is-done' : ''}`}
              />
            ))}
          </div>
          <p className="biz-stepcap">{info.caption}</p>
        </header>

        {substep === 2 ? (
          <>
            <p className="biz-intro">
              Verified shops get a badge customers trust. You can post offers
              while we check — they go live once you’re verified.
            </p>

            <label className="biz-label biz-field">Choose one document</label>
            <div
              className="biz-choicelist"
              role="radiogroup"
              aria-label="Choose one document"
            >
              {DOCS.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  role="radio"
                  aria-checked={doc === entry.id}
                  className={`biz-choice${doc === entry.id ? ' is-selected' : ''}`}
                  onClick={() => {
                    setDoc(entry.id)
                    setDocError('')
                  }}
                  disabled={saving}
                >
                  <span
                    className={`biz-radio${doc === entry.id ? ' is-selected' : ''}`}
                    aria-hidden="true"
                  >
                    {doc === entry.id && <span className="biz-radio-dot" />}
                  </span>
                  <span className="biz-choice-text">
                    <span className="biz-choice-name">{entry.name}</span>
                    <span className="biz-choice-sub">{entry.sub}</span>
                  </span>
                  {entry.recommended && <span className="biz-pill">Recommended</span>}
                </button>
              ))}
            </div>

            {doc === 'gstin' ? (
              <>
                <label className="biz-label biz-field" htmlFor="biz-gstin">
                  GSTIN
                </label>
                <div className="biz-inputrow">
                  <input
                    id="biz-gstin"
                    className="biz-input-plain"
                    value={gstin}
                    maxLength={15}
                    placeholder="Your 15-character GSTIN"
                    autoCapitalize="characters"
                    spellCheck={false}
                    onChange={(event) => {
                      setGstin(
                        event.target.value
                          .toUpperCase()
                          .replace(/[^0-9A-Z]/g, '')
                          .slice(0, 15),
                      )
                      setDocError('')
                    }}
                  />
                  {gstinValid && (
                    <span className="biz-pill">
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={3}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="m5 12.5 4.5 4.5L19 7" />
                      </svg>
                      Valid format
                    </span>
                  )}
                </div>
                <p className="biz-hint">
                  15 characters. We match the legal name with your shop.
                </p>
              </>
            ) : (
              <>
                <label className="biz-label biz-field">
                  {DOC_PHOTO_LABEL[doc]}
                </label>
                <PhotoBox
                  tag="tap to add photo"
                  url={docPhoto}
                  preview={docPhotoPreview}
                  busy={saving}
                  onPicked={(source) => {
                    setDocError('')
                    stagePhoto(setDocPhotoStage, setDocPhotoPreview)(source)
                  }}
                />
                <p className="biz-hint">
                  We check the photo by hand — usually within a day.
                </p>
              </>
            )}
          </>
        ) : null}

        {substep === 1 ? (
          <div className="biz-locrow">
            <LocationPicker onPick={handleLocation} />

            <div className="biz-locfields">
              <label className="biz-label biz-field" htmlFor="biz-address">
                Address
              </label>
              <div className="biz-inputrow">
                <svg
                  className="biz-inputrow-icon"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#6a6152"
                  strokeWidth={2.2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M12 21c4-4.6 7-8 7-11.5A7 7 0 1 0 5 9.5C5 13 8 16.4 12 21Z" />
                  <circle cx="12" cy="9.5" r="2.4" />
                </svg>
                <input
                  id="biz-address"
                  className="biz-input-plain"
                  value={address}
                  placeholder="Shop no., street, area, PIN code"
                  aria-label="Shop address"
                  onChange={(event) => {
                    setAddress(event.target.value)
                    addressTouched.current = true
                    addressAuto.current = false
                  }}
                />
              </div>

              <label className="biz-label biz-field">Opening hours</label>
              <div className="biz-hours">
                <HoursGroup
                  label="Mon — Sat"
                  value={hours.monSat}
                  open={openHoursRow === 'monSat'}
                  onToggle={() =>
                    setOpenHoursRow((current) => (current === 'monSat' ? null : 'monSat'))
                  }
                  onChange={(value) => updateHours('monSat', value)}
                />
                <HoursGroup
                  label="Sunday"
                  value={hours.sunday}
                  open={openHoursRow === 'sunday'}
                  onToggle={() =>
                    setOpenHoursRow((current) => (current === 'sunday' ? null : 'sunday'))
                  }
                  onChange={(value) => updateHours('sunday', value)}
                />
              </div>
              {hoursError ? <p className="biz-hourserror">{hoursError}</p> : null}
              <p className="biz-hint">
                Customers see “Open now / Closed” from this.
              </p>
            </div>
          </div>
        ) : null}

        {substep === 0 ? (
          <>
            <label className="biz-label biz-field" htmlFor="biz-name">
              Shop name
            </label>
            <input
              id="biz-name"
              className="biz-input"
              value={name}
              maxLength={60}
              placeholder="Your shop name"
              onChange={(event) => setName(event.target.value)}
            />
            <p className="biz-hint">As written on your signboard.</p>

            <label className="biz-label biz-field" id="biz-category-label">
              Category
            </label>
            <div
              className="biz-chips"
              role="radiogroup"
              aria-labelledby="biz-category-label"
            >
              {CATEGORIES.map((entry) => (
                <button
                  key={entry}
                  type="button"
                  role="radio"
                  aria-checked={category === entry}
                  className={`biz-chipbtn${category === entry ? ' is-selected' : ''}`}
                  onClick={() => setCategory(entry)}
                >
                  {entry}
                </button>
              ))}
            </div>

            <label className="biz-label biz-field" htmlFor="biz-owner">
              Owner / manager name
            </label>
            <input
              id="biz-owner"
              className="biz-input"
              value={owner}
              maxLength={60}
              placeholder="Full name"
              onChange={(event) => setOwner(event.target.value)}
            />

            <label className="biz-label biz-field">Phone for customers (optional)</label>
            <div className="biz-inputrow">
              <input
                className="biz-input-plain"
                value={customerPhone}
                maxLength={14}
                inputMode="tel"
                aria-label="Phone for customers"
                onChange={(event) =>
                  setCustomerPhone(event.target.value.replace(/[^0-9+ ]/g, '').slice(0, 14))
                }
              />
              <span className={`biz-toggle${showPhone ? ' is-on' : ''}`}>
                <input
                  className="biz-toggle-input"
                  type="checkbox"
                  checked={showPhone}
                  aria-label="Show this phone to customers"
                  onChange={(event) => setShowPhone(event.target.checked)}
                />
                <span className="biz-toggle-knob" aria-hidden="true" />
              </span>
            </div>
            <p className="biz-hint">Shown on your shop page with a Call button.</p>

            <label className="biz-label biz-field">Shop front photo</label>
            <PhotoBox
              tag="tap to add photo"
              url={shopPhoto}
              preview={shopPhotoPreview}
              busy={saving}
              onPicked={stagePhoto(setShopPhotoStage, setShopPhotoPreview)}
              aspect={4 / 3}
            />
            <p className="biz-hint">
              Landscape 4:3 looks best — the whole shopfront in frame.
            </p>
          </>
        ) : null}

        {substep === 3 ? (
          <>
            <p className="biz-intro">
              A one-time ₹1,000 verification fee activates
              {shopName ? ` “${shopName}”` : ' your shop'} for customers.
              GSTINs are verified on the spot; photo documents are checked by
              hand within 24 hours. The fee is non-refundable — but if your
              shop is rejected at verification, it's refunded automatically
              within 2 days.
            </p>

            <ul className="biz-checklist">
              <li className="biz-checkrow">
                <span className="biz-chipicon biz-chipicon-done">
                  <CheckIcon />
                </span>
                <span className="biz-checklabel">Shop details</span>
                <span className="biz-checkstate">Done</span>
              </li>
              <li className="biz-checkrow">
                <span className="biz-chipicon biz-chipicon-done">
                  <CheckIcon />
                </span>
                <span className="biz-checklabel">Location &amp; hours</span>
                <span className="biz-checkstate">Done</span>
              </li>
              <li className="biz-checkrow">
                <span className="biz-chipicon biz-chipicon-checking">
                  <ClockSmallIcon />
                </span>
                <span className="biz-checklabel">Verification fee</span>
                <span className="biz-checkstate">₹1,000 · due now</span>
              </li>
            </ul>

            {payError && <p className="biz-photoerror">{payError}</p>}

            {payConfirmId && (
              <>
                <p className="biz-photoerror">
                  Payment {payConfirmId} was received but confirming it
                  failed. Check your connection, then try again — you won't
                  be charged twice.
                </p>
                <button
                  type="button"
                  className="biz-linkbtn"
                  onClick={() => void confirmPayment(payConfirmId)}
                >
                  Try confirming again
                </button>
              </>
            )}

            <p className="biz-payfine">
              One-time · Non-refundable · Rejected? Auto-refunded in 2 days ·
              Secured by Razorpay
            </p>

            {!razorpayKeyId() && (
              <p className="biz-payfine">
                Payments aren't wired up in this build yet — add
                VITE_RAZORPAY_KEY_ID to .env and restart Vite.
              </p>
            )}
          </>
        ) : null}

        {(submitError || photoError || docError) && (
          <p className="biz-photoerror">{submitError || photoError || docError}</p>
        )}

        <div className="biz-formfoot">
          <button
            type="submit"
            className="btn-primary biz-btn"
            disabled={
              saving ||
              verifying ||
              payOpening ||
              payConfirming ||
              (substep === 3 && !razorpayKeyId())
            }
          >
            {payConfirming
              ? 'Confirming…'
              : payOpening
                ? 'Opening Razorpay…'
                : verifying
                  ? 'Checking GSTIN…'
                  : saving
                    ? 'Saving…'
                    : substep === 3
                      ? (
                        <>
                          <ArrowIcon />
                          Pay ₹1,000 — one time
                        </>
                      )
                      : (
                        'Continue'
                      )}
          </button>
        </div>
      </form>
    </main>
  )
}
