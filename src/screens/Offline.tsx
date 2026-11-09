type Props = {
  /** Re-runs the connectivity check on demand (user tap, not a poll). */
  onRetry: () => void
  /** The browser reports we are offline again (or the retry keeps failing). */
  checking: boolean
}

/** Full-screen offline fallback — the app cannot shop, claim or sign in
    without a network, so it says so instead of spinning. */
export default function Offline({ onRetry, checking }: Props) {
  return (
    <main className="done offline">
      <section className="done-card">
        <span className="offline-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="2" y1="2" x2="22" y2="22" />
            <path d="M8.5 16.5a5 5 0 0 1 7 0" />
            <path d="M2 8.82a15 15 0 0 1 4.17-2.65" />
            <path d="M10.66 5c4.01-.36 8.14.9 11.34 3.76" />
            <path d="M16.85 11.25a10 10 0 0 1 2.22 1.68" />
            <path d="M5 13a10 10 0 0 1 5.24-2.76" />
            <line x1="12" y1="20" x2="12.01" y2="20" />
          </svg>
        </span>
        <h1 className="done-title">No internet.</h1>
        <p className="done-body">
          NearZoop needs a connection to show offers, claims and coupons.
          Check your Wi-Fi or mobile data, and we'll continue the moment
          it's back.
        </p>
        <button
          type="button"
          className="btn-secondary done-signout"
          onClick={onRetry}
          disabled={checking}
        >
          {checking ? 'Checking…' : 'Try again'}
        </button>
      </section>
    </main>
  )
}
