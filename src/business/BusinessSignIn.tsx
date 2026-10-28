import { useRef, useState } from 'react'
import {
  RecaptchaVerifier,
  signInWithPhoneNumber,
  signOut,
  type ConfirmationResult,
} from 'firebase/auth'
import { auth } from '../firebase'
import VerifyCode from '../screens/VerifyCode'
import BusinessLanding from './BusinessLanding'
import BusinessPhone from './BusinessPhone'
import BusinessSetup from './BusinessSetup'
import BusinessStatus from './BusinessStatus'
import '../screens/auth.css'
import './business.css'

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

/** Merchant fine print, shown on both phone and OTP screens. */
export function BizLegal() {
  return (
    <p className="biz-legal">
      By continuing you agree to the <a href="#merchant-terms">Merchant Terms</a>{' '}
      and <a href="#offer-guidelines">Offer Guidelines</a>.
    </p>
  )
}

type Step = 'landing' | 'phone' | 'code' | 'setup' | 'checking' | 'failed' | 'dash'

export default function BusinessSignIn() {
  const [step, setStep] = useState<Step>('landing')
  const [phone, setPhone] = useState('')
  const [confirmation, setConfirmation] = useState<ConfirmationResult | null>(null)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [setupStart, setSetupStart] = useState<0 | 1 | 2>(0)
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
      verifier.current = new RecaptchaVerifier(auth, 'nz-biz-recaptcha', {
        size: 'invisible',
      })
    }
    return verifier.current
  }

  /**
   * Requests the SMS code. Throws a friendly Error on resend so the OTP
   * screen can display the failure; the phone step keeps its own state.
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
    setStep('setup')
  }

  /** Re-requests the SMS code while staying on the OTP screen. */
  async function resend(): Promise<void> {
    await sendCode(true)
  }

  /** Signs the merchant back out and returns to the landing screen. */
  function leaveAuth(): void {
    void signOut(auth).catch(() => undefined)
    resetVerifier()
    setConfirmation(null)
    setPhone('')
    setError('')
    setStep('landing')
  }

  if (step === 'landing') {
    return (
      <BusinessLanding
        onRegister={() => setStep('phone')}
        onExisting={() => setStep('phone')}
      />
    )
  }

  if (step === 'setup') {
    return (
      <BusinessSetup
        phone={phone}
        startStep={setupStart}
        onSubmitted={() => setStep('checking')}
        onBackToCode={() => setStep('code')}
      />
    )
  }

  if (step === 'checking' || step === 'failed') {
    return (
      <BusinessStatus
        variant={step}
        onPrimary={() => {
          if (step === 'checking') {
            setStep('dash')
          } else {
            // "Upload another document" re-enters the wizard at verification.
            setSetupStart(2)
            setStep('setup')
          }
        }}
        onDashboard={() => setStep('dash')}
        onDemoSwitch={() =>
          setStep(step === 'checking' ? 'failed' : 'checking')
        }
      />
    )
  }

  return (
    <main className="biz-page">
      <div className="biz-shell">
        <div id="nz-biz-recaptcha" aria-hidden="true" />

        {step === 'dash' ? (
          <div className="biz-center">
            <section className="done-card">
              <h1 className="done-title">Welcome, shopkeeper.</h1>
              <p className="done-body">
                You’re in as {maskPhone(phone)}. The dashboard where you post
                offers is the next build.
              </p>
              <button
                type="button"
                className="btn-secondary done-signout"
                onClick={leaveAuth}
              >
                Sign out
              </button>
            </section>
          </div>
        ) : (
          <>
            <div className="biz-backrow">
              <button
                type="button"
                className="btn-circle"
                aria-label="Back"
                onClick={() =>
                  step === 'code' ? setStep('phone') : setStep('landing')
                }
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
            </div>

            {step === 'phone' ? (
              <BusinessPhone
                phone={phone}
                onPhone={setPhone}
                onSend={() => void sendCode(false)}
                sending={sending}
                error={error}
              />
            ) : (
              <VerifyCode
                phone={maskPhone(phone)}
                onSubmit={verify}
                onResend={resend}
                sub={`Sent to ${maskPhone(phone)}.`}
                submitLabel="Verify"
              />
            )}

            <BizLegal />
          </>
        )}
      </div>
    </main>
  )
}
