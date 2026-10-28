import { useState } from 'react'
import type { AdminShopEntry } from '../business/shop'
import {
  DOC_LABEL,
  StatusChip,
  formatWhen,
  hoursText,
  statusOf,
  truncate,
} from './bits'

type Verdict = 'verified' | 'failed'

type Props = {
  shops: AdminShopEntry[]
  loading: boolean
  onSetVerification: (uid: string, verdict: Verdict, note?: string) => Promise<void>
}

type FilterKey = 'all' | 'verified' | 'pending' | 'failed' | 'setup'

const FILTERS: Array<{ key: FilterKey; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'verified', label: 'Verified' },
  { key: 'pending', label: 'Pending' },
  { key: 'failed', label: 'Failed' },
  { key: 'setup', label: 'In setup' },
]

/** The shops tab: searchable, filterable table of every merchant plus a
    detail drawer where verifications are approved or rejected. */
export default function AdminShops({ shops, loading, onSetVerification }: Props) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<FilterKey>('all')
  const [openUid, setOpenUid] = useState<string | null>(null)

  const counts: Record<FilterKey, number> = {
    all: shops.length,
    verified: 0,
    pending: 0,
    failed: 0,
    setup: 0,
  }
  for (const entry of shops) counts[statusOf(entry.shop)] += 1

  const q = query.trim().toLowerCase()
  const rows = shops.filter((entry) => {
    if (filter !== 'all' && statusOf(entry.shop) !== filter) return false
    if (!q) return true
    const shop = entry.shop
    return [shop.name, shop.ownerName, shop.customerPhone, shop.address, shop.gstin].some(
      (field) => (field ?? '').toLowerCase().includes(q),
    )
  })

  const open = shops.find((entry) => entry.uid === openUid) ?? null

  if (loading) {
    return <p className="admin-empty">Loading shops…</p>
  }

  return (
    <>
      <div className="admin-toolbar">
        <input
          className="admin-search"
          type="search"
          placeholder="Search name, owner, phone, GSTIN…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label="Search shops"
        />
        <div className="admin-filterchips">
          {FILTERS.map((entry) => (
            <button
              key={entry.key}
              type="button"
              className={`admin-filter${filter === entry.key ? ' is-active' : ''}`}
              onClick={() => setFilter(entry.key)}
            >
              {entry.label} · {counts[entry.key]}
            </button>
          ))}
        </div>
      </div>

      <div className="admin-card admin-tablewrap">
        {rows.length === 0 ? (
          <p className="admin-empty">
            {shops.length === 0
              ? 'No shops yet — merchants appear here as they sign up.'
              : 'No shops match.'}
          </p>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Shop</th>
                <th>Owner</th>
                <th>Phone</th>
                <th>Locality</th>
                <th>Doc</th>
                <th>Fee</th>
                <th>Status</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((entry) => (
                <tr
                  key={entry.uid}
                  className="admin-tablerow"
                  onClick={() => setOpenUid(entry.uid)}
                >
                  <td>
                    <span className="admin-cellmain">
                      {entry.shop.name || 'Unnamed shop'}
                    </span>
                    <span className="admin-cellsub">{entry.shop.category || '—'}</span>
                  </td>
                  <td>{entry.shop.ownerName || '—'}</td>
                  <td>
                    {entry.shop.customerPhone
                      ? `+91 ${entry.shop.customerPhone}`
                      : '—'}
                  </td>
                  <td>
                    {entry.shop.address ? truncate(entry.shop.address, 34) : '—'}
                  </td>
                  <td>{DOC_LABEL[entry.shop.docKind]}</td>
                  <td>
                    {entry.shop.paymentDone ? (
                      <span className="admin-feepaid" title={entry.shop.paymentId}>
                        ₹1,000
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>
                    <StatusChip status={statusOf(entry.shop)} />
                  </td>
                  <td className="admin-when">{formatWhen(entry.shop.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {open && (
        <ShopDrawer
          entry={open}
          onClose={() => setOpenUid(null)}
          onSetVerification={onSetVerification}
        />
      )}
    </>
  )
}

/** Slide-over with the full record and the verify / reject actions. */
function ShopDrawer({
  entry,
  onClose,
  onSetVerification,
}: {
  entry: AdminShopEntry
  onClose: () => void
  onSetVerification: Props['onSetVerification']
}) {
  const { shop, uid } = entry
  const status = statusOf(shop)
  const [rejecting, setRejecting] = useState(false)
  const [note, setNote] = useState('')
  const [working, setWorking] = useState(false)
  const [actionError, setActionError] = useState('')

  async function act(verdict: Verdict, withNote = ''): Promise<void> {
    setWorking(true)
    setActionError('')
    try {
      await onSetVerification(uid, verdict, withNote)
      setRejecting(false)
      setNote('')
    } catch {
      setActionError(
        'Could not save the verdict. Check your connection and try again.',
      )
    } finally {
      setWorking(false)
    }
  }

  return (
    <>
      <div className="admin-drawerback" onClick={onClose} />
      <aside className="admin-drawer" aria-label={`Shop details: ${shop.name}`}>
        <header className="admin-drawerhead">
          <div>
            <h2 className="admin-drawertitle">{shop.name || 'Unnamed shop'}</h2>
            <StatusChip status={status} />
          </div>
          <button
            type="button"
            className="admin-drawerclose"
            onClick={onClose}
            aria-label="Close details"
          >
            ×
          </button>
        </header>

        {(shop.shopPhotoUrl || shop.docPhotoUrl) && (
          <div className="admin-photorow">
            {shop.shopPhotoUrl && (
              <figure>
                <img src={shop.shopPhotoUrl} alt="Shopfront" />
                <figcaption>Shopfront</figcaption>
              </figure>
            )}
            {shop.docPhotoUrl && (
              <figure>
                <img src={shop.docPhotoUrl} alt="Verification document" />
                <figcaption>Document</figcaption>
              </figure>
            )}
          </div>
        )}

        <dl className="admin-fieldgrid">
          <div>
            <dt>Owner</dt>
            <dd>{shop.ownerName || '—'}</dd>
          </div>
          <div>
            <dt>Category</dt>
            <dd>{shop.category || '—'}</dd>
          </div>
          <div>
            <dt>Customer phone</dt>
            <dd>
              {shop.customerPhone ? `+91 ${shop.customerPhone}` : '—'}
              {shop.customerPhone && !shop.showPhone ? ' · hidden' : ''}
            </dd>
          </div>
          <div>
            <dt>Address</dt>
            <dd>{shop.address || '—'}</dd>
          </div>
          <div>
            <dt>Pin</dt>
            <dd>
              {shop.lat != null && shop.lng != null
                ? `${shop.lat.toFixed(5)}, ${shop.lng.toFixed(5)}`
                : '—'}
            </dd>
          </div>
          <div>
            <dt>Hours</dt>
            <dd>{hoursText(shop.openingHours)}</dd>
          </div>
          <div>
            <dt>Document</dt>
            <dd>
              {DOC_LABEL[shop.docKind]}
              {shop.docKind === 'gstin' && shop.gstin ? ` · ${shop.gstin}` : ''}
            </dd>
          </div>
          {shop.gstinLegalName && (
            <div>
              <dt>GST legal name</dt>
              <dd>{shop.gstinLegalName}</dd>
            </div>
          )}
          <div>
            <dt>Payment</dt>
            <dd>
              {shop.paymentDone
                ? `₹1,000 · ${shop.paymentId ?? 'no reference'}`
                : 'Unpaid'}
            </dd>
          </div>
          <div>
            <dt>Shop UID</dt>
            <dd className="admin-mono">{uid}</dd>
          </div>
          <div>
            <dt>Updated</dt>
            <dd>{formatWhen(shop.updatedAt)}</dd>
          </div>
        </dl>

        {actionError && <p className="admin-actionerror">{actionError}</p>}

        <div className="admin-actions">
          {status !== 'verified' && (
            <button
              type="button"
              className="admin-btn admin-btn-verify"
              disabled={working}
              onClick={() => void act('verified')}
            >
              Mark verified
            </button>
          )}
          {status !== 'failed' && !rejecting && (
            <button
              type="button"
              className="admin-btn admin-btn-reject"
              disabled={working}
              onClick={() => setRejecting(true)}
            >
              Reject…
            </button>
          )}
        </div>

        {rejecting && (
          <div className="admin-rejectbox">
            <label className="admin-rejectlabel" htmlFor="admin-reject-note">
              Reason shown to the merchant (optional)
            </label>
            <textarea
              id="admin-reject-note"
              className="admin-rejectinput"
              rows={3}
              maxLength={200}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="e.g. The signboard photo is too dark to read the shop name."
            />
            <div className="admin-rejectrow">
              <button
                type="button"
                className="admin-btn admin-btn-reject"
                disabled={working}
                onClick={() => void act('failed', note.trim())}
              >
                Confirm rejection
              </button>
              <button
                type="button"
                className="admin-ghostbtn"
                onClick={() => {
                  setRejecting(false)
                  setNote('')
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </aside>
    </>
  )
}
