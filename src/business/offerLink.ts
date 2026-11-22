/** Offer links are query-string deep links on the same SPA page:
    `<base>/?shop=<shopUid>&offer=<offerId>`.

    In-app navigation deliberately does NOT change the address bar — opening
    an offer keeps the app at the plain base URL like every other screen. The
    long link is generated only when the merchant or customer hits Share, so
    a recipient can open or reload straight into that offer. The legacy
    `<base>/<shopUid>/<offerId>` path links are still understood by App.tsx.
 */

/** Absolute, shareable URL for one offer. */
export function offerShareUrl(shopUid: string, offerId: string, source = 'share'): string {
  const params = new URLSearchParams({ shop: shopUid, offer: offerId, source })
  return `${window.location.origin}${import.meta.env.BASE_URL}?${params.toString()}`
}
