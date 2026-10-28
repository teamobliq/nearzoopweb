/** Time formatting shared by the merchant screens. Offers store ISO strings;
    every list renders them in the design's "24 Oct, 10:30 AM" voice. */

/** "24 Oct, 10:30 AM" — full stamp for summary rows. Unparseable input
    passes through untouched. */
export function fmtWhen(iso?: string): string | null {
  if (!iso) return null
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

/** "24 Oct" — day + month for range chips and list rows. */
export function fmtDay(iso?: string): string | null {
  if (!iso) return null
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

/** "2 h ago" / "yesterday" from an ISO stamp; human-readable strings pass
    through untouched. */
export function rel(stamp?: string): string | null {
  if (!stamp) return null
  const then = Date.parse(stamp)
  if (Number.isNaN(then)) return stamp
  const mins = Math.round((Date.now() - then) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} h ago`
  if (hours < 48) return 'yesterday'
  return `${Math.floor(hours / 24)} d ago`
}
