/** Customer names shown publicly on reviews.
 *
 * Phone sign-ins have no display name — the session label is a masked phone
 * number, which must never end up on a shop page. Only a real profile name
 * (or a Google display name) is allowed through.
 */

export function isPhoneLike(value: string): boolean {
  const compact = value.replace(/\D/g, '')
  const hasLetters = /[A-Za-z\u0900-\u097F]/.test(value)
  return !hasLetters && compact.length >= 8
}

/** Returns a name safe to store or render; '' means "show Customer". */
export function safeCustomerName(value?: string | null): string {
  const name = value?.trim() ?? ''
  if (!name || name.includes('@') || isPhoneLike(name)) return ''
  return name
}
