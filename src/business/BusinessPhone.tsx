import type { FormEvent } from 'react'

type Props = {
  phone: string
  onPhone: (value: string) => void
  onSend: () => void
  sending: boolean
  error: string
}

export default function BusinessPhone({
  phone,
  onPhone,
  onSend,
  sending,
  error,
}: Props) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    onSend()
  }

  return (
    <>
      <h1 className="auth-title">Your business mobile number</h1>
      <p className="auth-sub">
        Customers won’t see this unless you choose to show it. We’ll send an
        OTP by SMS.
      </p>

      <form className="auth-form" onSubmit={handleSubmit} noValidate>
        <div className="auth-field-row">
          <span className="auth-country" title="India (+91)">
            +91
          </span>
          <input
            className="auth-phone"
            type="tel"
            inputMode="numeric"
            autoComplete="tel"
            aria-label="10-digit business mobile number"
            placeholder="98311 22334"
            maxLength={10}
            value={phone}
            onChange={(event) =>
              onPhone(event.target.value.replace(/\D/g, '').slice(0, 10))
            }
          />
        </div>

        <button type="submit" className="btn-primary" disabled={sending}>
          {sending ? 'Sending…' : 'Send OTP'}
        </button>
      </form>

      {error && (
        <p className="auth-error" role="alert">
          {error}
        </p>
      )}
    </>
  )
}
