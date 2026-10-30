import { useCallback, useEffect, useState } from 'react'
import { BackSvg } from './Locate'
import { maskPhone } from './AuthFlow'
import {
  fetchCustomer,
  saveCustomer,
  watchCustomer,
  type CustomerProfile,
} from '../business/customer'
import './profile.css'

/** Format a stored mobile (E.164, spaced, or bare digits) the way the auth
    flow does. */
function storedMobile(raw: string | null | undefined): string | null {
  if (!raw) return null
  const digits = raw.replace(/\D/g, '')
  if (!digits) return null
  return maskPhone(digits.slice(-10))
}

/** Edit profile screen — name, mobile, email (optional). Reads the current
    customer profile, lets the user edit each field, and persists on save.
    Mobile is shown read-only with a Verified badge since it's the account's
    anchor (changed via re-verification, not here).

    A customer doc only exists after the first save, so a missing doc is a
    normal state: the form opens empty (mobile filled from the signed-in
    account) instead of waiting on a snapshot that will never carry data. */

type Props = {
  uid: string
  /** Account-level identity (Firebase Auth), used until the customers doc
      exists — the profile screen already shows it, so the form must too. */
  accountName?: string
  accountEmail?: string
  /** Masked account mobile — shown when the customers doc has none yet. */
  mobile?: string | null
  /** The signed-in account's mobile is verified even without a doc. */
  verified?: boolean
  /** After saving (or cancelling), return to the profile screen. */
  onDone: () => void
}

export default function EditProfile({
  uid,
  accountName,
  accountEmail,
  mobile,
  verified,
  onDone,
}: Props) {
  const [profile, setProfile] = useState<CustomerProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    let alive = true
    // The stream resolves both cases — a doc, or none at all. The eager read
    // just fills the fields sooner on a cold start.
    const unsub = watchCustomer(uid, (next) => {
      if (!alive) return
      setProfile(next)
      setLoading(false)
    })
    void fetchCustomer(uid)
      .then((next) => {
        if (!alive) return
        setProfile(next)
        setLoading(false)
      })
      .catch(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
      unsub()
    }
  }, [uid])

  useEffect(() => {
    setName(profile?.name ?? accountName ?? '')
    setEmail(profile?.email ?? accountEmail ?? '')
  }, [profile, accountName, accountEmail])

  const handleSave = useCallback(async () => {
    setError('')
    setSaving(true)
    try {
      const patch: { name?: string | null; email?: string | null } = {}
      const nameTrimmed = name.trim()
      if (nameTrimmed !== (profile?.name ?? '').trim()) patch.name = nameTrimmed || null
      const emailTrimmed = email.trim()
      if (emailTrimmed !== (profile?.email ?? '').trim()) patch.email = emailTrimmed || null
      if (Object.keys(patch).length > 0) {
        await saveCustomer(uid, patch)
      }
      setSaved(true)
      window.setTimeout(onDone, 600)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save changes. Try again.')
    } finally {
      setSaving(false)
    }
  }, [uid, name, email, profile, onDone])

  if (loading) {
    return (
      <div className="prof-edit">
        <header className="prof-edit-head">
          <button type="button" className="prof-back" onClick={onDone} aria-label="Back">
            <BackSvg />
          </button>
          <h1 className="prof-edit-title">Edit profile</h1>
        </header>
        <p className="prof-loading">Loading…</p>
      </div>
    )
  }

  const shownMobile = storedMobile(profile?.mobile) ?? mobile ?? null
  const shownVerified = verified === true || profile?.verified === true

  return (
    <div className="prof-edit">
      <header className="prof-edit-head">
        <button type="button" className="prof-back" onClick={onDone} aria-label="Back">
          <BackSvg />
        </button>
        <h1 className="prof-edit-title">Edit profile</h1>
      </header>

      <div className="prof-edit-body">
        <label className="prof-field-label">NAME</label>
        <input
          className="prof-field"
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Your name"
          autoComplete="name"
        />

        <label className="prof-field-label">MOBILE</label>
        <div className="prof-mobile">
          <span className="prof-mobile-value">{shownMobile ?? '—'}</span>
          {shownMobile && shownVerified ? (
            <span className="prof-verified">Verified</span>
          ) : null}
        </div>

        <label className="prof-field-label">EMAIL (OPTIONAL)</label>
        <input
          className="prof-field"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="For receipts from support"
          autoComplete="email"
        />

        <p className="prof-fine">
          We only ask for what's needed to sync saved offers and verify
          coupons. No birthday, gender or address.
        </p>

        {error && (
          <p className="prof-error" role="alert">
            {error}
          </p>
        )}

        <button
          type="button"
          className="btn-primary prof-save"
          disabled={saving || saved}
          onClick={handleSave}
        >
          {saving ? 'Saving…' : saved ? 'Saved' : 'Save changes'}
        </button>
      </div>
    </div>
  )
}
