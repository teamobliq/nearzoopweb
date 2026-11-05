import { STATUS_LABEL, type ShopStatus } from './bitsShared'

export function StatusChip({ status }: { status: ShopStatus }) {
  return (
    <span className={`admin-chip admin-chip-${status}`}>
      {STATUS_LABEL[status]}
    </span>
  )
}
