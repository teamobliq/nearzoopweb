/** Razorpay Checkout loader (Standard Checkout, no order — the annual
    ₹1,000 fee is charged straight from the browser with the public Key
    ID; the secret never ships and there is no server to create orders). */

export type RazorpayHandlerResponse = {
  razorpay_payment_id?: string
}

export type RazorpayOptions = {
  key: string
  amount: number
  currency: string
  name: string
  description: string
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
