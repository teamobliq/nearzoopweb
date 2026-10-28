import { useRef, useState } from 'react'
import {
  GoogleAuthProvider,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  signInWithPopup,
  type ConfirmationResult,
} from 'firebase/auth'
import { auth } from '../firebase'
import SignInPhone from './SignInPhone'
import VerifyCode from './VerifyCode'
import ArtField from './ArtField'
import './auth.css'

type Props = {
  onSignedIn: (label: string) => void
  onSkip: () => void
  onBusiness: () => void
}

const FALLBACK = 'Something went wrong. Please try again.'

const ERROR_MESSAGES: Record<string, string> = {
  'invalid-phone-number': "That doesn't look like a valid Indian mobile number.",
  'too-many-requests': 'Too many attempts. Wait a bit and try again.',
  'operation-not-allowed':
    "Phone sign-in isn't enabled for this project in the Firebase console yet.",
  'invalid-verification-code': "That code didn't match. Check the SMS and try again.",
  'code-expired': 'That code has expired. Send a fresh one and try again.',
  'invalid-app-credential': 'Verification check failed. Reload the page and try again.',
  'quota-exceeded': 'The SMS quota for this project is used up. Try again later.',
  'popup-blocked': 'Your browser blocked the sign-in window. Allow pop-ups and try again.',
  'popup-closed-by-user': 'Sign-in window closed before finishing.',
  'network-request-failed': 'Network trouble. Check your connection and try again.',
}

function errorCode(err: unknown): string | null {
  if (typeof err === 'object' && err !== null && 'code' in err) {
    return String((err as { code: unknown }).code).replace(/^auth\//, '')
  }
  return null
}

function describe(err: unknown): string {
  const code = errorCode(err)
  if (code === null && err instanceof Error && err.message) {
    return err.message
  }
  const mapped = code !== null && ERROR_MESSAGES[code]
  // Unmapped codes surface in parentheses — easiest way to debug a new one.
  return mapped || (code ? `${FALLBACK} (${code})` : FALLBACK)
}

function maskPhone(digits: string): string {
  return `+91 ${digits.slice(0, 5)} ••• ${digits.slice(-2)}`
}

export default function AuthFlow({ onSignedIn, onSkip, onBusiness }: Props) {
  const [step, setStep] = useState<'phone' | 'code'>('phone')
  const [phone, setPhone] = useState('')
  const [confirmation, setConfirmation] = useState<ConfirmationResult | null>(null)
  const [sending, setSending] = useState(false)
  const [googling, setGoogling] = useState(false)
  const [error, setError] = useState('')
  const verifier = useRef<RecaptchaVerifier | null>(null)

  function resetVerifier() {
    try {
      verifier.current?.clear()
    } catch {
      // widget was already torn down
    }
    verifier.current = null
  }

  function getVerifier(): RecaptchaVerifier {
    if (!verifier.current) {
      verifier.current = new RecaptchaVerifier(auth, 'nz-recaptcha', {
        size: 'invisible',
      })
    }
    return verifier.current
  }

  /**
   * Requests the SMS code. Throws a friendly Error so the OTP screen can
   * display resend failures; the phone step keeps its own error state.
   */
  async function sendCode(resending: boolean): Promise<void> {
    setError('')
    setSending(true)
    try {
      if (!/^\d{10}$/.test(phone)) {
        throw new Error('Enter the 10-digit mobile number.')
      }
      const result = await signInWithPhoneNumber(auth, `+91${phone}`, getVerifier())
      setConfirmation(result)
      setStep('code')
    } catch (err) {
      resetVerifier()
      setError(describe(err))
      if (resending) {
        throw new Error(describe(err))
      }
    } finally {
      setSending(false)
    }
  }

  async function verify(code: string): Promise<void> {
    if (!confirmation) {
      throw new Error('No code request found — send a fresh OTP.')
    }
    try {
      await confirmation.confirm(code)
    } catch (err) {
      throw new Error(describe(err))
    }
    onSignedIn(maskPhone(phone))
  }

  /** Re-requests the SMS code while staying on the OTP screen. */
  async function resend(): Promise<void> {
    await sendCode(true)
  }

  async function google(): Promise<void> {
    setError('')
    setGoogling(true)
    try {
      const result = await signInWithPopup(auth, new GoogleAuthProvider())
      const user = result.user
      const name = user.displayName ?? user.email ?? 'Google user'
      onSignedIn(user.email ? `${name} · ${user.email}` : name)
    } catch (err) {
      setError(describe(err))
    } finally {
      setGoogling(false)
    }
  }

  return (
    <main className="flow">
      <div id="nz-recaptcha" aria-hidden="true" />

      <div className="flow-wrap">
        <header className="flow-top">
          <button
            type="button"
            className="btn-circle"
            aria-label="Back"
            onClick={step === 'code' ? () => setStep('phone') : onSkip}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.4}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M14.5 5.5 8 12l6.5 6.5" />
            </svg>
          </button>
          <button type="button" className="btn-notnow" onClick={onSkip}>
            Not now
          </button>
        </header>

        <div className="flow-main">
          <div className="flow-col">
            {step === 'phone' ? (
              <SignInPhone
                phone={phone}
                onPhone={setPhone}
                onSend={() => void sendCode(false)}
                sending={sending}
                googling={googling}
                onGoogle={() => void google()}
                error={error}
                onBusiness={onBusiness}
              />
            ) : (
              <VerifyCode
                phone={maskPhone(phone)}
                onSubmit={verify}
                onResend={resend}
              />
            )}
          </div>

          <ArtField />
        </div>

        <p className="fine">
          You can browse every offer without an account. By continuing you agree
          to our <a href="#terms">Terms</a> and <a href="#privacy">Privacy Policy</a>.
        </p>
      </div>
    </main>
  )
}
