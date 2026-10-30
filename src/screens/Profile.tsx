import { useEffect, useState } from 'react'
import type { User } from 'firebase/auth'
import {
  fetchCustomer,
  watchCustomer,
  type CustomerProfile,
} from '../business/customer'
import EditProfile from './EditProfile'
import './profile.css'

/** Profile screen — the "You" tab. Header card with the avatar, name, masked
    mobile and an edit pencil; stats chips (Saved / Coupons / Following);
    Activity list (Recently viewed, Redemption history, My savings, Invite
    friends); Preferences list (Notifications, Interests). Editing name or
    email opens the Edit profile screen and reflects back live. */

type Props = {
  /** When set, the signed-in Firebase user — used to read the profile. */
  user: User | null
  /** Return to the customer home (the You tab's own navigation). */
  onDone: () => void
}

function AvatarSvg() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="8" r="4" />
      <path d="M5 20c1.2-3.2 3.8-5 7-5s5.8 1.8 7 5" />
    </svg>
  )
}

function EditSvg() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18.5 1.5a.686.686 0 0 0-1 0l-4 4a.686.686 0 0 0 0 1l8.5 8.5a.686.686 0 0 0 1 0l4-4a.686.686 0 0 0 0-1z" />
    </svg>
  )
}

function ChevronSvg() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m6 9 6 6 6-6" />
    </svg>
  )
}

function ClockSvg() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  )
}

function TicketSvg() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 7v16a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 0z" />
      <path d="M17 2v2" />
      <path d="M7 2v2" />
      <path d="M21 12h-6" />
      <path d="M11 12H5" />
    </svg>
  )
}

function TagSvg() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 4H7a2 2 0 0 0-2 2v10l5-5 5 5V6a2 2 0 0 0 2-2z" />
    </svg>
  )
}

function PeopleSvg() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  )
}

function BellSvg() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  )
}

function StarSvg() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  )
}

function PinSvg() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 21s-6.5-5.4-6.5-10a6.5 6.5 0 1 1 13 0C18.5 15.6 12 21 12 21Z" />
      <circle cx="12" cy="11" r="2.4" />
    </svg>
  )
}

function GridSvg() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" aria-hidden="true">
      <rect x="4" y="4" width="7" height="7" rx="1.6" />
      <rect x="13" y="4" width="7" height="7" rx="1.6" />
      <rect x="4" y="13" width="7" height="7" rx="1.6" />
      <rect x="13" y="13" width="7" height="7" rx="1.6" />
    </svg>
  )
}

function BookmarkSvg() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7 4h10v17l-5-4.5L7 21Z" />
    </svg>
  )
}

export default function Profile({ user, onDone }: Props) {
  const [profile, setProfile] = useState<CustomerProfile | null>(null)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    if (!user) {
      setProfile(null)
      return
    }
    const unsub = watchCustomer(user.uid, setProfile)
    // Eagerly hydrate so the name/email reflect without waiting for a stream.
    void fetchCustomer(user.uid).then((p) => {
      if (p) setProfile(p)
    })
    return unsub
  }, [user?.uid])

  useEffect(() => {
    setName(profile?.name ?? '')
    setEmail(profile?.email ?? '')
  }, [profile])

  const maskedMobile = user?.phoneNumber ? maskPhone(user.phoneNumber.replace(/^\+91/, '')) : null
  const initial = (profile?.name ?? user?.displayName ?? '').trim().charAt(0).toUpperCase() || 'U'

  if (editing) {
    return (
      <EditProfile uid={user?.uid ?? ''} onDone={() => setEditing(false)} />
    )
  }

  return (
    <main className="profile">
      <header className="profile-head">
        <div className="profile-avatar">
          <span className="profile-avatar-mark">{initial}</span>
        </div>
        <div className="profile-identity">
          <h1 className="profile-name">{profile?.name ?? user?.displayName ?? 'You'}</h1>
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

      <section className="profile-stats">
        <div className="profile-stat">
          <span className="profile-stat-big">3</span>
          <span className="profile-stat-label">Saved</span>
        </div>
        <div className="profile-stat">
          <span className="profile-stat-big">1</span>
          <span className="profile-stat-label">Coupons</span>
        </div>
        <div className="profile-stat">
          <span className="profile-stat-big">2</span>
          <span className="profile-stat-label">Following</span>
        </div>
      </section>

      <section className="profile-section">
        <p className="profile-section-title">ACTIVITY</p>
        <ul className="profile-list">
          <li className="profile-list-item">
            <ClockSvg className="profile-list-icon" />
            <span className="profile-list-label">Recently viewed</span>
            <ChevronSvg className="profile-list-chevron" />
          </li>
          <li className="profile-list-item">
            <TicketSvg className="profile-list-icon" />
            <div className="profile-list-label-wrap">
              <span className="profile-list-label">Redemption history</span>
              <span className="profile-list-sub">Only shop-verified redemptions</span>
            </div>
            <ChevronSvg className="profile-list-chevron" />
          </li>
          <li className="profile-list-item">
            <TagSvg className="profile-list-icon" />
            <span className="profile-list-label">My savings</span>
            <ChevronSvg className="profile-list-chevron" />
          </li>
          <li className="profile-list-item">
            <PeopleSvg className="profile-list-icon" />
            <span className="profile-list-label">Invite friends</span>
            <ChevronSvg className="profile-list-chevron" />
          </li>
        </ul>
      </section>

      <section className="profile-section">
        <p className="profile-section-title">PREFERENCES</p>
        <ul className="profile-list">
          <li className="profile-list-item">
            <BellSvg className="profile-list-icon" />
            <div className="profile-list-label-wrap">
              <span className="profile-list-label">Notifications</span>
              <span className="profile-list-sub">Nearby offers, expiry reminders</span>
            </div>
            <ChevronSvg className="profile-list-chevron" />
          </li>
          <li className="profile-list-item">
            <StarSvg className="profile-list-icon" />
            <div className="profile-list-label-wrap">
              <span className="profile-list-label">Interests</span>
              <span className="profile-list-sub">Food, Mishti, Fashion</span>
            </div>
            <ChevronSvg className="profile-list-chevron" />
          </li>
        </ul>
      </section>
    </main>
  )
}
