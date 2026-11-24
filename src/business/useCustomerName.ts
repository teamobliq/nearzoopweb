import { useEffect, useState } from 'react'
import { auth } from '../firebase'
import { safeCustomerName } from './customerName'
import { watchCustomer } from './customer'

/** A public display name for the signed-in customer — never their phone.
 *  Google display name is the first choice, the profile name from Edit
 *  Profile wins once set, and 'Customer' is used when neither exists. */
export function useCustomerName(uid?: string): string {
  const [name, setName] = useState('')

  useEffect(() => {
    if (!uid) {
      setName('')
      return
    }
    const authName = safeCustomerName(auth.currentUser?.displayName)
    let resolved = authName
    setName(resolved)

    return watchCustomer(uid, (profile) => {
      const profileName = safeCustomerName(profile?.name)
      resolved = profileName || authName
      setName(resolved)
    })
  }, [uid])

  return name
}
