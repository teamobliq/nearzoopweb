/** NearZoop-branded HTML email for merchant notifications.
 *  Inline styles only — email clients strip <style> blocks and web fonts. */

const SITE = 'https://nearzoop.teamobliq.in'
const INK = '#1c1b19'
const ORANGE = '#fb4b32'
const PAPER = '#fffdf6'
const CREAM = '#fff4e0'
const STONE = '#6a6152'

const TONES = {
  verified: { label: 'SHOP VERIFIED', bg: '#dff3e7', fg: '#0e8a4c' },
  'offer-approved': { label: 'OFFER LIVE', bg: '#dff3e7', fg: '#0e8a4c' },
  'verification-failed': { label: 'VERIFICATION', bg: '#fbdcdc', fg: '#b42318' },
  'offer-changes': { label: 'ACTION NEEDED', bg: '#fdecc8', fg: '#6b4f12' },
  'offer-removed': { label: 'OFFER REMOVED', bg: '#fbdcdc', fg: '#b42318' },
  report: { label: 'CUSTOMER REPORT', bg: '#fdecc8', fg: '#6b4f12' },
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function notificationEmail({ title, body, kind, shopName, url }) {
  const tone = TONES[kind] || { label: 'NOTIFICATION', bg: '#fdecc8', fg: '#6b4f12' }
  const headline = escapeHtml(title || 'You have a new update')
  const detail = escapeHtml(body || '')
  const business = shopName ? escapeHtml(shopName) : 'your shop'
  const link = escapeHtml(url || `${SITE}/business/notifications`)

  return {
    subject: `NearZoop · ${title || 'Your shop has an update'}`,
    text: [
      `${title || 'You have a new update'}`,
      body || '',
      '',
      `Open your NearZoop dashboard: ${link}`,
    ]
      .filter(Boolean)
      .join('\n'),
    html: `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:24px 12px;background-color:${CREAM};font-family:Arial,'Helvetica Neue',sans-serif;color:${INK};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background-color:${PAPER};border:3px solid ${INK};border-radius:18px;box-shadow:6px 8px 0 0 ${INK};overflow:hidden;">
      <tr>
        <td style="background-color:${ORANGE};padding:18px 24px;">
          <img src="${SITE}/icon.svg" alt="NearZoop" width="38" height="38" style="display:inline-block;vertical-align:middle;border-radius:8px;" />
          <span style="color:#ffffff;font-size:24px;font-weight:900;letter-spacing:-0.5px;vertical-align:middle;margin-left:10px;">NearZoop</span>
        </td>
      </tr>
      <tr>
        <td style="padding:28px 24px 8px;">
          <span style="display:inline-block;background-color:${tone.bg};color:${tone.fg};font-family:'Courier New',monospace;font-size:11px;font-weight:700;letter-spacing:1.2px;padding:6px 12px;border-radius:999px;">${tone.label}</span>
          <h1 style="margin:18px 0 10px;font-size:28px;line-height:1.15;font-weight:900;letter-spacing:-0.6px;color:${INK};">${headline}</h1>
          ${detail ? `<p style="margin:0;font-size:16px;line-height:1.55;color:${STONE};">${detail}</p>` : ''}
          <p style="margin:14px 0 0;font-size:14px;line-height:1.5;color:${STONE};">This is an update about <strong style="color:${INK};">${business}</strong>.</p>
        </td>
      </tr>
      <tr>
        <td style="padding:22px 24px 28px;">
          <table role="presentation" cellpadding="0" cellspacing="0">
            <tr>
              <td style="background-color:${ORANGE};border:3px solid ${INK};border-radius:12px;box-shadow:4px 6px 0 0 ${INK};">
                <a href="${link}" style="display:inline-block;padding:12px 20px;color:#ffffff;font-size:16px;font-weight:900;text-decoration:none;">Open notifications →</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
      <tr>
        <td style="background-color:${CREAM};padding:16px 24px;border-top:2px solid ${INK};font-family:'Courier New',monospace;font-size:11px;line-height:1.5;color:${STONE};text-transform:uppercase;letter-spacing:0.6px;">
          NearZoop · Offers in your locality, right now.
        </td>
      </tr>
    </table>
  </body>
</html>`,
  }
}

module.exports = { notificationEmail }
