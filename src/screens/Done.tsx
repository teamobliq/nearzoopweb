import { signOut } from 'firebase/auth'
import { auth } from '../firebase'
import './auth.css'

type Props = {
  variant: 'guest' | 'signed-in'
  label?: string
  onSignOut?: () => void
}

export default function Done({ variant, label, onSignOut }: Props) {
  return (
    <main className="done">
      <section className="done-card">
        <h1 className="done-title">
          {variant === 'signed-in' ? 'You’re in.' : 'Browsing as guest.'}
        </h1>
        <p className="done-body">
          {variant === 'signed-in'
            ? `Signed in as ${label ?? 'you'}. Offer browsing is next up.`
            : 'Offer browsing is next up. You can sign in anytime to claim a coupon.'}
        </p>
        {variant === 'signed-in' && (
          <button
            type="button"
            className="btn-secondary done-signout"
            onClick={() => void signOut(auth).finally(onSignOut)}
          >
            Sign out
          </button>
        )}
      </section>
    </main>
  )
}
