import { useEffect, useState } from 'react'
import { type User } from 'firebase/auth'
import {
  couponState,
  fmtCouponCode,
  listMyCoupons,
  type CouponRecord,
} from '../business/coupons'
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
  user: User | null
  onBack: () => void
  onOpenPass?: (coupon: CouponRecord) => void
}

export default function MyCoupons({
  user,
  onBack,
  onOpenPass,
}: Props) {
  const uid = user?.uid ?? null
  const [coupons, setCoupons] = useState<CouponRecord[]>([])
  // Signed-out viewers never see the loading state — start ready when
  // there's no uid to fetch for.
  const [loading, setLoading] = useState(() => uid !== null)
  const [filter, setFilter] = useState<
    'all' | 'available' | 'used' | 'expired' | 'revoked'
  >('all')

  useEffect(() => {
    if (!uid) return
    let cancelled = false
    void listMyCoupons(uid)
      .then((records) => {
        if (cancelled) return
        setCoupons(records)
      })
      .catch(() => {
        if (!cancelled) setCoupons([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [uid])

  // A signed-out viewer sees the empty wallet even if a previous session's
  // coupons are still in state.
  const shownCoupons = user ? coupons : []

  const filtered = shownCoupons.filter((c) => {
    const state = couponState(c)
    if (filter === 'all') return true
    if (filter === 'available') return state === 'valid'
    if (filter === 'used') return state === 'used'
    if (filter === 'expired') return state === 'expired'
    return state === 'revoked'
  })

  const chips: Array<{ key: typeof filter; label: string }> = [
    { key: 'all', label: 'All' },
    { key: 'available', label: 'Available' },
    { key: 'used', label: 'Used' },
    { key: 'expired', label: 'Expired' },
    { key: 'revoked', label: 'Revoked' },
  ]

  if (loading && user) {
    return (
      <div className="myc-page">
        <div className="myc-shell">
          <div className="myc-topbar">
            <button
              type="button"
              className="myc-back"
              onClick={onBack}
              aria-label="Go back"
            >
              <BackSvg />
            </button>
            <h1 className="myc-title">Claimed coupons</h1>
          </div>
          <p className="myc-sub">Loading your coupons…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="myc-page">
      <div className="myc-shell">
        <div className="myc-topbar">
          <button
            type="button"
            className="myc-back"
            onClick={onBack}
            aria-label="Go back"
          >
            <BackSvg />
          </button>
          <h1 className="myc-title">Claimed coupons</h1>
        </div>
        <p className="myc-sub">
          Single-use coupons you’ve claimed. Show the pass at the counter.
        </p>

        <div className="myc-chips">
          {chips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              className={`myc-chip${filter === chip.key ? ' is-on' : ''}`}
              onClick={() => setFilter(chip.key)}
            >
              {chip.label}
            </button>
          ))}
        </div>

        <div className="myc-list">
          {filtered.length === 0 ? (
            <div className="myc-empty">
              <h2>No coupons here.</h2>
              <p>
                Claim an offer from its page and it waits here until it’s
                used or expires.
              </p>
            </div>
          ) : (
            filtered.map((c) => {
              const state = couponState(c)
              const isValid = state === 'valid'
              const meta =
                c.discountLabel && c.offerTitle
                  ? `${c.offerTitle} · ${c.discountLabel}`
                  : c.offerTitle
              return (
                <button
                  key={c.code}
                  type="button"
                  className={`myc-row${isValid ? '' : ' is-past'}`}
                  onClick={() => void onOpenPass?.(c)}
                >
                  <div className="myc-row-main">
                    <span className="myc-row-code">{fmtCouponCode(c.code)}</span>
                    <p className="myc-row-meta">{meta}</p>
                  </div>
                  <span className={`myc-row-state state-${state}`}>
                    {isValid ? 'Available' : state === 'used' ? 'Used' : state === 'expired' ? 'Expired' : 'Revoked'}
                  </span>
                </button>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}