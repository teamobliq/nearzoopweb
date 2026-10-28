import { useEffect, useRef, useState } from 'react'
import {
  onAuthStateChanged,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  signOut,
  type ConfirmationResult,
  type User,
} from 'firebase/auth'
import { auth } from '../firebase'
import VerifyCode from '../screens/VerifyCode'
import BusinessDashboard from './BusinessDashboard'
import BusinessLanding from './BusinessLanding'
import BusinessPhone from './BusinessPhone'
import BusinessSetup from './BusinessSetup'
import BusinessStatus from './BusinessStatus'
import { fetchShop, saveShop, watchShop, type ShopPatch, type ShopRecord } from './shop'
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

/** Resolves with the auth state's next value — used right after OTP confirm,
    where auth.currentUser can lag the confirmation by a tick. */
function nextAuthUser(): Promise<User | null> {
  return new Promise((resolve) => {
    const unsub = onAuthStateChanged(auth, (user) => {
      unsub()
      resolve(user)
    })
  })
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
  const [setupStart, setSetupStart] = useState<0 | 1 | 2 | 3>(0)
  const [booting, setBooting] = useState(true)
  const [bootError, setBootError] = useState('')
  const [setupError, setSetupError] = useState('')
  const [savedShop, setSavedShop] = useState<ShopRecord | null>(null)
  const [autoVerified, setAutoVerified] = useState(false)
  /** True once the fee is settled this session — covers merchants whose shop
      doc was never fetched (fresh sign-ups), where savedShop stays null. */
  const [hasPaid, setHasPaid] = useState(false)
  const verifier = useRef<RecaptchaVerifier | null>(null)
  const bootedRef = useRef(false)

  /**
   * Routes a signed-in merchant: finished setup → dashboard; otherwise the
   * wizard, resumed one step past whatever's already saved — which lands an
   * unpaid, fully-saved shop directly on the wizard's payment step. Shared
   * by the boot check and the post-OTP routing — the same number can log in
   * OR register, and Firebase reuses the existing account either way.
   */
  function routeSignedIn(shop: ShopRecord | null): void {
    setSavedShop(shop)
    setAutoVerified(shop?.verification === 'verified')
    if (shop?.setupDone) {
      // A rejected shop re-opens on the failed screen — the merchant sees the
      // admin's reason and the "Upload another document" path instead of a
      // silently unbadged dashboard.
      if (shop.verification === 'failed') {
        setStep('failed')
        return
      }
      setStep('dash')
      return
    }
    if (shop) {
      setSetupStart(Math.min((shop.setupStep ?? -1) + 1, 3) as 0 | 1 | 2 | 3)
    }
    // Diagnostic: if a finished merchant ever lands here again, the console
    // records exactly what the boot read saw.
    console.info(
      '[busdash] routing to setup —',
      shop
        ? { setupStep: shop.setupStep, setupDone: shop.setupDone }
        : 'no shop doc for this uid',
    )
    setStep('setup')
  }

  /**
   * Session router: on load, a signed-in merchant with a saved shop goes
   * straight to the dashboard; one without a shop resumes the setup wizard.
   * Later auth events only handle sign-out (sign-in is driven by the OTP flow).
   */
  useEffect(() => {
    return onAuthStateChanged(auth, (user) => {
      const initial = !bootedRef.current
      bootedRef.current = true
      if (!user) {
        setBooting(false)
        if (!initial) {
          setStep('landing')
        }
        return
      }
      void (async () => {
        try {
          const shop = await fetchShop(user.uid)
          if (initial) {
            routeSignedIn(shop)
          }
        } catch {
          // Only the initial routing owns this error — a later auth event's
          // failed re-check must not mask an already-made decision.
          if (initial) {
            setBootError(
              "Couldn't check your shop details. Check your connection, then reload.",
            )
          }
        } finally {
          setBooting(false)
        }
      })()
    })
  }, [])

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

  /**
   * Confirms the OTP, then routes exactly like the boot check: an existing
   * account with a finished shop lands on the dashboard (a login), a fresh
   * number or an unfinished setup lands in the wizard. Firebase reuses the
   * same account for a number either way — nothing is duplicated.
   */
  async function verify(code: string): Promise<void> {
    if (!confirmation) {
      throw new Error('No code request found — send a fresh OTP.')
    }
    try {
      await confirmation.confirm(code)
    } catch (err) {
      throw new Error(describe(err))
    }
    // confirmation.confirm() can resolve a beat before auth.currentUser is
    // set — never dump the merchant into a fresh wizard on that race; wait
    // for the auth state to settle instead.
    const user = auth.currentUser ?? (await nextAuthUser())
    if (!user) {
      setStep('landing')
      return
    }
    let shop: ShopRecord | null
    try {
      shop = await fetchShop(user.uid)
    } catch {
      // Stay put with a clear message rather than risk dumping an existing
      // merchant into a fresh wizard (which could overwrite their saved
      // shop). A reload routes correctly via the boot check.
      throw new Error(
        "Couldn't check your shop details. Reload the page to continue.",
      )
    }
    routeSignedIn(shop)
  }

  /**
   * The merchant's 10-digit number for prefilling "Phone for customers":
   * Firebase Auth's E.164 number when available (survives reloads), else
   * whatever was typed this session.
   */
  function merchantPhone(): string {
    const digits = (auth.currentUser?.phoneNumber ?? '').replace(/^\+91/, '')
    return /^\d{10}$/.test(digits) ? digits : phone
  }

  /** Re-requests the SMS code while staying on the OTP screen. */
  async function resend(): Promise<void> {
    await sendCode(true)
  }

  /**
   * While the merchant waits on the checking screen, their shop doc is
   * watched live: when the admin panel sets a verdict the screen flips on
   * its own — verified goes straight to the dashboard, failed to the retry
   * screen.
   */
  const [watchedShop, setWatchedShop] = useState<ShopRecord | null>(null)
  useEffect(() => {
    if (step !== 'checking' && step !== 'failed') return
    const user = auth.currentUser
    if (!user) return
    return watchShop(user.uid, (shop) => {
      setWatchedShop(shop)
      if (shop?.verification === 'verified') {
        setStep('dash')
      } else if (shop?.verification === 'failed') {
        setStep('failed')
      }
    })
  }, [step])

  /**
   * Persists the wizard's progress after every Continue. Steps 1–2 store the
   * fields plus a setupStep marker; the final submit stores the documents
   * and the wizard advances to its payment step — unless the fee is already
   * settled (a re-submission after a failed check), in which case
   * verification reopens and the checking screen takes over. Throws on
   * failure so the wizard stays on its current step.
   */
  async function saveProgress(
    patch: ShopPatch,
    completedStep: 0 | 1 | 2,
  ): Promise<void> {
    const user = auth.currentUser
    if (!user) {
      setStep('landing')
      return
    }
    setSetupError('')
    const paid = savedShop?.paymentDone === true || hasPaid
    try {
      await saveShop(user.uid, {
        ...patch,
        setupStep: completedStep,
        ...(completedStep === 2
          ? paid
            ? {
                setupDone: true,
                verification: patch.verification ?? ('pending' as const),
              }
            : {
                // First submission: verification opens only once the fee is
                // paid; an auto-verified GSTIN is kept for after payment.
                ...(patch.verification
                  ? { verification: patch.verification }
                  : {}),
              }
          : {}),
      })
    } catch {
      setSetupError(
        'Could not save your shop. Check your connection and try again.',
      )
      throw new Error('save failed')
    }
    if (completedStep === 2) {
      if (patch.verification === 'verified') {
        setAutoVerified(true)
      }
      if (paid) {
        // Re-submission after a failed check — the fee is settled, so the
        // checking screen takes over again.
        setStep(patch.verification === 'verified' ? 'dash' : 'checking')
      }
      // Unpaid: stay in setup — the wizard advances to its payment step.
    }
  }

  /**
   * Saves a successful ₹1,000 payment: records the reference, flips setupDone
   * and opens verification — unless the GSTIN was already auto-verified, in
   * which case the dashboard is next. Throws on save failure so the wizard's
   * payment step can retry with the same payment id.
   */
  async function completePayment(paymentId: string): Promise<void> {
    const user = auth.currentUser
    if (!user) {
      setStep('landing')
      return
    }
    await saveShop(user.uid, {
      paymentDone: true,
      paymentId,
      setupDone: true,
      ...(autoVerified ? {} : { verification: 'pending' as const }),
    })
    setHasPaid(true)
    setSavedShop((current) =>
      current
        ? { ...current, paymentDone: true, paymentId, setupDone: true }
        : current,
    )
    setStep(autoVerified ? 'dash' : 'checking')
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

  if (booting) {
    return (
      <main className="biz-page">
        <div className="biz-shell">
          <div className="biz-center">
            <p className="biz-boot">{bootError || 'Checking your session…'}</p>
            {bootError && (
              <button
                type="button"
                className="biz-linkbtn"
                onClick={() => window.location.reload()}
              >
                Reload
              </button>
            )}
          </div>
        </div>
      </main>
    )
  }

  if (step === 'landing') {
    return (
      <BusinessLanding
        onRegister={() => setStep('phone')}
        onExisting={() => setStep('phone')}
      />
    )
  }

  if (step === 'dash') {
    const user = auth.currentUser
    if (!user) {
      return (
        <main className="biz-page">
          <div className="biz-shell">
            <div className="biz-center">
              <p className="biz-boot">
                Session expired. Reload the page to continue.
              </p>
            </div>
          </div>
        </main>
      )
    }
    return <BusinessDashboard uid={user.uid} onSignOut={leaveAuth} />
  }

  if (step === 'setup') {
    return (
      <BusinessSetup
        phone={merchantPhone()}
        startStep={setupStart}
        submitError={setupError}
        onSave={saveProgress}
        shopName={savedShop?.name ?? ''}
        ownerName={savedShop?.ownerName ?? ''}
        onPaid={completePayment}
      />
    )
  }

  if (step === 'checking' || step === 'failed') {
    return (
      <BusinessStatus
        variant={step}
        note={watchedShop?.reviewNote ?? savedShop?.reviewNote}
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
      />
    )
  }

  return (
    <main className="biz-page">
      <div className="biz-shell">
        <div id="nz-biz-recaptcha" aria-hidden="true" />

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
      </div>
    </main>
  )
}
