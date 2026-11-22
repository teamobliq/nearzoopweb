/**
 * Link previews for social/messaging crawlers.
 *
 * Browsers get the SPA from index.html. Crawlers (WhatsApp, Twitter, Slack,
 * Facebook, Telegram…) don't execute JavaScript, so Vercel routes their
 * User-Agents here. We look up the offer's public feed mirror and return a
 * tiny HTML document containing only Open Graph / Twitter card tags.
 */
import { db, sendJson } from './_lib/settle.js'

const SITE = 'https://nearzoop.teamobliq.in'
const DEFAULT_IMAGE = `${SITE}/apple-touch-icon.png`
const DEFAULT_TITLE = 'NearZoop — Offers in your locality, right now.'
const DEFAULT_DESCRIPTION =
  'Live offers from the shops around you, a walk away. Find something new nearby today.'

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function truncate(value, max = 180) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim()
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

function page({ title, description, image, url, type = 'website' }) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}" />
    <meta property="og:type" content="${escapeHtml(type)}" />
    <meta property="og:site_name" content="NearZoop" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:image" content="${escapeHtml(image)}" />
    <meta property="og:url" content="${escapeHtml(url)}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(title)}" />
    <meta name="twitter:description" content="${escapeHtml(description)}" />
    <meta name="twitter:image" content="${escapeHtml(image)}" />
  </head>
  <body>
    <p><a href="${escapeHtml(url)}">Open ${escapeHtml(title)} on NearZoop</a></p>
  </body>
</html>`
}

function readTarget(req) {
  const shop = req.query?.shop
  const offer = req.query?.offer
  if (shop && offer) return { shopUid: String(shop), offerId: String(offer) }
  // Legacy path links: /<shopUid>/<offerId>
  const segments = (req.url || '')
    .split('?')[0]
    .split('/')
    .filter(Boolean)
    .filter((part) => !['business', 'busdash', 'nz-admin', 'shop'].includes(part))
  return segments.length >= 2
    ? { shopUid: decodeURIComponent(segments[0]), offerId: decodeURIComponent(segments[1]) }
    : null
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD')
    return sendJson(res, 405, { error: 'Method not allowed' })
  }

  const target = readTarget(req)
  let meta = {
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    image: DEFAULT_IMAGE,
    url: SITE,
  }

  if (target) {
    try {
      const snap = await db()
        .collection('feed')
        .doc(`${target.shopUid}_${target.offerId}`)
        .get()
      if (snap.exists) {
        const item = snap.data()
        const label = String(item.discountLabel ?? '').trim()
        const title = String(item.title ?? 'Offer').trim()
        const shop = String(item.shopName ?? 'a nearby shop').trim()
        meta = {
          title: `${title}${label ? ` — ${label}` : ''} at ${shop} | NearZoop`,
          description: truncate(
            item.description || `${label ? `${label} off. ` : ''}Live offer at ${shop}.`,
          ),
          image: String(item.photos?.[0] || item.shopPhotoUrl || DEFAULT_IMAGE),
          url: `${SITE}/?shop=${encodeURIComponent(target.shopUid)}&offer=${encodeURIComponent(target.offerId)}`,
          type: 'article',
        }
      }
    } catch (err) {
      console.error('link-preview lookup failed:', err)
      // Fall back to the generic card — a crawler should never see an error.
    }
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=300, stale-while-revalidate=600')
  return res.status(200).send(page(meta))
}
