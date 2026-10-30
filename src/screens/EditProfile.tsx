import { useCallback, useEffect, useState } from 'react'
import { BackSvg } from './Locate'
import { saveCustomer, watchCustomer, type CustomerProfile } from '../business/customer'
import './profile.css'

/** Edit profile screen — name, mobile, email (optional). Reads the current
    customer profile, lets the user edit each field, and persists on save.
    Mobile is shown read-only with a Verified badge since it's the account's
    anchor (changed via re-verification, not here). */

type Props = {
  uid: string
  /** After saving (or cancelling), return to the profile screen. */
  onDone: () => void
}

export default function EditProfile({ uid, onDone }: Props) {
  const [profile, setProfile] = useState<CustomerProfile | null>(null)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    const unsub = watchCustomer(uid, setProfile)
    return unsub
  }, [uid])

  useEffect(() => {
    setName(profile?.name ?? '')
    setEmail(profile?.email ?? '')
  }, [profile])

  const handleSave = useCallback(async () => {
    setError('')
    setSaving(true)
    try {
      const patch: { name?: string; email?: string } = {}
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

  if (!profile) {
    return (
      <main className="prof-edit">
        <header className="prof-edit-head">
          <button type="button" className="prof-back" onClick={onDone} aria-label="Back">
            <BackSvg />
          </button>
          <h1 className="prof-edit-title">Edit profile</h1>
        </header>
        <p className="prof-loading">Loading…</p>
      </main>
    )
  }

  return (
    <main className="prof-edit">
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
          <span className="prof-mobile-value">{profile.mobile ?? '—'}</span>
          {profile.mobile ? (
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
    </main>
  )
}
