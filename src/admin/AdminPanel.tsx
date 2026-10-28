import { useEffect, useMemo, useState } from 'react'
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from 'firebase/auth'
import { auth } from '../firebase'
import {
  approvedStatus,
  deleteOffer,
  setOfferStatus,
  setVerification,
  watchAllShops,
  watchShopOffers,
  type AdminOfferEntry,
  type AdminShopEntry,
  type OfferRecord,
} from '../business/shop'
import AdminOverview from './AdminOverview'
import AdminOffers from './AdminOffers'
import AdminShops from './AdminShops'
import '../screens/auth.css'
import './admin.css'

const FALLBACK = 'Something went wrong. Please try again.'

const ERROR_MESSAGES: Record<string, string> = {
  'popup-blocked':
    'The sign-in popup was blocked. Allow popups for this site and try again.',
  'popup-closed-by-user': 'Sign-in was cancelled before it finished.',
  'cancelled-popup-request': 'Only one sign-in window can be open at a time.',
  'unauthorized-domain':
    "This domain isn't authorized for sign-in. Add it in the Firebase console under Authentication → Settings → Authorized domains.",
  'operation-not-allowed':
    "Google sign-in isn't enabled for this project in the Firebase console yet.",
  'network-request-failed': 'Network trouble. Check your connection and try again.',
}

function errorCode(err: unknown): string | null {
  if (typeof err === 'object' && err !== null && 'code' in err) {
    return String((err as { code: unknown }).code).replace(/^auth\//, '')
  }
  return null
}

function describe(err: unknown): string {
  const code = errorCode(err)
  if (code === null && err instanceof Error && err.message) {
    return err.message
  }
  const mapped = code !== null && ERROR_MESSAGES[code]
  // Unmapped codes surface in parentheses — easiest way to debug a new one.
  return mapped || (code ? `${FALLBACK} (${code})` : FALLBACK)
}

/**
 * The admin allow-list: Google account addresses that may open this console,
 * comma separated in VITE_ADMIN_EMAILS. Empty or missing means NOBODY gets
 * in — by design. The lock screen shows the visitor's own address so the
 * owner can add themselves.
 */
const ADMIN_EMAILS = ((import.meta.env.VITE_ADMIN_EMAILS as string | undefined) ?? '')
  .split(',')
  .map((entry) => entry.trim().toLowerCase())
  .filter(Boolean)

function isAdminEmail(email: string | null): boolean {
  return email !== null && ADMIN_EMAILS.includes(email.toLowerCase())
}

/** The official four-colour G, same as the customer sign-in button. */
function GoogleIcon() {
  return (
    <svg className="auth-icon" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  )
}

type Tab = 'overview' | 'shops' | 'offers'

const TAB_LABEL: Record<Tab, string> = {
  overview: 'Overview',
  shops: 'Shops',
  offers: 'Offers',
}

/** The secret ops console at /nz-admin: Google sign-in gated by an env
    allow-list, then a live view over every shop and offer. */
export default function AdminPanel() {
  const [booting, setBooting] = useState(true)
  const [signedIn, setSignedIn] = useState(false)
  const [authorized, setAuthorized] = useState(false)

  const [signing, setSigning] = useState(false)
  const [error, setError] = useState('')

  // Panel data — null until the first Firestore snapshot lands.
  const [tab, setTab] = useState<Tab>('overview')
  const [shops, setShops] = useState<AdminShopEntry[] | null>(null)
  // Offers arrive per shop — scoped subcollection queries (collection-group
  // queries are gated by the broadest matching rule, the /{document=**}
  // catch-all, which proved fragile) — and merge into one list here.
  const [offersByShop, setOffersByShop] = useState<Map<string, OfferRecord[]>>(
    () => new Map(),
  )
  // The feeds retry on failure; these surface why instead of an endless
  // "Loading…" (empty = snapshots are landing).
  const [shopsError, setShopsError] = useState('')
  const [offerErrors, setOfferErrors] = useState<Map<string, string>>(
    () => new Map(),
  )

  useEffect(() => {
    return onAuthStateChanged(auth, (user) => {
      setSignedIn(Boolean(user))
      setAuthorized(isAdminEmail(user?.email ?? null))
      setBooting(false)
    })
  }, [])

  useEffect(() => {
    if (!authorized) return
    return watchAllShops(setShops, (message) => setShopsError(message ?? ''))
  }, [authorized])

  // One subscription per known shop; re-subscribes only when the set of
  // shop uids changes (the joined string keeps the effect stable).
  const shopUids = (shops ?? []).map((entry) => entry.uid).join(',')

  useEffect(() => {
    if (!authorized || !shopUids) return
    const unsubs = shopUids.split(',').map((uid) =>
      watchShopOffers(
        uid,
        (list) =>
          setOffersByShop((prev) => {
            const next = new Map(prev)
            next.set(uid, list)
            return next
          }),
        (message) =>
          setOfferErrors((prev) => {
            const next = new Map(prev)
            if (message === null) next.delete(uid)
            else next.set(uid, message)
            return next
          }),
      ),
    )
    return () => unsubs.forEach((unsub) => unsub())
  }, [authorized, shopUids])

  // Merged, newest first across shops.
  const offers = useMemo<AdminOfferEntry[] | null>(() => {
    if (shops === null) return null
    const entries: AdminOfferEntry[] = []
    for (const [uid, list] of offersByShop) {
      for (const offer of list) entries.push({ shopUid: uid, offer })
    }
    entries.sort((a, b) =>
      (b.offer.createdAt ?? '').localeCompare(a.offer.createdAt ?? ''),
    )
    return entries
  }, [shops, offersByShop])

  async function signInGoogle(): Promise<void> {
    setError('')
    setSigning(true)
    try {
      // Replaces any existing session (e.g. a phone sign-in from the
      // merchant flow) with the chosen Google account.
      await signInWithPopup(auth, new GoogleAuthProvider())
      // The auth listener flips the screen once the sign-in lands.
    } catch (err) {
      setError(describe(err))
    } finally {
      setSigning(false)
    }
  }

  async function leave(): Promise<void> {
    await signOut(auth).catch(() => undefined)
    setError('')
  }

  if (booting) {
    return (
      <main className="admin-page">
        <p className="admin-boot">Checking access…</p>
      </main>
    )
  }

  // ---- Gate: not signed in ------------------------------------------------
  if (!signedIn) {
    return (
      <main className="admin-page">
        <div className="admin-gateshell">
          <span className="admin-locktag">NZ · OPS</span>
          <h1 className="auth-title">Restricted</h1>
          <p className="auth-sub">
            This console is private. Sign in with the Google account that's on
            the allow-list.
          </p>
          <button
            type="button"
            className="btn-secondary"
            disabled={signing}
            onClick={() => void signInGoogle()}
          >
            <GoogleIcon />
            {signing ? 'Opening…' : 'Sign in with Google'}
          </button>
          {error && (
            <p className="auth-error" role="alert">
              {error}
            </p>
          )}
        </div>
      </main>
    )
  }

  // ---- Gate: signed in but not on the allow-list --------------------------
  if (!authorized) {
    const email = auth.currentUser?.email ?? null
    return (
      <main className="admin-page">
        <div className="admin-gateshell">
          <span className="admin-locktile" aria-hidden="true">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="#FFFFFF"
              strokeWidth={2.4}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="4.5" y="10.5" width="15" height="10" rx="2.5" />
              <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
            </svg>
          </span>
          <h1 className="admin-locktitle">No access.</h1>
          <p className="admin-lockbody">
            {email ? (
              <>
                This console is limited to specific Google accounts. You're
                signed in as <strong>{email}</strong>. To open it here, add
                that address to <code>VITE_ADMIN_EMAILS</code> in .env and
                restart the dev server.
              </>
            ) : (
              <>
                This console is limited to specific Google accounts, and
                you're signed in without one. Switch with the button below —
                or add your address to <code>VITE_ADMIN_EMAILS</code> in .env.
              </>
            )}
          </p>
          <button
            type="button"
            className="btn-secondary"
            disabled={signing}
            onClick={() => void signInGoogle()}
          >
            <GoogleIcon />
            {signing ? 'Opening…' : 'Sign in with Google'}
          </button>
          {error && (
            <p className="auth-error" role="alert">
              {error}
            </p>
          )}
          <button
            type="button"
            className="admin-ghostbtn"
            onClick={() => void leave()}
          >
            Sign out
          </button>
        </div>
      </main>
    )
  }

  // ---- Panel ---------------------------------------------------------------
  const myEmail = auth.currentUser?.email ?? ''

  return (
    <main className="admin-page admin-page-wide">
      <div className="admin-frame">
        <header className="admin-topbar">
          <span className="admin-brand">
            NearZoop <em>Admin</em>
          </span>
          <span className="admin-topmeta">{myEmail}</span>
          <button
            type="button"
            className="admin-topout"
            onClick={() => void leave()}
          >
            Sign out
          </button>
        </header>

        <nav className="admin-tabs" aria-label="Admin sections">
          {(Object.keys(TAB_LABEL) as Tab[]).map((key) => (
            <button
              key={key}
              type="button"
              className={`admin-tab${tab === key ? ' is-active' : ''}`}
              onClick={() => setTab(key)}
            >
              {TAB_LABEL[key]}
            </button>
          ))}
        </nav>

        {(shopsError || offerErrors.size > 0) && (
          <div className="admin-feederror" role="alert">
            {shopsError && (
              <p>shops feed — {shopsError} — retrying automatically.</p>
            )}
            {[...offerErrors.entries()].map(([uid, message]) => (
              <p key={uid}>
                offers feed ({uid.slice(0, 6)}…) — {message} — retrying
                automatically.
              </p>
            ))}
          </div>
        )}

        {tab === 'overview' && (
          <AdminOverview
            shops={shops ?? []}
            offers={offers ?? []}
            loading={shops === null}
          />
        )}
        {tab === 'shops' && (
          <AdminShops
            shops={shops ?? []}
            loading={shops === null}
            onSetVerification={setVerification}
          />
        )}
        {tab === 'offers' && (
          <AdminOffers
            offers={offers ?? []}
            shops={shops ?? []}
            loading={offers === null}
            onDecide={async (shopUid, offerId, verdict, note, fix) => {
              const entry = (offers ?? []).find(
                (candidate) =>
                  candidate.shopUid === shopUid && candidate.offer.id === offerId,
              )
              if (verdict === 'approve') {
                const goingLive = entry ? approvedStatus(entry.offer) : 'live'
                await setOfferStatus(
                  shopUid,
                  offerId,
                  goingLive,
                  '',
                  '',
                  entry?.offer.title,
                  // Only a live approval pings the inbox — a scheduled
                  // approval shows up in the offers list on its own.
                  goingLive === 'live',
                )
              } else {
                await setOfferStatus(
                  shopUid,
                  offerId,
                  'changes',
                  note ?? '',
                  fix ?? '',
                  entry?.offer.title,
                )
              }
            }}
            onDelete={(shopUid, offerId) => {
              const entry = (offers ?? []).find(
                (candidate) =>
                  candidate.shopUid === shopUid && candidate.offer.id === offerId,
              )
              return deleteOffer(shopUid, offerId, {
                title: entry?.offer.title,
                notify: true,
              })
            }}
          />
        )}
      </div>
    </main>
  )
}
