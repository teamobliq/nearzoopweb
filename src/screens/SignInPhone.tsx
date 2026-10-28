import type { FormEvent } from 'react'

type Props = {
  phone: string
  onPhone: (value: string) => void
  onSend: () => void
  sending: boolean
  googling: boolean
  onGoogle: () => void
  error: string
  onBusiness: () => void
}

export default function SignInPhone({
  phone,
  onPhone,
  onSend,
  sending,
  googling,
  onGoogle,
  error,
  onBusiness,
}: Props) {

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    onSend()
  }

  return (
    <>
      <h1 className="auth-title">Sign in to NearZoop</h1>
      <p className="auth-sub">
        Sign in to claim coupons so the shop can verify it&rsquo;s yours.
      </p>

      <form className="auth-form" onSubmit={handleSubmit} noValidate>
        <div className="auth-field-row">
          <span className="auth-country" title="India (+91)">
            <svg width="21" height="15" viewBox="0 0 21 15" aria-hidden="true">
              <rect width="21" height="5" fill="#FF9933" />
              <rect y="5" width="21" height="5" fill="#FFFFFF" />
              <rect y="10" width="21" height="5" fill="#138808" />
              <circle cx="10.5" cy="7.5" r="1.9" fill="#000080" />
            </svg>
            +91
          </span>
          <input
            className="auth-phone"
            type="tel"
            inputMode="numeric"
            autoComplete="tel"
            aria-label="10-digit mobile number"
            placeholder="98300 45621"
            maxLength={10}
            value={phone}
            onChange={(event) =>
              onPhone(event.target.value.replace(/\D/g, '').slice(0, 10))
            }
          />
        </div>

        <button
          type="button"
          className="auth-business"
          onClick={onBusiness}
        >
          Join as Business
        </button>

        <button type="submit" className="btn-primary" disabled={sending}>
          {sending ? 'Sending…' : 'Send OTP'}
        </button>
      </form>

      <div className="auth-or">
        <span>or</span>
      </div>

      <button
        type="button"
        className="btn-secondary"
        disabled={googling}
        onClick={onGoogle}
      >
        <svg
          className="auth-icon"
          viewBox="0 0 48 48"
          aria-hidden="true"
        >
          <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
          <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
          <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
          <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
        </svg>
        {googling ? 'Opening…' : 'Continue with Google'}
      </button>

      {error && (
        <p className="auth-error" role="alert">
          {error}
        </p>
      )}
    </>
  )
}
