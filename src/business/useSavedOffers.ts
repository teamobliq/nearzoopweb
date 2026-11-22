import { useEffect, useState } from 'react'
import { watchSavedOffers } from './saved'

/** Shared hook for every bookmark button. `uid` is absent for a guest, in
 *  which case the set is always empty — guests cannot save. */
export function useSavedOffers(uid?: string): { saved: Set<string>; loading: boolean } {
  const [saved, setSaved] = useState<Set<string>>(() => new Set())
  const [loading, setLoading] = useState(Boolean(uid))

  useEffect(() => {
    if (!uid) {
      setSaved(new Set())
      setLoading(false)
      return
    }
    setLoading(true)
    return watchSavedOffers(uid, (ids) => {
      setSaved(ids)
      setLoading(false)
    })
  }, [uid])

  return { saved, loading }
}
