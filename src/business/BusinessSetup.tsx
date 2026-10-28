import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'

type Props = {
  /** Registered business number (10 digits) — pre-fills "Phone for customers". */
  phone: string
  /** Substep to open on (retrying document upload re-enters at step 3). */
  startStep?: 0 | 1 | 2
  /** Fires after "Submit for verification". */
  onSubmitted: () => void
  /** Back from step 1 returns to the OTP screen. */
  onBackToCode: () => void
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

/** Structural demo input: 15 uppercase letters/digits = valid format. */
const GSTIN_RE = /^[0-9A-Z]{15}$/

const STEP_INFO = [
  { title: 'Set up your shop', caption: 'Step 1 of 3 · Shop details' },
  { title: 'Where’s your shop?', caption: 'Step 2 of 3 · Location & hours' },
  { title: 'Verify your shop', caption: 'Step 3 of 3 · Verification' },
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

/** Upload-any-photo box: hatched placeholder that becomes a live preview. */
function PhotoBox({
  tag,
  url,
  onPick,
}: {
  tag: string
  url: string | null
  onPick: (file: File | undefined) => void
}) {
  return (
    <div className="biz-photobox">
      {url && <img src={url} alt="" />}
      <span className="biz-phototag">{url ? 'tap to change' : tag}</span>
      <input
        className="biz-photoinput"
        type="file"
        accept="image/*"
        aria-label={tag}
        onChange={(event: ChangeEvent<HTMLInputElement>) => {
          onPick(event.target.files?.[0])
          event.target.value = ''
        }}
      />
    </div>
  )
}

/** Stylised Gariahat-area map. Pans under a fixed pin; address stays static. */
function MapPane() {
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const drag = useRef<{ px: number; py: number; ox: number; oy: number } | null>(null)

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    drag.current = { px: event.clientX, py: event.clientY, ox: offset.x, oy: offset.y }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!drag.current) return
    setOffset({
      x: Math.max(-110, Math.min(110, drag.current.ox + (event.clientX - drag.current.px))),
      y: Math.max(-70, Math.min(70, drag.current.oy + (event.clientY - drag.current.py))),
    })
  }

  function onPointerUp() {
    drag.current = null
  }

  return (
    <div
      className="biz-map"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <svg
        className="biz-map-inner"
        style={{ translate: `${offset.x}px ${offset.y}px` }}
        viewBox="0 0 900 520"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden="true"
      >
        <rect width="900" height="520" fill="#ebd9b4" />
        <rect x="40" y="175" width="150" height="135" rx="10" fill="#e2cfa8" />
        <rect x="235" y="140" width="175" height="165" rx="10" fill="#e4d2ac" />
        <rect x="60" y="15" width="140" height="70" rx="10" fill="#e2cfa8" />
        <rect x="540" y="235" width="130" height="110" rx="10" fill="#e4d2ac" />
        <rect x="640" y="200" width="300" height="240" rx="28" fill="#d4eac2" />
        <ellipse cx="785" cy="300" rx="84" ry="58" fill="#a9d3ee" />
        <rect x="30" y="430" width="210" height="110" rx="22" fill="#d4eac2" />
        <g stroke="#ffffff" strokeWidth="10">
          <path d="M195 0v520" />
          <path d="M0 215h420" />
        </g>
        <g stroke="#ffffff" strokeWidth="26">
          <path d="M0 100h900" />
          <path d="M0 360l900-24" />
          <path d="M438 0l-12 240 60 280" />
          <path d="M600 0l300 210" />
        </g>
        <text x="58" y="152" fill="#8a7a5b" fontSize="20" letterSpacing="5">
          RASHBEHARI AVE
        </text>
        <text
          transform="translate(448 84) rotate(86)"
          fill="#8a7a5b"
          fontSize="18"
          letterSpacing="5"
        >
          GARIAHAT RD
        </text>
        <text x="672" y="458" fill="#7f9a85" fontSize="18" letterSpacing="4">
          RABINDRA SAROVAR
        </text>
      </svg>

      <span className="biz-pin" aria-hidden="true">
        <svg viewBox="0 0 48 58">
          <path
            d="M24 54C33 43.5 38 32.5 38 21A14 14 0 1 0 10 21c0 11.5 5 22.5 14 33Z"
            fill="#fb4b32"
            stroke="#1c1b19"
            strokeWidth="3.5"
            strokeLinejoin="round"
          />
          <circle cx="24" cy="21" r="6.5" fill="#ffffff" />
        </svg>
      </span>
      <p className="biz-pintip">Drag map so the pin sits on your door</p>
    </div>
  )
}

export default function BusinessSetup({
  phone,
  startStep = 0,
  onSubmitted,
  onBackToCode,
}: Props) {
  const [substep, setSubstep] = useState<0 | 1 | 2>(startStep)
  const [name, setName] = useState('Gariahat Saree Ghar')
  const [category, setCategory] = useState('Fashion')
  const [owner, setOwner] = useState('Subrata Das')
  const [customerPhone, setCustomerPhone] = useState(`+91 ${phone}`)
  const [showPhone, setShowPhone] = useState(true)
  const [shopPhoto, setShopPhoto] = useState<string | null>(null)
  const [docPhoto, setDocPhoto] = useState<string | null>(null)
  const [doc, setDoc] = useState<DocType>('gstin')
  const [gstin, setGstin] = useState('19ABCPD1234F1Z5')
  const gstinValid = GSTIN_RE.test(gstin)

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [substep])

  function back() {
    if (substep === 0) {
      onBackToCode()
    } else {
      setSubstep((current) => (current - 1) as 0 | 1 | 2)
    }
  }

  function handleContinue(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (substep < 2) {
      setSubstep((current) => (current + 1) as 0 | 1 | 2)
    } else {
      onSubmitted()
    }
  }

  function pickPhoto(setter: (url: string | null) => void) {
    return (file: File | undefined) => {
      setter(file ? URL.createObjectURL(file) : null)
    }
  }

  const info = STEP_INFO[substep]

  return (
    <main className="biz-page">
      <form className="biz-shell" onSubmit={handleContinue} noValidate>
        <header>
          <div className="biz-steptop">
            <button
              type="button"
              className="btn-circle"
              aria-label="Back"
              onClick={back}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.4}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M14.5 5.5 8 12l6.5 6.5" />
              </svg>
            </button>
            <h1 className="biz-steptitle">{info.title}</h1>
          </div>
          <div className="biz-progress" aria-hidden="true">
            {[0, 1, 2].map((segment) => (
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
                  onClick={() => setDoc(entry.id)}
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
                    autoCapitalize="characters"
                    spellCheck={false}
                    onChange={(event) =>
                      setGstin(
                        event.target.value
                          .toUpperCase()
                          .replace(/[^0-9A-Z]/g, '')
                          .slice(0, 15),
                      )
                    }
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
                  onPick={pickPhoto(setDocPhoto)}
                />
                <p className="biz-hint">
                  We check the photo by hand — usually within a day.
                </p>
              </>
            )}
          </>
        ) : null}

        {substep === 1 ? (
          <>
            <MapPane />

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
                defaultValue="12/1 Gariahat Rd (S), Kolkata 700031"
                aria-label="Shop address"
              />
            </div>

            <label className="biz-label biz-field">Opening hours</label>
            <div className="biz-hours">
              <div className="biz-hoursrow">
                <div className="biz-hoursrow-main">
                  <div className="biz-hoursname">Mon — Sat</div>
                  <div className="biz-hourstime">10:30 AM — 9:00 PM</div>
                </div>
                <ChevronSvg className="biz-chev" />
              </div>
              <div className="biz-hoursrow">
                <div className="biz-hoursrow-main">
                  <div className="biz-hoursname">Sunday</div>
                  <div className="biz-hourstime">11:00 AM — 7:00 PM</div>
                </div>
                <ChevronSvg className="biz-chev" />
              </div>
            </div>
            <p className="biz-hint">
              Customers see “Open now / Closed” from this.
            </p>
          </>
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
              onPick={pickPhoto(setShopPhoto)}
            />
          </>
        ) : null}

        <div className="biz-formfoot">
          <button type="submit" className="btn-primary biz-btn">
            {substep === 2 ? (
              <>
                <svg
                  className="biz-cta-icon"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2.2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
                  <path d="m9 11.5 2.2 2.2 3.8-4.2" />
                </svg>
                Submit for verification
              </>
            ) : (
              'Continue'
            )}
          </button>
        </div>
      </form>
    </main>
  )
}
