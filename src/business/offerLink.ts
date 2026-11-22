/** Offer links are deep links on the same SPA page:
    `<base>/offer?shop=<shopUid>&offer=<offerId>`.

    The `/offer` path is deliberate: Vercel serves the built index.html at
    `/` before rewrites run, but non-root paths reach the crawler-aware
    rewrite, so sharing bots get per-offer Open Graph tags while regular
    browsers still get the app. In-app navigation keeps the address bar on
    the plain base URL. Legacy `<base>/<uid>/<offerId>` links still resolve.
 */

/** Absolute, shareable URL for one offer. */
export function offerShareUrl(shopUid: string, offerId: string, source = 'share'): string {
  const params = new URLSearchParams({ shop: shopUid, offer: offerId, source })
  return `${window.location.origin}${import.meta.env.BASE_URL}offer?${params.toString()}`
}
