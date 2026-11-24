import { useEffect, useState } from 'react'

const QUERY = '(min-width: 900px)'

/** True while the customer app is in its desktop layout. Used to decide
 *  whether the inbox is an overlay on Home or a full screen of its own. */
export function useDesktop(): boolean {
  const [desktop, setDesktop] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(QUERY).matches,
  )

  useEffect(() => {
    const media = window.matchMedia(QUERY)
    const update = () => setDesktop(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  return desktop
}
