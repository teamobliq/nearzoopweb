import { useLayoutEffect, useState, type ReactNode } from 'react'

type Variant = 'up' | 'lift' | 'fade'
type Direction = 'forward' | 'back'

/** Screens already seen this session. Remembering them lets "back" animate
 *  in the opposite direction to a forward push without changing the app's
 *  hand-rolled history stack. */
const visited: string[] = []

/**
 * Wraps every top-level screen. The parent keys this component by navigation
 * state, so React remounts it on each screen change and the CSS enter
 * animation replays. No router or animation library needed.
 */
export default function PageTransition({
  id,
  variant = 'up',
  children,
}: {
  id: string
  variant?: Variant
  children: ReactNode
}) {
  // Read-only during render: StrictMode may call the initializer twice, but
  // the visit is only recorded in the effect below, so the result is stable.
  const [direction] = useState<Direction>(() => (visited.includes(id) ? 'back' : 'forward'))

  useLayoutEffect(() => {
    const at = visited.lastIndexOf(id)
    if (at >= 0) visited.length = at + 1
    else visited.push(id)
    // Forward navigation starts at the top; a back gesture keeps the place
    // it had before the screen changed.
    if (direction === 'forward') window.scrollTo(0, 0)
  }, [id, direction])

  return (
    <div className={`nz-page nz-page--${variant} nz-page--${direction}`}>
      {children}
    </div>
  )
}
