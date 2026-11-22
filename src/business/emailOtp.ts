/** Client side of merchant email verification. The Resend key and the OTP
 *  itself never leave the server — the browser only sends the email/code. */

import { auth } from '../firebase'

async function call(action: 'send' | 'verify', payload: Record<string, string>) {
  const token = await auth.currentUser?.getIdToken()
  if (!token) throw new Error('Sign in to verify your email.')

  const response = await fetch('/api/email-otp', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ action, ...payload }),
  })
  const data = (await response.json().catch(() => ({}))) as { error?: string; ok?: boolean }
  if (!response.ok || !data.ok) {
    throw new Error(data.error || "Couldn't complete that. Try again.")
  }
  return data
}

export function sendEmailOtp(email: string): Promise<unknown> {
  return call('send', { email })
}

export function verifyEmailOtp(code: string): Promise<unknown> {
  return call('verify', { code })
}
