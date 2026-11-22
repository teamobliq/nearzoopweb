import type { MapPin } from './mapUtils'

/** Builds the DOM for one map pill. Shared by the MapLibre and Google maps
 *  so both render the same selected tooltip. Text is assigned (never parsed
 *  as HTML) because shop names and addresses come from Firestore. */
export function renderPinElement(el: HTMLElement, pin: MapPin): void {
  el.className = `biz-map-pin${pin.selected ? ' is-sel' : ''}`

  const chip = document.createElement('span')
  chip.className = 'biz-map-pin-chip'
  chip.textContent = pin.label ?? ''
  el.replaceChildren(chip)

  if (!pin.selected || (!pin.shopName && !pin.address)) return

  const info = document.createElement('span')
  info.className = 'biz-map-pin-info'

  const dot = document.createElement('span')
  dot.className = 'biz-map-pin-info-dot'
  dot.setAttribute('aria-hidden', 'true')

  const body = document.createElement('span')
  body.className = 'biz-map-pin-info-body'
  const title = document.createElement('strong')
  title.textContent = pin.shopName ?? 'Business'
  body.append(title)

  const detail = [pin.shopCategory, pin.address].filter(Boolean).join(' · ')
  if (detail) {
    const sub = document.createElement('span')
    sub.className = 'biz-map-pin-info-sub'
    sub.textContent = detail
    body.append(sub)
  }

  info.append(dot, body)
  el.append(info)
}
