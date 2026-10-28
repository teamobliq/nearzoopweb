import logoUrl from '../assets/logo.svg'

type Props = {
  onRegister: () => void
  onExisting: () => void
}

export default function BusinessLanding({ onRegister, onExisting }: Props) {
  return (
    <main className="biz-landing">
      <div className="biz-landing-wrap">
        <header className="biz-top">
          <span className="biz-brand">
            <img
              className="biz-brandmark"
              src={logoUrl}
              alt=""
              aria-hidden="true"
            />
            NearZoop
          </span>
          <span className="biz-badge">Business</span>
        </header>

        <div className="biz-main">
          <div className="biz-art" aria-hidden="true">
            <div className="biz-tile">
              <svg
                className="biz-tile-icon"
                viewBox="0 0 96 96"
                fill="none"
                stroke="#FFFFFF"
                strokeWidth={7}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 44 20 20q1-4 5-4h46q4 0 5 4l8 24" />
                <path d="M12 44a9 9 0 0 0 18 0a9 9 0 0 0 18 0a9 9 0 0 0 18 0a9 9 0 0 0 18 0" />
                <path d="M20 52v32h56V52" />
                <path d="M42 84V62h14v22" />
              </svg>
            </div>
            <div className="biz-stat">
              <span className="biz-stat-label">This week</span>
              <span className="biz-stat-big">1,284</span>
              <span className="biz-stat-sub">people saw your offer</span>
            </div>
          </div>

          <div className="biz-side">
            <div className="biz-copy">
              <h1 className="biz-title">
                <span>Bring your</span>
                <span>locality through</span>
                <span>the door.</span>
              </h1>
              <p className="biz-body">
                Post an offer in two minutes. People within a few km see it on
                their map. Free to start.
              </p>
            </div>

            <div className="biz-actions">
              <button
                type="button"
                className="btn-primary biz-btn"
                onClick={onRegister}
              >
                <svg
                  className="biz-cta-icon"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2.2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92Z" />
                </svg>
                Register your shop
              </button>
              <button
                type="button"
                className="btn-secondary biz-btn"
                onClick={onExisting}
              >
                I already have an account
              </button>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
