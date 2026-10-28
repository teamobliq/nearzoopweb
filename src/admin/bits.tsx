import type { OpeningHours, ShopRecord } from '../business/shop'

export type ShopStatus = 'verified' | 'pending' | 'failed' | 'setup'

/** The admin's view of where a shop stands: unfinished wizards are "in
    setup"; after that the verification verdict (defaulting to pending). */
export function statusOf(shop: ShopRecord): ShopStatus {
  if (!shop.setupDone) return 'setup'
  return shop.verification ?? 'pending'
}

export const STATUS_LABEL: Record<ShopStatus, string> = {
  verified: 'Verified',
  pending: 'Pending',
  failed: 'Failed',
  setup: 'In setup',
}

export function StatusChip({ status }: { status: ShopStatus }) {
  return (
    <span className={`admin-chip admin-chip-${status}`}>
      {STATUS_LABEL[status]}
    </span>
  )
}

export const DOC_LABEL: Record<ShopRecord['docKind'], string> = {
  gstin: 'GSTIN',
  licence: 'Trade licence',
  udyam: 'Udyam registration',
  signboard: 'Signboard photo',
}

/** Renders the two day groups the wizard collects, or an em dash. */
export function hoursText(hours?: OpeningHours | null): string {
  if (!hours || (!hours.monSat && !hours.sunday)) return '—'
  const parts: string[] = []
  if (hours.monSat === 'closed') parts.push('Mon–Sat closed')
  else if (hours.monSat) parts.push(`Mon–Sat ${hours.monSat.opens}–${hours.monSat.closes}`)
  if (hours.sunday === 'closed') parts.push('Sun closed')
  else if (hours.sunday) parts.push(`Sun ${hours.sunday.opens}–${hours.sunday.closes}`)
  return parts.join(' · ')
}

/** Firestore timestamps → "28 Oct, 2:51 pm". Tolerates missing values. */
export function formatWhen(ts?: { toDate?: () => Date } | null): string {
  const date = ts?.toDate?.()
  if (!date) return '—'
  return date.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function inr(amount: number): string {
  return '₹' + amount.toLocaleString('en-IN')
}

export function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max - 1) + '…' : text
}
