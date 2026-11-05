import { useEffect, useState } from 'react'
import { type CouponRecord, couponState } from '../business/coupons'
import './customer.css'

function BackSvg() {
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
      <path d="M15 5l-7 7 7 7" />
    </svg>
  )
}

type Props = {
  coupon: CouponRecord
  onBack: () => void
}

export default function CouponPass({ coupon, onBack }: Props) {
  const [qr, setQr] = useState('')

  useEffect(() => {
    let alive = true
    void import('qrcode')
      .then((qrLib) =>
        qrLib.toString(coupon.code, { type: 'svg', margin: 1, width: 260 }),
      )
      .then((svg) => {
        if (alive) setQr(svg)
      })
      .catch(() => {
        // The printed code below works without the QR.
      })
    return () => {
      alive = false
    }
  }, [coupon.code])

  const state = couponState(coupon)
  const isValid = state === 'valid'

  function redeemLine(): string {
    switch (state) {
      case 'used':
        return `Used${coupon.usedAt ? ` on ${coupon.usedAt.slice(0, 16).replace('T', ' ')}` : ''}.`
      case 'revoked':
        return 'The shop revoked this coupon — it can no longer be redeemed.'
      case 'expired':
        return 'This coupon expired with the offer.'
      default:
        return 'Single use. Show it at the counter — the shop scans it.'
    }
  }

  return (
    <div className="cpass-page">
      <div className="cpass-shell">
        <div className="cpass-topbar">
          <button
            type="button"
            className="cpass-back"
            onClick={onBack}
            aria-label="Go back"
          >
            <BackSvg />
          </button>
          <h1 className="cpass-title">{coupon.offerTitle}</h1>
        </div>

        <section className="cpass-card">
          <p className="cpass-brand">NearZoop · Coupon</p>
          <div className="cpass-qrwrap">
            {qr ? (
              <span className="cpass-qr" dangerouslySetInnerHTML={{ __html: qr }} />
            ) : (
              <span className="cpass-qrwait" aria-hidden="true" />
            )}
            <p className="cpass-code">{coupon.code}</p>
            <p className="cpass-note">{redeemLine()}</p>
            {coupon.endsAt && isValid && (
              <p className="cpass-meta">
                Valid till {coupon.endsAt.slice(0, 16).replace('T', ' ')}
              </p>
            )}
          </div>
        </section>

        <div className="cpass-actions">
          <button
            type="button"
            className="btn-primary biz-btn"
            onClick={onBack}
          >
            Back to coupons
          </button>
        </div>
      </div>
    </div>
  )
}