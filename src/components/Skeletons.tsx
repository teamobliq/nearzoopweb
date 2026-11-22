import type { ReactNode } from 'react'

/** A single shimmering block. Purely decorative — the surrounding
 *  LoadingRegion carries the accessible status message. */
export function Skeleton({ className = '' }: { className?: string }) {
  return <span className={`nz-sk ${className}`} aria-hidden="true" />
}

/** Announces loading to assistive tech while showing placeholders. */
export function LoadingRegion({
  label,
  children,
  className = '',
}: {
  label: string
  children: ReactNode
  className?: string
}) {
  return (
    <div className={className} role="status" aria-label={label}>
      <span className="nz-sr-only">{label}…</span>
      {children}
    </div>
  )
}

/** Mirrors the customer offer card (tile + three text lines). */
export function OfferCardSkeleton() {
  return (
    <li className="chome-card" aria-hidden="true">
      <div className="chome-card-hit sk-offer-hit">
        <Skeleton />
        <div className="chome-card-main sk-offer-main">
          <Skeleton className="sk-line sk-line--md" />
          <Skeleton className="sk-line sk-line--sm" />
          <Skeleton className="sk-line sk-line--sm" />
        </div>
      </div>
    </li>
  )
}

/** Title + subline + a stack of offer cards. */
export function OfferListSkeleton({ count = 3 }: { count?: number }) {
  return (
    <LoadingRegion label="Loading offers" className="sk-stack">
      <Skeleton className="sk-line sk-line--lg" />
      <Skeleton className="sk-line sk-line--sm" />
      <ul className="chome-cards" aria-hidden="true">
        {Array.from({ length: count }, (_, i) => (
          <OfferCardSkeleton key={i} />
        ))}
      </ul>
    </LoadingRegion>
  )
}

/** Generic row for coupon / notification / redemption lists. */
export function RowSkeleton({ avatar = false }: { avatar?: boolean }) {
  return (
    <div className="sk-row" aria-hidden="true">
      {avatar && <Skeleton className="sk-avatar" />}
      <div className="sk-row-main">
        <Skeleton className="sk-line sk-line--md" />
        <Skeleton className="sk-line sk-line--sm" />
      </div>
      <Skeleton className="sk-pill" />
    </div>
  )
}

export function RowListSkeleton({
  label,
  count = 4,
  avatar = false,
}: {
  label: string
  count?: number
  avatar?: boolean
}) {
  return (
    <LoadingRegion label={label} className="sk-stack">
      {Array.from({ length: count }, (_, i) => (
        <RowSkeleton key={i} avatar={avatar} />
      ))}
    </LoadingRegion>
  )
}

/** Offer detail page: big tile, headline, two info cards. */
export function DetailSkeleton() {
  return (
    <LoadingRegion label="Loading offer details" className="sk-stack">
      <div className="sk-row" aria-hidden="true">
        <Skeleton className="sk-tile" />
        <div className="sk-row-main">
          <Skeleton className="sk-line sk-line--lg" />
          <Skeleton className="sk-pill" />
        </div>
      </div>
      <Skeleton className="sk-cover" />
      <Skeleton className="sk-line sk-line--md" />
      <Skeleton className="sk-line sk-line--sm" />
      <Skeleton className="sk-cover" />
    </LoadingRegion>
  )
}

/** Shop hero: cover, name, badges and action row. */
export function ShopSkeleton() {
  return (
    <LoadingRegion label="Loading shop" className="sk-stack">
      <Skeleton className="sk-cover" />
      <div className="sk-row" aria-hidden="true">
        <Skeleton className="sk-avatar" />
        <div className="sk-row-main">
          <Skeleton className="sk-line sk-line--lg" />
          <Skeleton className="sk-line sk-line--sm" />
        </div>
      </div>
      <Skeleton className="sk-line sk-line--md" />
    </LoadingRegion>
  )
}

/** Admin stat grid + activity feed. */
export function OverviewSkeleton() {
  return (
    <LoadingRegion label="Loading admin data" className="sk-stack">
      <div className="admin-statgrid" aria-hidden="true">
        {Array.from({ length: 6 }, (_, i) => (
          <div className="sk-stat" key={i}>
            <Skeleton className="sk-line sk-line--sm" />
            <Skeleton className="sk-line sk-line--lg" />
          </div>
        ))}
      </div>
      <div className="admin-card" aria-hidden="true" style={{ padding: '1rem' }}>
        {Array.from({ length: 4 }, (_, i) => (
          <RowSkeleton key={i} />
        ))}
      </div>
    </LoadingRegion>
  )
}

/** Admin tables — a few rows of generic cells in a paper card. */
export function TableSkeleton({ label, rows = 5 }: { label: string; rows?: number }) {
  return (
    <LoadingRegion label={label} className="sk-table">
      {Array.from({ length: rows }, (_, i) => (
        <div className="sk-table-row" key={i} aria-hidden="true">
          <Skeleton className="sk-cell sk-cell--wide" />
          <Skeleton className="sk-cell" />
          <Skeleton className="sk-cell" />
          <Skeleton className="sk-cell--pill" />
        </div>
      ))}
    </LoadingRegion>
  )
}

/** Merchant dashboard boot screen. */
export function DashboardSkeleton() {
  return (
    <LoadingRegion label="Loading your shop" className="sk-stack">
      <Skeleton className="sk-line sk-line--lg" />
      <div className="admin-statgrid" aria-hidden="true">
        {Array.from({ length: 4 }, (_, i) => (
          <div className="sk-stat" key={i}>
            <Skeleton className="sk-line sk-line--sm" />
            <Skeleton className="sk-line sk-line--lg" />
          </div>
        ))}
      </div>
      <Skeleton className="sk-cover" />
    </LoadingRegion>
  )
}
