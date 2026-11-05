/** Razorpay Checkout loader + order/verify calls.
 *
 *  The browser only ever holds the public Key ID and the payment signature
 *  Razorpay hands back — the Key SECRET never ships. Order creation and
 *  payment settlement happen in the Vercel functions under api/ (see
 *  docs/razorpay-setup.md); vite dev cannot serve those, so both fail with
 *  a "vercel dev" message unless the app runs deployed or under `vercel dev`. */

import { auth } from '../firebase'

export type RazorpayHandlerResponse = {
  razorpay_payment_id?: string
  razorpay_order_id?: string
  razorpay_signature?: string
}

export type RazorpayOrder = {
  orderId: string
  amount: number
  currency: string
  keyId: string
}

export type RazorpayVerifyResult = {
  ok: boolean
  feeExpiresAt?: string
}

export type VerifyPaymentArgs = {
  razorpay_order_id: string
  razorpay_payment_id: string
  razorpay_signature: string
}

export type RazorpayOptions = {
  key: string
  amount: number
  currency: string
  name: string
  description: string
  order_id?: string
  prefill?: { name?: string; contact?: string }
  theme?: { color?: string }
  handler: (response: RazorpayHandlerResponse) => void
  modal?: { ondismiss?: () => void }
}

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => {
      open: () => void
    }
  }
}

/** The public Key ID — safe in the browser by design; the Key SECRET must
    never be added to .env. */
export function razorpayKeyId(): string | undefined {
  return import.meta.env.VITE_RAZORPAY_KEY_ID as string | undefined
}

let checkoutScript: Promise<boolean> | null = null

/** Loads Razorpay's Checkout script once per page load. */
export function loadCheckout(): Promise<boolean> {
  if (!checkoutScript) {
    checkoutScript = new Promise((resolve) => {
      if (window.Razorpay) {
        resolve(true)
        return
      }
      const script = document.createElement('script')
      script.src = 'https://checkout.razorpay.com/v1/checkout.js'
      script.onload = () => resolve(true)
      script.onerror = () => resolve(false)
      document.body.appendChild(script)
    })
  }
  return checkoutScript
}

const DEPLOYMENT_HINT =
  'Payments are not available in plain `npm run dev`. Run `npm run dev:vercel` (Vite + the /api functions together on localhost:3000), or test on a deployed preview/production site.'

/** Reads the `{ error }` message from a non-2xx API response, if any. */
async function serverErrorMessage(res: Response): Promise<string | null> {
  try {
    const data: unknown = await res.json()
    if (
      data &&
      typeof data === 'object' &&
      'error' in data &&
      typeof (data as { error: unknown }).error === 'string'
    ) {
      return (data as { error: string }).error
    }
    return null
  } catch {
    return null
  }
}

/** POSTs JSON to one of the payment functions with a Firebase ID token.
    Throws an Error whose message is the server's own `error` field when
    there is one — callers show it (or a generic fallback) to the merchant. */
async function paymentApi<T>(path: string, body: unknown): Promise<T> {
  const user = auth.currentUser
  if (!user) {
    throw new Error('Not signed in — reload the page and sign in again.')
  }
  const token = await user.getIdToken()
  let res: Response
  try {
    res = await fetch(path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body ?? {}),
    })
  } catch {
    // Vite dev has no /api routes — the fetch never lands (or HTML comes back).
    throw new Error(DEPLOYMENT_HINT)
  }
  if (!res.ok) {
    const message = await serverErrorMessage(res)
    throw new Error(message ?? (res.status === 404 ? DEPLOYMENT_HINT : `Payment request failed (${res.status}).`))
  }
  return (await res.json()) as T
}

/** Creates the ₹1,000 order server-side (the shop is the token's uid). */
export function createOrder(): Promise<RazorpayOrder> {
  return paymentApi<RazorpayOrder>('/api/razorpay-order', {})
}

/** Verifies the Checkout signature server-side and settles the fee.
    Safe to retry — settlement is idempotent. */
export function verifyPayment(args: VerifyPaymentArgs): Promise<RazorpayVerifyResult> {
  return paymentApi<RazorpayVerifyResult>('/api/razorpay-verify', args)
}
