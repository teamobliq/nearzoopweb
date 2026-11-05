/**
 * Shared pieces from the business setup wizard, split out of
 * BusinessSetup.tsx so that file exports only components (react-refresh).
 */

import type { DayHours, OpeningHours } from './shop'

/** Row summary for an hours group: the window, "Closed", or "Not set". */
/** Formats a day group for display — shared with the shop-page editor. */
export function hoursLabel(value: DayHours): string {
  if (value === 'closed') return 'Closed'
  if (value === null || !value.opens || !value.closes) return 'Not set'
  return `${value.opens} – ${value.closes}`
}

/** Validates the hours editor — returns an error message or ''. Shared
 *  with the shop-page editor. */
export function validateHours(hours: OpeningHours): string {
  const groups: Array<[string, DayHours]> = [
    ['Mon — Sat', hours.monSat],
    ['Sunday', hours.sunday],
  ]
  for (const [label, value] of groups) {
    if (value === null || value === 'closed') continue
    if (!value.opens || !value.closes) {
      return `Set both opening and closing times for ${label}.`
    }
    if (value.opens >= value.closes) {
      return `Closing time must be after opening time for ${label}.`
    }
  }
  return ''
}
