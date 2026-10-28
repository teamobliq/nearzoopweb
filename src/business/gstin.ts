/** GSTIN verification against gstinapi.in.
    The browser calls the same-origin path /gstapi/…; the Vite dev server
    proxies it to https://gstinapi.in and attaches the API key from .env, so
    the key never reaches the client bundle and gstinapi.in's missing CORS
    headers never matter. One successful lookup costs one credit; the sandbox
    GSTIN 00AAAAA0000A1ZT answers free with a fixed sample record. */

export type GstinCheck =
  | { ok: true; status: string; legalName: string; tradeName: string }
  | { ok: false; reason: 'not-found' | 'unreachable' }

/** Looks up one GSTIN. `not-found` means the format was valid but the GST
    network has no such registration (a free answer from the API);
    `unreachable` covers key problems, exhausted credits, rate limits and
    network failures — callers should degrade to the manual-review path
    instead of blocking the merchant on those. */
export async function verifyGstin(gstin: string): Promise<GstinCheck> {
  try {
    const res = await fetch(`/gstapi/v1/gstin/${encodeURIComponent(gstin)}`, {
      signal: AbortSignal.timeout(9000),
    })
    if (res.status === 404) return { ok: false, reason: 'not-found' }
    if (!res.ok) return { ok: false, reason: 'unreachable' }
    const body = (await res.json()) as {
      success?: boolean
      data?: { status?: string; legal_name?: string; trade_name?: string }
    }
    if (!body.success || !body.data) return { ok: false, reason: 'unreachable' }
    return {
      ok: true,
      status: body.data.status ?? '',
      legalName: body.data.legal_name ?? '',
      tradeName: body.data.trade_name ?? '',
    }
  } catch {
    return { ok: false, reason: 'unreachable' }
  }
}
