import type { AdminOfferEntry, AdminShopEntry } from '../business/shop'
import { StatusChip, formatWhen, inr, statusOf, truncate } from './bits'

type Props = {
  shops: AdminShopEntry[]
  offers: AdminOfferEntry[]
  loading: boolean
}

/** The overview tab: live totals, fee revenue, and the latest shop activity. */
export default function AdminOverview({ shops, offers, loading }: Props) {
  if (loading) {
    return <p className="admin-empty">Loading live data…</p>
  }

  const verified = shops.filter(
    (e) => e.shop.setupDone && e.shop.verification === 'verified',
  ).length
  const pending = shops.filter(
    (e) => e.shop.setupDone && (e.shop.verification ?? 'pending') === 'pending',
  ).length
  const failed = shops.filter((e) => e.shop.verification === 'failed').length
  const paid = shops.filter((e) => e.shop.paymentDone).length

  const stats = [
    { cap: 'Shops', num: String(shops.length), tone: '' },
    { cap: 'Verified', num: String(verified), tone: ' admin-stat-green' },
    { cap: 'Pending', num: String(pending), tone: ' admin-stat-amber' },
    { cap: 'Failed', num: String(failed), tone: ' admin-stat-red' },
    { cap: 'Verification fees', num: inr(paid * 1000), tone: ' admin-stat-orange' },
    { cap: 'Offers', num: String(offers.length), tone: '' },
  ]

  return (
    <>
      <div className="admin-statgrid">
        {stats.map((stat) => (
          <div key={stat.cap} className={`admin-stat${stat.tone}`}>
            <span className="admin-statnum">{stat.num}</span>
            <span className="admin-statcap">{stat.cap}</span>
          </div>
        ))}
      </div>

      <h2 className="admin-sectitle">Latest activity</h2>
      <div className="admin-card">
        {shops.length === 0 ? (
          <p className="admin-empty">
            No shops yet — merchants appear here as they sign up.
          </p>
        ) : (
          <ul className="admin-feed">
            {shops.slice(0, 6).map((entry) => (
              <li key={entry.uid} className="admin-feedrow">
                <span className="admin-feedmain">
                  <strong>{entry.shop.name || 'Unnamed shop'}</strong>
                  <span className="admin-feedsub">
                    {entry.shop.address ? truncate(entry.shop.address, 46) : '—'}
                  </span>
                </span>
                <StatusChip status={statusOf(entry.shop)} />
                <span className="admin-feedwhen">
                  {formatWhen(entry.shop.updatedAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  )
}
