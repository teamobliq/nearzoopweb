import { useEffect, useState } from 'react'
import { signOut } from 'firebase/auth'
import type { User } from 'firebase/auth'
import { auth } from '../firebase'
import {
  fetchCustomer,
  watchCustomer,
  type CustomerProfile,
} from '../business/customer'
import {
  couponState,
  listMyCoupons,
  type CouponRecord,
} from '../business/coupons'
import { maskPhone } from './AuthFlow'
import EditProfile from './EditProfile'
import './profile.css'

/** Profile screen — the "You" tab. */

type Props = {
  user: User | null
  onSignOut: () => void
}

function EditSvg() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M16.5 3.5l4 4L7.5 20.5H3.5v-4L16.5 3.5Z" />
      <path d="M13.5 6.5l4 4" />
    </svg>
  )
}

function ExitSvg() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M15 4h3.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H15" />
      <path d="M10 8l-4 4 4 4" />
      <path d="M6 12h10" />
    </svg>
  )
}

function TicketSvg() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 9V7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a2 2 0 0 0 0 6v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-6Z" />
      <path d="M13 5.5v2M13 11v2M13 16.5v2" />
    </svg>
  )
}

export default function Profile({ user, onSignOut }: Props) {
  const [profile, setProfile] = useState<CustomerProfile | null>(null)
  const [editing, setEditing] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const [couponsOpen, setCouponsOpen] = useState(false)
  const [coupons, setCoupons] = useState<CouponRecord[]>([])
  const [loadingCoupons, setLoadingCoupons] = useState(false)
  const [filter, setFilter] = useState<'all' | 'available' | 'used' | 'expired'>('all')
  const [selected, setSelected] = useState<CouponRecord | null>(null)
  const [selectedQr, setSelectedQr] = useState('')

  useEffect(() => {
    if (!user) {
      setProfile(null)
      return
    }
    const unsub = watchCustomer(user.uid, setProfile)
    void fetchCustomer(user.uid).then((p) => {
      if (p) setProfile(p)
    })
    return unsub
  }, [user?.uid])

  useEffect(() => {
    if (!couponsOpen || !user) return
    setLoadingCoupons(true)
    void listMyCoupons(user.uid)
      .then((records) => setCoupons(records))
      .catch(() => setCoupons([]))
      .finally(() => setLoadingCoupons(false))
  }, [couponsOpen, user?.uid])

  useEffect(() => {
    if (!selected) {
      setSelectedQr('')
      return
    }
    let alive = true
    void import('qrcode')
      .then((qr) => qr.toString(selected.code, { type: 'svg', margin: 1, width: 200 }))
      .then((svg) => {
        if (alive) setSelectedQr(svg)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [selected])

  const accountName = profile?.name ?? user?.displayName ?? ''
  const name = accountName || 'You'
  const email = profile?.email ?? user?.email ?? ''
  const rawMobile = user?.phoneNumber ?? profile?.mobile ?? ''
  const mobileDigits = rawMobile.replace(/\D/g, '')
  const maskedMobile = mobileDigits ? maskPhone(mobileDigits.slice(-10)) : null
  const verified = user?.phoneNumber ? true : profile?.verified === true
  const initial = name.trim().charAt(0).toUpperCase() || 'U'

  if (editing) {
    return (
      <EditProfile
        uid={user?.uid ?? ''}
        accountName={accountName}
        accountEmail={user?.email ?? ''}
        mobile={maskedMobile}
        verified={verified}
        onDone={() => setEditing(false)}
      />
    )
  }

  async function handleSignOut(): Promise<void> {
    if (signingOut) return
    setSigningOut(true)
    try {
      await signOut(auth)
    } catch {
      // The session callback still clears local state below.
    }
    setSigningOut(false)
    onSignOut()
  }

  return (
    <div className="profile" role="region" aria-label="Your profile">
      <header className="profile-head">
        <span className="profile-avatar" aria-hidden="true">
          {initial}
        </span>
        <div className="profile-identity">
          <p className="profile-eyebrow">Your account</p>
          <h1 className="profile-name">{name}</h1>
          <p className="profile-mobile">{maskedMobile ?? 'No mobile'}</p>
        </div>
        <button
          type="button"
          className="profile-edit"
          aria-label="Edit profile"
          onClick={() => setEditing(true)}
        >
          <EditSvg />
        </button>
      </header>

      <section className="profile-section">
        <h2 className="profile-section-title">ACCOUNT</h2>
        <dl className="profile-card">
          <div className="profile-row">
            <dt>Name</dt>
            <dd>{name}</dd>
          </div>
          <div className="profile-row">
            <dt>Mobile</dt>
            <dd>
              {maskedMobile ?? <span className="profile-muted">Not set</span>}
              {verified && <span className="profile-badge">Verified</span>}
            </dd>
          </div>
          <div className="profile-row">
            <dt>Email</dt>
            <dd>
              {email || <span className="profile-muted">Not added</span>}
            </dd>
          </div>
        </dl>
      </section>

      <button
        type="button"
        className="profile-coupons"
        onClick={() => setCouponsOpen(true)}
      >
        <TicketSvg />
        Claimed coupons
      </button>

      <button
        type="button"
        className="profile-signout"
        onClick={() => void handleSignOut()}
        disabled={signingOut}
      >
        <ExitSvg />
        {signingOut ? 'Signing out…' : 'Sign out'}
      </button>

      {couponsOpen && (
        <div
          className="profile-coupondialog-backdrop"
          onClick={(event) => {
            if (event.target === event.currentTarget) setCouponsOpen(false)
          }}
        >
          <div className="profile-coupondialog" role="dialog" aria-modal="true" aria-label="Claimed coupons">
            <header className="profile-coupondialog-head">
              <h2>Claimed coupons</h2>
              <button
                type="button"
                className="profile-coupondialog-close"
                onClick={() => setCouponsOpen(false)}
                aria-label="Close"
              >
                ×
              </button>
            </header>
            <div className="profile-couponchips">
              {(['all', 'available', 'used', 'expired'] as const).map((key) => (
                <button
                  key={key}
                  type="button"
                  className={`profile-couponchip${filter === key ? ' is-on' : ''}`}
                  onClick={() => setFilter(key)}
                >
                  {key === 'all'
                    ? 'All'
                    : key === 'available'
                      ? 'Available'
                      : key === 'used'
                        ? 'Used'
                        : 'Expired'}
                </button>
              ))}
            </div>
            <div className="profile-couponlist">
              {loadingCoupons ? (
                <p className="profile-muted">Loading…</p>
              ) : coupons.filter((c) => {
                  const state = couponState(c)
                  if (filter === 'all') return true
                  if (filter === 'available') return state === 'valid'
                  if (filter === 'used') return state === 'used'
                  return state === 'expired'
                }).length === 0 ? (
                <p className="profile-muted">No coupons here.</p>
              ) : (
                coupons
                  .filter((c) => {
                    const state = couponState(c)
                    if (filter === 'all') return true
                    if (filter === 'available') return state === 'valid'
                    if (filter === 'used') return state === 'used'
                    return state === 'expired'
                  })
                  .map((c) => (
                    <button
                      key={c.code}
                      type="button"
                      className={`profile-couponrow${couponState(c) === 'valid' ? '' : ' is-past'}`}
                      onClick={() => setSelected(c)}
                    >
                      <span className="profile-couponrow-code">{c.code}</span>
                      <span className="profile-couponrow-meta">
                        {c.offerTitle}
                        {c.discountLabel ? ` · ${c.discountLabel}` : ''}
                      </span>
                      <span className={`profile-couponrow-state state-${couponState(c)}`}>
                        {couponState(c) === 'valid'
                          ? 'Available'
                          : couponState(c) === 'used'
                            ? 'Used'
                            : 'Expired'}
                      </span>
                    </button>
                  ))
              )}
            </div>
          </div>
        </div>
      )}

      {selected && (
        <div
          className="profile-coupondialog-backdrop"
          onClick={(event) => {
            if (event.target === event.currentTarget) setSelected(null)
          }}
        >
          <div className="profile-coupondialog" role="dialog" aria-modal="true" aria-label="Coupon">
            <header className="profile-coupondialog-head">
              <h2>{selected.offerTitle}</h2>
              <button
                type="button"
                className="profile-coupondialog-close"
                onClick={() => setSelected(null)}
                aria-label="Close"
              >
                ×
              </button>
            </header>
            <div className="profile-couponpass">
              <div className="profile-couponpass-qr">
                {selectedQr ? (
                  <span dangerouslySetInnerHTML={{ __html: selectedQr }} />
                ) : (
                  <span className="cust-pass-qrwait" aria-hidden="true" />
                )}
              </div>
              <p className="profile-couponpass-code">{selected.code}</p>
              <p className="profile-couponpass-note">
                {couponState(selected) === 'used'
                  ? `Redeemed${selected.usedAt ? ` on ${selected.usedAt.slice(0, 16).replace('T', ' ')}` : ''}.`
                  : couponState(selected) === 'expired'
                    ? 'This coupon expired with the offer.'
                    : 'Single use. Show it at the counter — the shop scans it.'}
              </p>
              {selected.endsAt && couponState(selected) === 'valid' && (
                <p className="profile-couponpass-meta">
                  Valid till {selected.endsAt.slice(0, 16).replace('T', ' ')}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
