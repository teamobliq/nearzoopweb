import { useEffect, useRef, type RefObject } from 'react'

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Keeps keyboard focus inside an open dialog and returns it to the trigger
 * on close. Escape handling is opt-in: most dialogs already have their own
 * keydown effect, so the hook only traps Tab by default.
 *
 * Call it unconditionally from the component that owns the dialog, passing
 * `active: false` when the dialog is not mounted.
 */
export function useDialogFocus<T extends HTMLElement>(
  ref: RefObject<T | null>,
  options: { active?: boolean; onClose?: () => void; escape?: boolean } = {},
): void {
  const { active = true, onClose, escape = false } = options
  // Dialogs usually receive a fresh inline onClose each render — keep it in
  // a ref so the effect (and therefore the focus) isn't reset on every render.
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    if (!active) return
    const root = ref.current
    if (!root) return
    const previous = document.activeElement as HTMLElement | null

    const focusables = () =>
      Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.getClientRects().length > 0,
      )

    // Text fields win over close buttons — the user usually came here to
    // type something.
    const preferred = root.querySelector<HTMLElement>('input:not([type="hidden"]), textarea')
    ;(preferred ?? focusables()[0])?.focus()

    function onKeyDown(event: KeyboardEvent) {
      if (escape && event.key === 'Escape') {
        event.preventDefault()
        closeRef.current?.()
        return
      }
      if (event.key !== 'Tab') return
      const items = focusables()
      if (items.length === 0) {
        event.preventDefault()
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      const current = document.activeElement
      if (event.shiftKey && (current === first || !root.contains(current))) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && (current === last || !root.contains(current))) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      if (previous?.isConnected) previous.focus()
    }
  }, [active, escape, ref])
}
