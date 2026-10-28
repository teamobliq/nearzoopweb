import { useState } from 'react'
import logoUrl from '../assets/logo.svg'
// Reuses .btn-primary (with hover/active/disabled/focus states) from auth.css.
import './auth.css'
import './onboarding.css'

type TileColor = 'amber' | 'orange' | 'green'
type TileIcon = 'rupee' | 'pin' | 'shop'

type Slide = {
  title: string[]
  body: string
  tile: TileColor
  icon: TileIcon
  sticker: { big: string; small: string; white?: boolean }
}

/* Copy, tile colors and sticker content taken 1:1 from the app designs
   ("Deals on your locality", "Closer means better", "Walk in. Show. Save."). */
const SLIDES: Slide[] = [
  {
    title: ['Deals', 'on your', 'locality.'],
    body: 'Live offers from shops around you — phuchka stalls, saree ghars, mobile shops — updated by the shops themselves.',
    tile: 'amber',
    icon: 'rupee',
    sticker: { big: '20%', small: 'OFF' },
  },
  {
    title: ['Closer', 'means', 'better.'],
    body: 'Share your location while using the app to see what’s nearest. Prefer not to? Pick a locality by hand — everything still works.',
    tile: 'orange',
    icon: 'pin',
    sticker: { big: 'BOGO', small: 'PLATES', white: true },
  },
  {
    title: ['Walk in.', 'Show.', 'Save.'],
    body: 'Each offer says exactly how to redeem it: show the screen, mention a code, or claim a coupon. The shop’s terms always apply.',
    tile: 'green',
    icon: 'shop',
    sticker: { big: '10', small: 'FOR 8' },
  },
]

function PinIcon() {
  return (
    <svg
      className="art-icon"
      viewBox="0 0 96 96"
      fill="none"
      stroke="#FFFFFF"
      strokeWidth={6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M48 84C57.5 72.5 72 56.5 72 36a24 24 0 1 0-48 0c0 20.5 14.5 36.5 24 48Z" />
      <circle cx="48" cy="36" r="9" />
    </svg>
  )
}

function ShopIcon() {
  return (
    <svg
      className="art-icon"
      viewBox="0 0 96 96"
      fill="none"
      stroke="#1C1B19"
      strokeWidth={6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 44 20 20q1-4 5-4h46q4 0 5 4l8 24" />
      <path d="M12 44a9 9 0 0 0 18 0a9 9 0 0 0 18 0a9 9 0 0 0 18 0a9 9 0 0 0 18 0" />
      <path d="M20 52v32h56V52" />
      <path d="M42 84V62h14v22" />
    </svg>
  )
}

export default function Onboarding({ onExit }: { onExit: () => void }) {
  const [index, setIndex] = useState(0)
  const slide = SLIDES[index]
  const last = index === SLIDES.length - 1

  function finish() {
    try {
      // Remember completion so future visits skip straight past this.
      localStorage.setItem('nz.onboarded', '1')
    } catch {
      // Storage may be blocked — navigation still proceeds.
    }
    onExit()
  }

  function advance() {
    if (last) {
      finish()
    } else {
      setIndex(index + 1)
    }
  }

  return (
    <main className="onboard">
      <div className="onboard-wrap">
        <header className="onboard-top">
          <span className="onboard-brand">
            <img
              className="onboard-brandmark"
              src={logoUrl}
              alt=""
              aria-hidden="true"
            />
            NearZoop
          </span>
          <button type="button" className="onboard-skip" onClick={finish}>
            Skip
          </button>
        </header>

        <div className="onboard-main">
          <section className="onboard-copy" key={index}>
            <h1 className="onboard-title">
              {slide.title.map((line) => (
                <span key={line}>{line}</span>
              ))}
            </h1>
            <p className="onboard-body">{slide.body}</p>
          </section>

          <div className="onboard-art" key={`art-${index}`} aria-hidden="true">
            <div className={`art-tile art-tile-${slide.tile}`}>
              {slide.icon === 'rupee' ? (
                <span className="tile-rupee">₹</span>
              ) : slide.icon === 'pin' ? (
                <PinIcon />
              ) : (
                <ShopIcon />
              )}
            </div>
            <div
              className={`art-sticker art-sticker-${slide.tile}${
                slide.sticker.white ? ' sticker-white' : ''
              }`}
            >
              <span className="sticker-big">{slide.sticker.big}</span>
              <span className="sticker-small">{slide.sticker.small}</span>
            </div>
          </div>
        </div>

        <footer className="onboard-foot">
          <div
            role="group"
            className="onboard-dots"
            aria-label={`Slide ${index + 1} of ${SLIDES.length}`}
          >
            {SLIDES.map((s, i) => (
              <button
                key={s.title.join(' ')}
                type="button"
                className={`onboard-dot${i === index ? ' is-active' : ''}`}
                aria-label={`Go to slide ${i + 1}`}
                aria-current={i === index ? 'true' : undefined}
                onClick={() => setIndex(i)}
              />
            ))}
          </div>

          <button
            type="button"
            className="btn-primary onboard-cta"
            onClick={advance}
          >
            {last ? 'Find offers' : 'Next'}
            {!last && (
              <svg
                className="onboard-chev"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.6}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M9 5l7 7-7 7" />
              </svg>
            )}
          </button>
        </footer>
      </div>
    </main>
  )
}
