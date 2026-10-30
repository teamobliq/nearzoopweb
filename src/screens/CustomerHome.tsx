import { useEffect, useRef, useState } from 'react'
import type {
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
  ReactElement,
} from 'react'
import CustomerMap, { fmtKm, requestFix, type Coords, type MapPin } from './CustomerMap'
import {
  cacheCoords,
  cacheLocality,
  cachedCoords,
  cachedLocality,
  cachedRadiusKm,
  haversineKm,
  resolveLocalityName,
} from '../business/geocode'
import { watchFeed, type FeedRecord } from '../business/feed'
import { fmtDay } from '../business/when'
import Profile from './Profile'
import type { User } from 'firebase/auth'
import './customer.css'
// The feed cards reuse the merchant list's deal tile (biz-otile) for the
// discount, so business.css must ship in this bundle too.
import '../business/business.css'

/** The customer home — the "Nearby" tab. The painted map is the canvas:
    the user's fix with the search-radius circle, the live offer pins
    inside it, the location chip on top (tapping it re-runs the Locate
    step), and a rounded sheet that drags up over the map. Offers come
    from the public feed mirror (feed.ts) — the only offer data a customer
    can legally read — filtered to the radius, with honest states for
    loading, failure and genuinely-empty. */

type Props = {
  session: { variant: 'guest' | 'signed-in'; label?: string }
  /** The signed-in Firebase user, or null when browsing as guest. */
  user: User | null
  /** The location chip — re-runs the Locate step. */
  onEditLocation: () => void
  /** Opens one offer's detail page — `<shopUid>/<offerId>` — from a card. */
  onOpenOffer: (shopUid: string, offerId: string) => void
  /** The You tab's sign-in button — routes to the auth flow and back. */
  onSignIn: () => void
  /** After sign-out completes — the session flips to guest. */
  onSignOut: () => void
}

type View = 'nearby' | 'explore' | 'saved' | 'you'

const TABS: Array<{ key: View; label: string; icon: () => ReactElement }> = [
  { key: 'nearby', label: 'Nearby', icon: PinSvg },
  { key: 'explore', label: 'Explore', icon: GridSvg },
  { key: 'saved', label: 'Saved', icon: BookmarkSvg },
  { key: 'you', label: 'You', icon: PersonSvg },
]

function CrosshairSvg() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="5.5" />
      <circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none" />
      <path d="M12 2.5v3.2M12 18.3v3.2M2.5 12h3.2M18.3 12h3.2" />
    </svg>
  )
}

function ChevronSvg() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m6 9 6 6 6-6" />
    </svg>
  )
}

function PinSvg() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 21s-6.5-5.4-6.5-10a6.5 6.5 0 1 1 13 0C18.5 15.6 12 21 12 21Z" />
      <circle cx="12" cy="11" r="2.4" />
    </svg>
  )
}

function GridSvg() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" aria-hidden="true">
      <rect x="4" y="4" width="7" height="7" rx="1.6" />
      <rect x="13" y="4" width="7" height="7" rx="1.6" />
      <rect x="4" y="13" width="7" height="7" rx="1.6" />
      <rect x="13" y="13" width="7" height="7" rx="1.6" />
    </svg>
  )
}

function BookmarkSvg() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7 4h10v17l-5-4.5L7 21Z" />
    </svg>
  )
}

function PersonSvg() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="8" r="4" />
      <path d="M5 20c1.2-3.2 3.8-5 7-5s5.8 1.8 7 5" />
    </svg>
  )
}

/** The white pill over the map: eyebrow, locality · radius, chevron. */
function LocationChip({
  locality,
  radiusKm,
  hasFix,
  onEditLocation,
}: {
  locality: string | null
  radiusKm: number
  hasFix: boolean
  onEditLocation: () => void
}) {
  const value = locality
    ? `${locality} · ${fmtKm(radiusKm)}`
    : hasFix
      ? `${fmtKm(radiusKm)} around you`
      : 'Set your location'
  return (
    <button type="button" className="chome-locchip" onClick={onEditLocation}>
      <CrosshairSvg />
      <span className="chome-locchip-main">
        <span className="chome-locchip-eyebrow">Your location</span>
        <span className="chome-locchip-value">{value}</span>
      </span>
      <ChevronSvg />
    </button>
  )
}

/** "<1 km away" / "1.2 km away" — the card's distance line. */
function distLabel(km: number): string {
  return km < 1 ? '<1 km away' : `${km.toFixed(1)} km away`
}

/** One offer card — the feed mirror's fields in the house card language:
    the deal tile (the same biz-otile the merchant lists wear), the title,
    the shop line, and a meta row of distance + validity. Tapping opens
    the offer's own page. */
function OfferCard({
  item,
  selected,
  onSelect,
}: {
  item: FeedRecord & { km: number | null }
  selected: boolean
  onSelect: () => void
}) {
  const label = item.discountLabel?.trim() ?? ''
  const splitAt = label.indexOf(' ')
  const big = label === '' ? '—' : splitAt === -1 ? label : label.slice(0, splitAt)
  const small = label === '' ? '' : label.slice(splitAt + 1)
  const title = item.title ?? 'Untitled offer'
  const titleRef = useRef<HTMLSpanElement>(null)
  const [overflows, setOverflows] = useState(false)
  useEffect(() => {
    const el = titleRef.current
    if (!el) return
    setOverflows(el.scrollWidth > el.clientWidth + 1)
  }, [title])
  return (
    <li>
      <article
        id={`chome-card-${item.offerId}`}
        className={`chome-card${selected ? ' is-sel' : ''}`}
      >
        <button
          type="button"
          className="chome-card-hit"
          onClick={onSelect}
          aria-pressed={selected}
        >
          <span className={`biz-otile biz-otile-${item.tileColor ?? 'yellow'}`} aria-hidden="true">
            <span className="biz-otile-big">{big}</span>
            <span className="biz-otile-small">{small}</span>
          </span>
          <span className="chome-card-main">
            <span
              className={`chome-card-title${overflows ? ' is-marquee' : ''}`}
              ref={titleRef}
            >
              <span className="chome-card-title-track">
                {title}
                {overflows && <span aria-hidden="true">&nbsp;&nbsp;·&nbsp;&nbsp;{title}</span>}
              </span>
            </span>
            <span className="chome-card-shop">
              {item.shopName}
              {item.shopCategory ? ` · ${item.shopCategory}` : ''}
            </span>
            <span className="chome-card-meta">
              {item.km !== null && <span className="chome-card-dist">{distLabel(item.km)}</span>}
              {item.endsAt && <span>till {fmtDay(item.endsAt)}</span>}
            </span>
          </span>
        </button>
      </article>
    </li>
  )
}

export default function CustomerHome({
  session,
  user,
  onEditLocation,
  onOpenOffer,
  onSignIn,
  onSignOut,
}: Props) {
  // The fix, radius and locality label come from the Locate step's cache.
  const [fix, setFix] = useState<Coords | null>(() => cachedCoords())
  const [radiusKm] = useState<number>(cachedRadiusKm)
  const [locality, setLocality] = useState<string | null>(cachedLocality)
  const [view, setView] = useState<View>('nearby')
  // The sheet's two positions: resting over the map, or raised so the list
  // dominates and the map peeks behind.
  const [raised, setRaised] = useState(false)
  const [fitKey, setFitKey] = useState(0)
  const [fixing, setFixing] = useState(false)
  const [fixNote, setFixNote] = useState<string | null>(null)
  // The public feed — null until the first snapshot lands, so the sheet
  // never flashes a false "nothing here" while loading.
  const [feed, setFeed] = useState<FeedRecord[] | null>(null)
  const [feedError, setFeedError] = useState(false)
  // The selected offer — lit on its card and its map pin.
  const [selected, setSelected] = useState<string | null>(null)

  // The public feed mirror — the only offer data a customer can read.
  useEffect(
    () =>
      watchFeed(
        (items) => {
          setFeed(items)
          setFeedError(false)
        },
        () => setFeedError(true),
      ),
    [],
  )

  // The failure note reports one attempt, not a state — it clears itself.
  useEffect(() => {
    if (!fixNote) return
    const timer = window.setTimeout(() => setFixNote(null), 2600)
    return () => window.clearTimeout(timer)
  }, [fixNote])

  /** The map's crosshair button — a fresh fix, persisted like Locate's. */
  async function reFix() {
    if (fixing) return
    setFixing(true)
    const result = await requestFix()
    setFixing(false)
    if (!result) {
      setFixNote('Couldn’t get a fix right now.')
      return
    }
    setFix(result.coords)
    cacheCoords(result.coords)
    setFitKey((key) => key + 1)
    // Refresh the label in the background — the chip says the radius alone
    // until the name resolves.
    setLocality(null)
    void resolveLocalityName(result.coords.lat, result.coords.lng).then(
      (name) => {
        if (name) {
          setLocality(name)
          cacheLocality(name)
        }
      },
    )
  }

  /** Lights the card and its pin, raises the sheet and brings the card
      into view — the pin tap's whole journey. */
  function selectOffer(id: string) {
    setSelected(id)
    setRaised(true)
    window.setTimeout(() => {
      document
        .getElementById(`chome-card-${id}`)
        ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }, 380)
  }

  /** A card tap opens the offer's page; the card stays lit so the pin is
      still marked when the customer comes back. */
  function openOffer(item: FeedRecord) {
    setSelected(item.offerId)
    onOpenOffer(item.shopUid, item.offerId)
  }

  // The sheet handle: a tap toggles, a drag follows the gesture.
  const dragRef = useRef<{ startY: number; moved: boolean } | null>(null)

  function handlePointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
    dragRef.current = { startY: event.clientY, moved: false }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current
    if (!drag) return
    const dy = event.clientY - drag.startY
    if (Math.abs(dy) < 14) return
    drag.moved = true
    setRaised(dy < 0)
  }

  function handlePointerUp() {
    const drag = dragRef.current
    dragRef.current = null
    if (drag && !drag.moved) setRaised((value) => !value)
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      setRaised((value) => !value)
    }
  }

  // The feed, filtered to what a customer may see right now: live status,
  // shop not on holiday, subscription not lapsed, inside its date window.
  // Everything is judged from the mirror's own copied fields — the client
  // re-derives dates live, so scheduled offers wake up without a write.
  const now = Date.now()
  const live = (feed ?? []).filter((item) => {
    if (item.status !== 'live' || item.shopPaused) return false
    if (item.feeExpiresAt && item.feeExpiresAt <= new Date().toISOString()) {
      return false
    }
    if (item.startsAt && Date.parse(item.startsAt) > now) return false
    if (item.endsAt && Date.parse(item.endsAt) < now) return false
    return true
  })

  // Distance from the current fix, where both ends have coordinates.
  const withDistance = (items: FeedRecord[]) =>
    items.map((item) => ({
      ...item,
      km:
        fix && typeof item.lat === 'number' && typeof item.lng === 'number'
          ? haversineKm(fix, { lat: item.lat, lng: item.lng })
          : null,
    }))

  // Nearby: inside the radius, nearest first. Explore: everything live,
  // nearest (or soonest-ending without a fix) first.
  const nearby = withDistance(live)
    .filter((item) => item.km !== null && item.km <= radiusKm)
    .sort((a, b) => (a.km ?? 0) - (b.km ?? 0))
  const explore = withDistance(live).sort(
    (a, b) =>
      (a.km ?? Number.POSITIVE_INFINITY) - (b.km ?? Number.POSITIVE_INFINITY) ||
      (a.endsAt ?? '9999').localeCompare(b.endsAt ?? '9999'),
  )

  // Pins ride only for offers inside the radius — the map is framed to the
  // circle, so anything else would sit off-screen.
  const pins: MapPin[] = nearby.flatMap((item) =>
    typeof item.lat === 'number' && typeof item.lng === 'number'
      ? [
          {
            id: item.offerId,
            lat: item.lat,
            lng: item.lng,
            selected: selected === item.offerId,
            label:
              item.discountLabel?.trim().split(' ')[0] ||
              item.discountLabel?.trim() ||
              '—',
          },
        ]
      : [],
  )

  const plural = (count: number, word: string) =>
    `${count} ${word}${count === 1 ? '' : 's'}`

  return (
    <main className={`chome${raised ? ' is-raised' : ''}`}>
      <section className="chome-map" aria-label="Map of your area">
        <CustomerMap
          fix={fix}
          radiusKm={radiusKm}
          fitKey={fitKey}
          className="chome-canvas"
          pins={pins}
          onSelectPin={selectOffer}
          attributionCorner="top-right"
        />
        <div className="chome-top">
          <LocationChip
            locality={locality}
            radiusKm={radiusKm}
            hasFix={fix !== null}
            onEditLocation={onEditLocation}
          />
        </div>
        <button
          type="button"
          className="chome-locatefab"
          onClick={() => void reFix()}
          disabled={fixing}
          aria-label={fixing ? 'Finding your location' : 'Refresh my location'}
        >
          <CrosshairSvg />
        </button>
        {fixNote && (
          <p className="chome-note" role="status">
            {fixNote}
          </p>
        )}
      </section>

      <section className="chome-sheet">
        <button
          type="button"
          className="chome-handle"
          aria-label={raised ? 'Show the map' : 'Show the sheet'}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onKeyDown={handleKeyDown}
        >
          <span className="chome-handlebar" />
        </button>

        <div className="chome-paneltop">
          <LocationChip
            locality={locality}
            radiusKm={radiusKm}
            hasFix={fix !== null}
            onEditLocation={onEditLocation}
          />
        </div>

        {view === 'nearby' && (
          <div className="chome-body">
            {feedError ? (
              <>
                <h1 className="chome-title">Couldn’t load offers.</h1>
                <p className="chome-lede">
                  Check the connection — the map still works, and this list
                  fills in the moment the feed reaches us again.
                </p>
              </>
            ) : feed === null ? (
              <p className="chome-loading" role="status">
                Looking around…
              </p>
            ) : !fix ? (
              <>
                <h1 className="chome-title">Set your location first.</h1>
                <p className="chome-lede">
                  Pick a locality or use your current location, and offers
                  around it will show up here and on the map.
                </p>
                <button
                  type="button"
                  className="btn-primary chome-cta"
                  onClick={onEditLocation}
                >
                  Set location
                </button>
              </>
            ) : nearby.length > 0 ? (
              <>
                <h1 className="chome-title">
                  {plural(nearby.length, 'offer')} nearby.
                </h1>
                <p className="chome-sub">
                  Within {fmtKm(radiusKm)}
                  {locality ? ` of ${locality}` : ''}
                </p>
                <ul className="chome-cards">
                  {nearby.map((item) => (
                    <OfferCard
                      key={item.offerId}
                      item={item}
                      selected={selected === item.offerId}
                      onSelect={() => openOffer(item)}
                    />
                  ))}
                </ul>
              </>
            ) : live.length > 0 ? (
              <>
                <h1 className="chome-title">
                  Nothing within {fmtKm(radiusKm)} yet.
                </h1>
                <p className="chome-lede">
                  Live offers are out there — widen your radius from the
                  location chip, or browse everything under Explore.
                </p>
              </>
            ) : (
              <>
                <h1 className="chome-title">No offers nearby yet.</h1>
                <p className="chome-sub">
                  Within {fmtKm(radiusKm)}
                  {locality ? ` of ${locality}` : ''}
                </p>
                <p className="chome-lede">
                  Offers land here the moment verified shops around you go
                  live — on the map above too. Drag the map to look around,
                  or widen the radius from your location chip.
                </p>
              </>
            )}
          </div>
        )}

        {view === 'explore' && (
          <div className="chome-body">
            {feedError ? (
              <>
                <h1 className="chome-title">Couldn’t load offers.</h1>
                <p className="chome-lede">Check the connection and try again.</p>
              </>
            ) : feed === null ? (
              <p className="chome-loading" role="status">
                Looking around…
              </p>
            ) : explore.length > 0 ? (
              <>
                <h1 className="chome-title">
                  {plural(explore.length, 'live offer')}.
                </h1>
                <p className="chome-sub">Every live offer on NearZoop.</p>
                <ul className="chome-cards">
                  {explore.map((item) => (
                    <OfferCard
                      key={item.offerId}
                      item={item}
                      selected={selected === item.offerId}
                      onSelect={() => openOffer(item)}
                    />
                  ))}
                </ul>
              </>
            ) : (
              <>
                <h1 className="chome-title">Nothing to explore yet.</h1>
                <p className="chome-lede">
                  The first offers appear once shops start going live nearby.
                </p>
              </>
            )}
          </div>
        )}

        {view === 'saved' && (
          <div className="chome-body">
            <h1 className="chome-title">Nothing saved yet.</h1>
            <p className="chome-lede">
              Bookmark an offer from its card and it waits here while it's
              live.
            </p>
          </div>
        )}

        {view === 'you' && (
          <div className="chome-body">
            {session.variant === 'signed-in' && user ? (
              <Profile user={user} onSignOut={onSignOut} />
            ) : (
              <div className="chome-you">
                <span className="chome-avatar" aria-hidden="true">
                  <PersonSvg />
                </span>
                <h2>Browsing as guest</h2>
                <p>
                  Sign in to claim coupons at the counter and keep the
                  offers you save.
                </p>
                <button
                  type="button"
                  className="btn-primary chome-you-btn"
                  onClick={onSignIn}
                >
                  Sign in
                </button>
              </div>
            )}
          </div>
        )}
      </section>

      <nav className="chome-tabs" aria-label="Customer sections">
        {TABS.map((tab) => {
          const Icon = tab.icon
          return (
            <button
              key={tab.key}
              type="button"
              className={`chome-tab${view === tab.key ? ' is-on' : ''}`}
              onClick={() => setView(tab.key)}
              aria-current={view === tab.key ? 'page' : undefined}
            >
              <span className="chome-tab-ico">
                <Icon />
              </span>
              <span className="chome-tab-label">{tab.label}</span>
            </button>
          )
        })}
      </nav>
    </main>
  )
}
