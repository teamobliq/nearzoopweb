import { useEffect, useRef, useState } from 'react'
import { signOut } from 'firebase/auth'
import type { User } from 'firebase/auth'
import { auth } from '../firebase'
import {
  fetchCustomer,
  watchCustomer,
  type CustomerProfile,
} from '../business/customer'
import {
  listMyRedemptions,
  reportRedemption,
  type RedemptionRecord,
} from '../business/redemptions'
import { maskPhone } from './maskPhone'
import EditProfile from './EditProfile'
import './profile.css'

/** Profile screen — the "You" tab. */

type Props = {
  user: User | null
  onSignOut: () => void
  /** Opens the customer's coupons wallet (full page). */
  onOpenCoupons: () => void
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

function FlagSvg() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 4h16v16H4Z" />
      <path d="M7 7h10l-2 5 2 5-5-3-5 3 1-5-1-5Z" />
    </svg>
  )
}

/** "31 Oct, 4:20 pm" — the history row's timestamp. */
function fmtRedAt(r: RedemptionRecord): string {
  const d = new Date(r.at.seconds * 1000)
  if (Number.isNaN(d.getTime())) return ''
  const day = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
  const time = d
    .toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })
    .toLowerCase()
  return `${day}, ${time}`
}

export default function Profile({ user, onSignOut, onOpenCoupons }: Props) {
  const uid = user?.uid ?? null
  const [profile, setProfile] = useState<CustomerProfile | null>(null)
  const [editing, setEditing] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const [redemptions, setRedemptions] = useState<RedemptionRecord[]>([])
  const [loadingRedemptions, setLoadingRedemptions] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
  const [reportOfferId, setReportOfferId] = useState('')
  const [reportTitle, setReportTitle] = useState('')
  const [reportAt, setReportAt] = useState('')
  const [reportNote, setReportNote] = useState('')
  const [reportBusy, setReportBusy] = useState(false)
  const [reportDone, setReportDone] = useState(false)
  const [reportError, setReportError] = useState('')
  // The redemptions loader skips a refetch once a report has been filed —
  // read via a ref so the fetch effect doesn't re-subscribe on the flag.
  const reportDoneRef = useRef(false)
  useEffect(() => {
    reportDoneRef.current = reportDone
  })

  // A signed-out viewer sees the signed-out state even if a previous
  // profile is still in state.
  const shownProfile = user ? profile : null

  useEffect(() => {
    if (!uid) return
    const unsub = watchCustomer(uid, setProfile)
    void fetchCustomer(uid).then((p) => {
      if (p) setProfile(p)
    })
    return unsub
  }, [uid])

  useEffect(() => {
    if (!uid || reportDoneRef.current) return
    setLoadingRedemptions(true)
    void listMyRedemptions(uid)
      .then((records) => setRedemptions(records))
      .catch(() => setRedemptions([]))
      .finally(() => setLoadingRedemptions(false))
  }, [uid])

  /** Opens the report form — coupon code is pasted by hand since the wallet
      now lives on its own page. */
  async function reportMissing(): Promise<void> {
    if (!user) return
    setReportError('')
    setReportDone(false)
    setReportOpen(true)
  }

  async function submitReport(): Promise<void> {
    if (!user || reportBusy) return
    setReportBusy(true)
    setReportError('')
    try {
      await reportRedemption({
        customerUid: user.uid,
        offerId: reportOfferId,
        offerTitle: reportTitle,
        shopUid: '',
        shopName: '',
        at: reportAt,
        note: reportNote,
      })
      setReportDone(true)
    } catch (error) {
      setReportError(error instanceof Error ? error.message : 'Could not send.')
    } finally {
      setReportBusy(false)
    }
  }

  async function handleSignOut(): Promise<void> {
    setSigningOut(true)
    try {
      await signOut(auth)
    } catch {
      // Ignore — the redirect listener will clean up anyway.
    } finally {
      setSigningOut(false)
      onSignOut()
    }
  }

  return (
    <main className="profile">
      <header className="profile-head">
        <div className="profile-avatar">{user ? user.email?.[0]?.toUpperCase() ?? 'U' : 'U'}</div>
        <div className="profile-identity">
          <p className="profile-eyebrow">Account</p>
          <h1 className="profile-name">{shownProfile?.name ?? 'Customer'}</h1>
          <p className="profile-mobile">{shownProfile?.mobile ?? ''}</p>
          <p className="profile-mobile">{shownProfile?.email ?? ''}</p>
        </div>
        <button
          type="button"
          className="profile-edit"
          disabled={editing}
          onClick={() => setEditing(true)}
        >
          <EditSvg />
        </button>
      </header>

      {editing && user && (
        <div className="profile-edit-backdrop">
          <EditProfile
            uid={user.uid}
            accountName={user.displayName ?? undefined}
            accountEmail={user.email ?? undefined}
            mobile={
              user.phoneNumber
                ? maskPhone(user.phoneNumber.replace(/^\+91/, ''))
                : undefined
            }
            verified={user.phoneNumber ? true : undefined}
            onDone={() => setEditing(false)}
          />
        </div>
      )}

      <section className="profile-section">
        <h2 className="profile-section-title">Claimed coupons</h2>
        <button
          type="button"
          className="profile-coupons"
          onClick={onOpenCoupons}
        >
          <TicketSvg />
          Open coupons wallet
        </button>
      </section>

      <section className="profile-section">
        <h2 className="profile-section-title">Redemption history</h2>
        {loadingRedemptions ? (
          <p className="profile-muted">Loading…</p>
        ) : redemptions.length === 0 ? (
          <p className="profile-muted">No redemptions yet.</p>
        ) : (
          <ul className="profile-redlist">
            {redemptions.map((r) => (
              <li key={r.id} className="profile-redrow">
                <div className="profile-red-main">
                  <span className="profile-red-title">{r.offerTitle}</span>
                  <span className="profile-red-sub">
                    {r.shopName} · {fmtRedAt(r)}
                  </span>
                </div>
                <span className="profile-red-value">{r.value ?? '—'}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="profile-section">
        <h2 className="profile-section-title">Report a missing redemption</h2>
        <p className="profile-section-note">
          If you used a coupon and the shop never confirmed it, tell us the
          coupon code and what happened. We’ll pass it to the shop.
        </p>
        <button
          type="button"
          className="profile-redreport"
          disabled={reportBusy}
          onClick={() => void reportMissing()}
        >
          <FlagSvg />
          Report a missing redemption
        </button>
      </section>

      <section className="profile-section">
        <button
          type="button"
          className="profile-signout"
          disabled={signingOut}
          onClick={handleSignOut}
        >
          <ExitSvg />
          {signingOut ? 'Signing out…' : 'Sign out'}
        </button>
      </section>

      {reportOpen && (
        <div
          className="profile-coupondialog-backdrop"
          onClick={(event) => {
            if (event.target === event.currentTarget) setReportOpen(false)
          }}
        >
          <div
            className="profile-coupondialog"
            role="dialog"
            aria-modal="true"
            aria-label="Report a missing redemption"
          >
            <header className="profile-coupondialog-head">
              <h2>Report a missing redemption</h2>
              <button
                type="button"
                className="profile-coupondialog-close"
                onClick={() => setReportOpen(false)}
                aria-label="Close"
              >
                ×
              </button>
            </header>
            {reportDone ? (
              <div className="profile-report-done">
                <p>
                  Sent. The shop will see your report and can confirm the
                  redemption from their records.
                </p>
                <button
                  type="button"
                  className="btn-secondary profile-report-btn"
                  onClick={() => setReportOpen(false)}
                >
                  Done
                </button>
              </div>
            ) : (
              <div className="profile-report-form">
                <label className="profile-report-field">
                  <span>Coupon code</span>
                  <input
                    type="text"
                    value={reportOfferId}
                    onChange={(event) => setReportOfferId(event.target.value)}
                    placeholder="Paste the coupon code, e.g. NZ-7Q4K-29XB"
                  />
                </label>
                <label className="profile-report-field">
                  <span>Offer title</span>
                  <input
                    type="text"
                    value={reportTitle}
                    onChange={(event) => setReportTitle(event.target.value)}
                    placeholder="e.g. ₹50 off biryani"
                  />
                </label>
                <label className="profile-report-field">
                  <span>When was it redeemed?</span>
                  <input
                    type="date"
                    value={reportAt}
                    onChange={(event) => setReportAt(event.target.value)}
                  />
                </label>
                <label className="profile-report-field">
                  <span>What happened?</span>
                  <textarea
                    rows={3}
                    value={reportNote}
                    onChange={(event) => setReportNote(event.target.value)}
                    placeholder="e.g. showed the coupon at the counter, they said it was applied"
                  />
                </label>
                {reportError && (
                  <p className="profile-report-err">{reportError}</p>
                )}
                <button
                  type="button"
                  className="btn-primary profile-report-btn"
                  disabled={reportBusy}
                  onClick={() => void submitReport()}
                >
                  {reportBusy ? 'Sending…' : 'Send report'}
                </button>
                <button
                  type="button"
                  className="btn-secondary profile-report-btn"
                  onClick={() => setReportOpen(false)}
                >
                  Never mind
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  )
}
