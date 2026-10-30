import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent, KeyboardEvent as ReactKeyboardEvent } from "react"
import type { OfferRecord } from './shop'
import { markOfferRedeemed, unmarkOfferRedeemed } from './shop'
import {
  couponState,
  fmtCouponCode,
  lookupCoupon,
  markCouponUsed,
  releaseCoupon,
  type CouponRecord,
} from './coupons'
import './business.css'

/** The Scan flow — opened from the sidebar button, the mobile scan chip and
    the dashboard's "Scan coupon" action. Adapted for the web: the camera is
    real (getUserMedia + BarcodeDetector where the browser has one), but the
    manual path is a first-class citizen, since a desktop webcam pointed at
    a customer's phone is the exception, not the rule.

    Coupon lifecycle states (valid / expired / already used) come from the
    claims collection (coupons.ts): a claimed coupon is a `coupons/{code}`
    doc, the camera reads the QR payload or staff type the code, and the
    lookup is a single get. Redeeming marks the coupon used and bumps the
    offer's redemption count; the undo window puts both back. The manual
    counting path for "show screen" & code offers stays as it was: mark →
    green Redeemed screen → undo within 2 minutes. */

type Props = {
  uid: string
  ownerName: string
  /** Live offers a staff member can count manually (non-coupon kinds). */
  manualOffers: OfferRecord[]
  onClose: () => void
}

type CamState = 'starting' | 'live' | 'denied' | 'unsupported'
type Mode = 'scan' | 'code'

type SheetState = {
  code: string
  state: 'valid' | 'used' | 'expired' | 'notfound' | 'foreign'
  coupon: CouponRecord | null
}

/** Minimal BarcodeDetector shape — the DOM lib doesn't type it yet. */
type DetectedBarcode = { rawValue: string }
type DetectorLike = {
  detect: (source: HTMLVideoElement) => Promise<DetectedBarcode[]>
}
type DetectorCtor = new (options: { formats: string[] }) => DetectorLike

/** The staff instruction under "Redeemed." — from the offer's badge label
    ("₹300 OFF" → "Give ₹300 off the bill."). */
function giveLine(label?: string): string {
  const raw = (label ?? '').trim()
  const match = raw.match(/^(.+?)\s+off$/i)
  if (match) return `Give ${match[1]} off the bill.`
  return 'Give the offer discount.'
}

/** "27 OCT, 7:22 PM" — the stamp style the design shows. */
function fmtStamp(at: Date): string {
  const day = at.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
  const time = at.toLocaleTimeString('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
  return `${day.toUpperCase()}, ${time.toUpperCase()}`
}

function CloseSvg() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  )
}

function BackSvg() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M15 5l-7 7 7 7" />
    </svg>
  )
}

function BoltSvg() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M13 2 4.5 13.5H11L9.5 22 19 10h-6.5L13 2Z" />
    </svg>
  )
}

function CheckSvg() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 12.5 9.5 18 20 6.5" />
    </svg>
  )
}

function PlusSvg() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

export default function BusinessScan({
  uid,
  ownerName,
  manualOffers,
  onClose,
}: Props) {
  const [mode, setMode] = useState<Mode>('scan')
  const [cam, setCam] = useState<CamState>('starting')
  const [torchOk, setTorchOk] = useState(false)
  const [torchOn, setTorchOn] = useState(false)
  const [detectorOk, setDetectorOk] = useState(true)
  // A rear camera (a phone pointed at the customer) shows the world as-is;
  // a laptop webcam is user-facing and reads better mirrored.
  const [rear, setRear] = useState(false)
  const [sheet, setSheet] = useState<SheetState | null>(null)
  const [done, setDone] = useState<{
    offerId: string
    code?: string
    line: string
    at: Date
  } | null>(null)
  const [undoLeft, setUndoLeft] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [part1, setPart1] = useState('')
  const [part2, setPart2] = useState('')

  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const part2Ref = useRef<HTMLInputElement | null>(null)
  const lockedRef = useRef(false)

  /* Camera + detection loop — runs only in scan mode; torn down on every
     mode change so the stream never outlives the view showing it. */
  useEffect(() => {
    if (mode !== 'scan') return
    let cancelled = false
    let timer: number | null = null
    lockedRef.current = false

    async function start(): Promise<void> {
      const media = navigator.mediaDevices
      if (!media?.getUserMedia) {
        setCam('unsupported')
        return
      }
      try {
        const stream = await media.getUserMedia({
          video: { facingMode: 'environment' },
          audio: false,
        })
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          try {
            await videoRef.current.play()
          } catch {
            /* autoplay rules — muted+playsInline covers the real cases */
          }
        }
        const track = stream.getVideoTracks()[0]
        const settings = track?.getSettings?.()
        setRear(settings?.facingMode === 'environment')
        const caps = track?.getCapabilities?.() as
          | (MediaTrackCapabilities & { torch?: boolean })
          | undefined
        setTorchOk(Boolean(caps?.torch))
        setCam('live')

        const ctor = (window as unknown as { BarcodeDetector?: DetectorCtor })
          .BarcodeDetector
        if (!ctor) {
          setDetectorOk(false)
          return
        }
        const detector = new ctor({ formats: ['qr_code'] })
        timer = window.setInterval(() => {
          void (async () => {
            if (lockedRef.current || !videoRef.current) return
            try {
              const found = await detector.detect(videoRef.current)
              if (found.length > 0 && !lockedRef.current) {
                lockedRef.current = true
                setSheet(null)
                void resolve(found[0].rawValue)
              }
            } catch {
              /* frame not ready — next tick retries */
            }
          })()
        }, 350)
      } catch (err) {
        if (cancelled) return
        setCam(
          err instanceof DOMException && err.name === 'NotAllowedError'
            ? 'denied'
            : 'unsupported',
        )
      }
    }

    void start()
    return () => {
      cancelled = true
      if (timer !== null) window.clearInterval(timer)
      streamRef.current?.getTracks().forEach((track) => track.stop())
      streamRef.current = null
      setTorchOn(false)
    }
  }, [mode])

  /* Undo window — counts down only while the green screen is up. */
  useEffect(() => {
    if (!done) return
    const timer = window.setInterval(() => {
      setUndoLeft((value) => Math.max(0, value - 1))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [done])

  /* Escape peels one layer: sheet → code screen → the whole flow. */
  useEffect(() => {
    function onKey(event: KeyboardEvent): void {
      if (event.key !== 'Escape') return
      if (sheet) {
        setSheet(null)
        lockedRef.current = false
      } else if (mode === 'code') {
        setMode('scan')
      } else {
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [sheet, mode, onClose])

  function closeSheet(): void {
    setSheet(null)
    lockedRef.current = false
  }

  async function resolve(raw: string): Promise<void> {
    const code = fmtCouponCode(raw)
    if (code === '—' || busy) return
    setBusy(true)
    setError('')
    try {
      const coupon = await lookupCoupon(code)
      if (!coupon) {
        lockedRef.current = true
        setSheet({ code, state: 'notfound', coupon: null })
      } else if (coupon.shopUid !== uid) {
        lockedRef.current = true
        setSheet({ code, state: 'foreign', coupon })
      } else {
        lockedRef.current = true
        setSheet({ code, state: couponState(coupon), coupon })
      }
    } catch {
      setError('Couldn’t check that code. Try again.')
      lockedRef.current = false
    }
    setBusy(false)
  }

  async function toggleTorch(): Promise<void> {
    const track = streamRef.current?.getVideoTracks()[0]
    if (!track) return
    const next = !torchOn
    try {
      await track.applyConstraints({
        advanced: [{ torch: next }],
      } as unknown as MediaTrackConstraints)
      setTorchOn(next)
    } catch {
      /* torch refused — the button just stays off */
    }
  }

  function typePart1(event: ChangeEvent<HTMLInputElement>): void {
    const value = event.target.value
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, 4)
    setPart1(value)
    if (value.length === 4) part2Ref.current?.focus()
  }

  function typePart2(event: ChangeEvent<HTMLInputElement>): void {
    const value = event.target.value
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, 3)
    setPart2(value)
  }

  function onPart2Key(event: ReactKeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'Backspace' && part2 === '') {
      const input = event.currentTarget.form?.elements[0] as
        | HTMLInputElement
        | undefined
      input?.focus()
    }
  }

  async function checkCode(): Promise<void> {
    const clean = `${part1}${part2}`.toUpperCase()
    if (clean.length !== 7 || busy) return
    lockedRef.current = true
    await resolve(clean)
  }

  async function redeemCoupon(coupon: CouponRecord): Promise<void> {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      await markCouponUsed(coupon.code, uid)
      // A scanned coupon also counts in the offer's redemption numbers.
      try {
        await markOfferRedeemed(uid, coupon.offerId)
      } catch {
        // The coupon is already spent; the count is secondary.
      }
      setSheet(null)
      setDone({
        offerId: coupon.offerId,
        code: coupon.code,
        line: giveLine(coupon.discountLabel),
        at: new Date(),
      })
      setUndoLeft(120)
    } catch {
      setError('Couldn’t redeem that. Check the connection and try again.')
    }
    setBusy(false)
  }

  async function markManual(offer: OfferRecord): Promise<void> {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      await markOfferRedeemed(uid, offer.id)
      setDone({ offerId: offer.id, line: giveLine(offer.discountLabel), at: new Date() })
      setUndoLeft(120)
    } catch {
      setError('Couldn’t mark that. Check the connection and try again.')
    }
    setBusy(false)
  }

  async function undo(): Promise<void> {
    if (!done || busy) return
    setBusy(true)
    try {
      if (done.code) await releaseCoupon(done.code)
      await unmarkOfferRedeemed(uid, done.offerId)
      setDone(null)
      setMode('scan')
    } catch {
      setError('Couldn’t undo. Try again.')
    }
    setBusy(false)
  }

  /* ---- Redeemed: the green screen replaces everything. ---- */
  if (done) {
    return (
      <div className="biz-scan biz-scan-done" role="status">
        <span className="biz-scan-checktile" aria-hidden="true">
          <CheckSvg />
        </span>
        <h1>Redeemed.</h1>
        <p className="biz-scan-give">{done.line}</p>
        {done.code && <p className="biz-scan-metacode">{done.code}</p>}
        <p className="biz-scan-meta">
          {fmtStamp(done.at)} · BY {ownerName.toUpperCase() || 'YOU'}
        </p>
        <button
          type="button"
          className="biz-scan-next"
          onClick={() => {
            setDone(null)
            setMode('scan')
          }}
        >
          Scan next
        </button>
        {undoLeft > 0 && (
          <button
            type="button"
            className="biz-scan-undo"
            onClick={undo}
            disabled={busy}
          >
            Undo · {Math.floor(undoLeft / 60)}:
            {String(undoLeft % 60).padStart(2, '0')} left
          </button>
        )}
        {error && <p className="biz-scan-doneerr">{error}</p>}
      </div>
    )
  }

  const light = mode === 'code'

  return (
    <div
      className={`biz-scan${light ? ' biz-scan-light' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label="Scan customer's coupon"
    >
      <header className="biz-scan-head">
        <button
          type="button"
          className="biz-scan-circle"
          onClick={light ? () => setMode('scan') : onClose}
          aria-label={light ? 'Back to camera' : 'Close scanner'}
        >
          {light ? <BackSvg /> : <CloseSvg />}
        </button>
        <h1>{light ? 'Enter coupon code' : 'Scan customer’s coupon'}</h1>
        {!light &&
          (torchOk ? (
            <button
              type="button"
              className={`biz-scan-circle${torchOn ? ' is-on' : ''}`}
              onClick={toggleTorch}
              aria-label={torchOn ? 'Turn torch off' : 'Turn torch on'}
            >
              <BoltSvg />
            </button>
          ) : (
            <span className="biz-scan-circle biz-scan-void" aria-hidden="true" />
          ))}
      </header>

      {light ? (
        <div className="biz-scan-code">
          <p className="biz-scan-explainer">
            Every coupon has a code under its QR — NZ, then 7 characters. Type
            it exactly as the customer shows it.
          </p>
          <div className="biz-scan-coderow">
            <span className="biz-scan-nz">NZ</span>
            <input
              className="biz-scan-codeinput"
              value={part1}
              onChange={typePart1}
              maxLength={4}
              inputMode="text"
              autoComplete="off"
              spellCheck={false}
              aria-label="Coupon code, first 4 characters"
            />
            <span className="biz-scan-dash" aria-hidden="true">
              –
            </span>
            <input
              ref={part2Ref}
              className="biz-scan-codeinput"
              value={part2}
              onChange={typePart2}
              onKeyDown={onPart2Key}
              maxLength={3}
              inputMode="text"
              autoComplete="off"
              spellCheck={false}
              aria-label="Coupon code, last 3 characters"
            />
          </div>
          <button
            type="button"
            className="btn-danger biz-btn biz-scan-check"
            disabled={part1.length + part2.length < 7 || busy}
            onClick={checkCode}
          >
            Check code
          </button>
          {error && <p className="biz-scan-err">{error}</p>}

          {manualOffers.length > 0 && (
            <section className="biz-scan-manualsec">
              <h2>For “show screen” &amp; code offers</h2>
              <div className="biz-scan-manualcard">
                <p>
                  Customer showed the offer or said the code? Mark it below so
                  your count stays true. This doesn’t affect the customer.
                </p>
                {manualOffers.map((offer) => (
                  <button
                    key={offer.id}
                    type="button"
                    className="biz-scan-mark"
                    disabled={busy}
                    onClick={() => markManual(offer)}
                  >
                    <PlusSvg />
                    Mark 1 redeemed · {offer.title ?? 'Offer'}
                  </button>
                ))}
              </div>
            </section>
          )}
        </div>
      ) : (
        <div className="biz-scan-body">
          <div className={`biz-scan-frame${rear ? ' biz-scan-rear' : ''}`}>
            <video ref={videoRef} playsInline muted />
            {cam !== 'live' && (
              <div className="biz-scan-wait">
                <p>
                  {cam === 'starting'
                    ? 'Starting camera…'
                    : cam === 'denied'
                      ? 'Camera permission is off. Allow it in the browser, or use the code below — it does the same job.'
                      : 'No camera here. Use the code below — it does the same job.'}
                </p>
              </div>
            )}
            {cam === 'live' && (
              <>
                <span className="biz-scan-corner biz-scan-tl" aria-hidden="true" />
                <span className="biz-scan-corner biz-scan-tr" aria-hidden="true" />
                <span className="biz-scan-corner biz-scan-bl" aria-hidden="true" />
                <span className="biz-scan-corner biz-scan-br" aria-hidden="true" />
                <span className="biz-scan-laser" aria-hidden="true" />
              </>
            )}
          </div>
          <p className="biz-scan-hint">
            {detectorOk
              ? 'Point at the QR on the customer’s phone'
              : 'This browser can’t read QR codes — enter the code instead'}
          </p>
          <button
            type="button"
            className="biz-scan-manual"
            onClick={() => setMode('code')}
          >
            Enter code manually
          </button>
        </div>
      )}

      {sheet && (
        <div
          className="biz-scan-sheetwrap"
          onClick={(event) => {
            if (event.target === event.currentTarget) closeSheet()
          }}
        >
          <div
            className="biz-scan-sheet"
            role="alertdialog"
            aria-label={
              sheet.state === 'valid'
                ? 'Redeem coupon'
                : sheet.state === 'used'
                  ? 'Coupon already used'
                  : sheet.state === 'expired'
                    ? 'Coupon expired'
                    : sheet.state === 'foreign'
                      ? 'Not this shop’s coupon'
                      : 'Coupon not found'
            }
          >
            <span
              className={`biz-scan-sheeticon${sheet.state === 'valid' ? ' is-ok' : ''}`}
              aria-hidden="true"
            >
              {sheet.state === 'valid' ? <CheckSvg /> : <CloseSvg />}
            </span>
            <h2>
              {sheet.state === 'valid'
                ? 'Redeem coupon?'
                : sheet.state === 'used'
                  ? 'Already used'
                  : sheet.state === 'expired'
                    ? 'Expired'
                    : sheet.state === 'foreign'
                      ? 'Not this shop’s'
                      : 'Coupon not found'}
            </h2>
            <p className="biz-scan-sheetcode">{sheet.code}</p>
            {sheet.state === 'valid' && sheet.coupon && (
              <p className="biz-scan-sheetbody">
                {sheet.coupon.offerTitle}
                {sheet.coupon.discountLabel ? ` · ${sheet.coupon.discountLabel}` : ''}
                <br />
                Claimed {fmtStamp(new Date(sheet.coupon.claimedAt))}
              </p>
            )}
            {sheet.state === 'used' && sheet.coupon && (
              <p className="biz-scan-sheetbody">
                Redeemed
                {sheet.coupon.usedAt ? ` on ${fmtStamp(new Date(sheet.coupon.usedAt))}` : ''}
                . This coupon is single-use.
              </p>
            )}
            {sheet.state === 'expired' && (
              <p className="biz-scan-sheetbody">
                This coupon’s offer has ended. It can no longer be redeemed.
              </p>
            )}
            {sheet.state === 'foreign' && sheet.coupon && (
              <p className="biz-scan-sheetbody">
                This coupon was issued by {sheet.coupon.shopName}. Only the shop
                that made the offer can redeem it.
              </p>
            )}
            {sheet.state === 'notfound' && (
              <p className="biz-scan-sheetbody">
                No claimed coupon matches this code. Check it once more — or mark
                the redemption by hand if the customer showed the offer.
              </p>
            )}
            {sheet.state === 'valid' && sheet.coupon && (
              <button
                type="button"
                className="btn-primary biz-btn biz-scan-check"
                onClick={() => void redeemCoupon(sheet.coupon!)}
                disabled={busy}
              >
                {busy ? 'Redeeming…' : 'Redeem coupon'}
              </button>
            )}
            <button
              type="button"
              className="btn-danger biz-btn"
              onClick={closeSheet}
              disabled={busy}
            >
              {sheet.state === 'valid' ? 'Not now' : 'Scan another'}
            </button>
            {sheet.state !== 'valid' && (
              <button
                className="biz-scan-sheetlink"
                type="button"
                onClick={() => {
                  closeSheet()
                  setMode('code')
                }}
              >
                Count it manually instead
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
