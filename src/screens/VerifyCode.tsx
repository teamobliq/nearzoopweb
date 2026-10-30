import {
  useEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type KeyboardEvent,
} from 'react'

type Props = {
  phone: string
  onSubmit: (code: string) => Promise<void>
  onResend: () => Promise<void>
  /** Overrides the "Sent by SMS to …" line (used by the merchant flow). */
  sub?: string
  /** Overrides the submit button label. */
  submitLabel?: string
}

const LENGTH = 6
const RESEND_SECONDS = 30
const EMPTY = Array<string>(LENGTH).fill('')

export default function VerifyCode({
  phone,
  onSubmit,
  onResend,
  sub,
  submitLabel = 'Verify & continue',
}: Props) {
  const [digits, setDigits] = useState<string[]>(EMPTY)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [resending, setResending] = useState(false)
  const [resendIn, setResendIn] = useState(RESEND_SECONDS)
  const inputs = useRef<Array<HTMLInputElement | null>>([])

  useEffect(() => {
    inputs.current[0]?.focus()
  }, [])

  useEffect(() => {
    if (resendIn === 0) return
    const id = window.setInterval(() => {
      setResendIn((seconds) => (seconds > 0 ? seconds - 1 : 0))
    }, 1000)
    return () => window.clearInterval(id)
  }, [resendIn])

  function focusAt(index: number) {
    const target = inputs.current[index]
    target?.focus()
    target?.select()
  }

  function complete(code: string) {
    setBusy(true)
    setError('')
    onSubmit(code)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Something went wrong. Try again.')
        setDigits(EMPTY)
        focusAt(0)
      })
      .finally(() => setBusy(false))
  }

  function handleChange(index: number, value: string) {
    const digit = value.replace(/\D/g, '').slice(-1)
    const next = digits.slice()
    next[index] = digit
    setDigits(next)
    if (digit && index < LENGTH - 1) focusAt(index + 1)
    if (next.every(Boolean) && !busy) complete(next.join(''))
  }

  function handleKeyDown(index: number, event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Backspace') {
      event.preventDefault()
      const next = digits.slice()
      if (digits[index] === '' && index > 0) {
        next[index - 1] = ''
        setDigits(next)
        focusAt(index - 1)
      } else {
        next[index] = ''
        setDigits(next)
      }
    } else if (event.key === 'ArrowLeft' && index > 0) {
      event.preventDefault()
      focusAt(index - 1)
    } else if (event.key === 'ArrowRight' && index < LENGTH - 1) {
      event.preventDefault()
      focusAt(index + 1)
    } else if (event.key === 'Enter') {
      event.preventDefault()
      submitNow()
    }
  }

  function handlePaste(index: number, event: ClipboardEvent<HTMLInputElement>) {
    const pasted = event.clipboardData.getData('text').replace(/\D/g, '')
    if (!pasted) return
    event.preventDefault()
    const next = digits.slice()
    for (let i = 0; i < pasted.length && index + i < LENGTH; i += 1) {
      next[index + i] = pasted[i]
    }
    setDigits(next)
    focusAt(Math.min(index + pasted.length, LENGTH - 1))
    if (next.every(Boolean)) complete(next.join(''))
  }

  function submitNow() {
    if (busy) return
    const emptyAt = digits.findIndex((digit) => digit === '')
    if (emptyAt === -1) {
      complete(digits.join(''))
    } else {
      focusAt(emptyAt)
    }
  }

  async function resend() {
    if (resending || resendIn > 0) return
    setResending(true)
    setError('')
    try {
      await onResend()
      setResendIn(RESEND_SECONDS)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not resend. Try again.')
    } finally {
      setResending(false)
    }
  }

  const clock = `${Math.floor(resendIn / 60)}:${String(resendIn % 60).padStart(2, '0')}`

  return (
    <>
      <h1 className="auth-title">Enter the 6-digit code</h1>
      <p className="auth-sub">{sub ?? `Sent by SMS to ${phone}.`}</p>

      <div className="auth-otp">
        {digits.map((digit, index) => (
          <input
            key={index}
            ref={(element) => {
              inputs.current[index] = element
            }}
            className="auth-otp-box"
            type="text"
            inputMode="numeric"
            autoComplete={index === 0 ? 'one-time-code' : 'off'}
            aria-label={`Digit ${index + 1} of ${LENGTH}`}
            value={digit}
            disabled={busy}
            onChange={(event) => handleChange(index, event.target.value)}
            onKeyDown={(event) => handleKeyDown(index, event)}
            onPaste={(event) => handlePaste(index, event)}
            onFocus={(event) => (event.target as HTMLInputElement).select()}
            onClick={(event) => (event.target as HTMLInputElement).select()}
          />
        ))}
      </div>

      <p className="auth-resend">
        {resendIn > 0 ? (
          <>
            Resend in <b>{clock}</b>
          </>
        ) : (
          <button
            type="button"
            className="auth-resend-link"
            disabled={resending}
            onClick={() => void resend()}
          >
            {resending ? 'Sending…' : 'Resend OTP'}
          </button>
        )}
      </p>

      {error && (
        <p className="auth-error" role="alert">
          {error}
        </p>
      )}

      <button
        type="button"
        className="btn-primary auth-verify"
        disabled={busy}
        onClick={submitNow}
      >
        {busy ? 'Verifying…' : submitLabel}
      </button>
    </>
  )
}
