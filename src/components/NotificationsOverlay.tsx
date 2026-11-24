import { useRef, type ReactNode } from 'react'
import { useDialogFocus } from '../hooks/useDialogFocus'

/** Desktop-only inbox shell: the notifications screen sits over Home
 *  instead of replacing it. Escape and backdrop taps close it. */
export default function NotificationsOverlay({
  onClose,
  children,
}: {
  onClose: () => void
  children: ReactNode
}) {
  const panelRef = useRef<HTMLElement>(null)
  useDialogFocus(panelRef, { escape: true, onClose })

  return (
    <div
      className="chome-notif-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        ref={panelRef}
        className="chome-notif-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Notifications"
      >
        {children}
      </section>
    </div>
  )
}
