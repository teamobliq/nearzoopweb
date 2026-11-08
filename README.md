# NearZoop

NearZoop is a local-offers PWA. Customers open it to discover live offers from shops around them — a map, a feed and claimable coupons. Merchants run offers from a console and verify vouchers at the counter; listing costs an annual ₹1,000 fee. Admins review and approve shops and offers before they go live. One codebase, three surfaces.

The loop in one line: merchant creates an offer → offer is mirrored to the public feed once approved → customer claims it as an in-app coupon (doc id = the code) → customer shows the QR at the counter → merchant's scanner flips the coupon to used and logs a redemption.

## Stack

- Vite 8 · React 19 · TypeScript 6
- Firebase JS SDK 13 — Auth (phone OTP for customers and merchants, Google for admins) and Firestore. **`firestore.rules` is the data-layer security model**, not a formality.
- MapLibre GL + OpenFreeMap (keyless) for maps — every surface runs on it with no key set; Google Maps (styled-maps palette) takes over when `VITE_GMAPS_KEY` is set.
- Razorpay Checkout for the annual fee, settled server-side (see below).
- Vercel — hosting plus Functions under `api/`.
- QR generation via `qrcode`; fonts self-hosted via `@fontsource`.

## Repo map

```
src/screens/    customer app — splash → onboarding → phone auth → locate → home (map + offer feed),
                offer detail (deep link), my coupons, coupon pass (QR)
src/business/   merchant console — onboarding wizard (incl. the Razorpay fee step and GSTIN
                verification via the /gstapi proxy), dashboard, offers CRUD, QR scanner and
                redemptions, insights, notifications. Entered at /busdash (unlinked route).
src/admin/      ops console — Google sign-in, allow-listed via VITE_ADMIN_EMAILS,
                entered at /nz-admin (unlinked route)
src/assets/     logo and static art
api/            Vercel serverless functions — payment order / verify / webhook
                (see docs/razorpay-setup.md)
firestore.rules the whole access model — read it before changing data shapes
vite.config.ts  dev proxy for gstinapi.in (/gstapi/*) + usePolling for the mounted drive
```

`app design/` and `brag-output/` are untracked working artifacts (design references, launch assets) — not app code.

## Setup

```sh
npm install
cp .env.example .env
# Fill at minimum the VITE_FIREBASE_* block — Firebase console → Project settings → Your apps
npm run dev   # http://localhost:5173
```

- Merchant console: `http://localhost:5173/busdash` · Admin console: `http://localhost:5173/nz-admin` — both routes are deliberately unlinked from the UI.
- Use a recent Node LTS. `.npmrc` pins `legacy-peer-deps=true` for React 19 peer ranges.
- The repo lives on a mounted drive where inotify events are unreliable, so `vite.config.ts` sets `server.watch.usePolling` — HMR depends on it here. Drop it on a normal local disk if you like.
- Dev runs in StrictMode, so effects (splash/session-restore included) fire twice in development. Not a bug; production is unaffected.
- GSTIN verification in the merchant wizard needs `GSTIN_API_KEY` (no `VITE_` prefix — server-side only). gstinapi.in sends no CORS headers, so the Vite dev proxy injects the key into `/gstapi/*` requests; `vite preview` gets the same proxy.
- Without `VITE_RAZORPAY_KEY_ID` the payment step renders but the Pay button stays disabled.
- The app talks to the live Firebase project — there is no emulator wiring. Phone sign-in needs the Phone provider enabled under Authentication → Sign-in method; otherwise the wizard fails with `auth/operation-not-allowed` (the UI shows a readable message for it).

## Environment variables

All names are listed in `.env.example`. The ones that change behaviour:

| Variable | Used for | Required? |
| --- | --- | --- |
| `VITE_FIREBASE_*` | Firebase web config — baked into the bundle | Yes — app won't boot without it |
| `VITE_IMGBB_KEY` | imgbb uploads for shop/offer photos | For photo upload only |
| `VITE_GMAPS_KEY` | Google Maps for every map surface (Locate/Home, offer + shop maps, offer preview, merchant location picker) | Optional — falls back to MapLibre + OpenFreeMap |
| `GSTIN_API_KEY` | GSTIN verification in the merchant wizard (server-side, no `VITE_` prefix) | For GSTIN step only |
| `VITE_RAZORPAY_KEY_ID` | Razorpay Checkout, public Key ID | For the payment step |
| `RAZORPAY_KEY_SECRET` | Server-side fee verification (`api/` only, no `VITE_` prefix) | Yes, for settled payments |
| `VITE_ADMIN_EMAILS` | Comma-separated allow-list for `/nz-admin`; empty means nobody | For the admin console |
| `VITE_FIREBASE_MEASUREMENT_ID` | Google Analytics (optional; only used when the browser supports it) | Optional |

Filename: copy `.env.example` → `.env`, never edit `.env.example` with real values.

## Payments — the ₹1,000 annual fee

The fee is settled server-side through the `api/` functions — the browser opens Razorpay Checkout, but order creation, signature verification and the webhook decide whether the fee is honoured; nothing from the browser is trusted as proof of payment. The Razorpay dashboard / webhook / Firebase service-account runbook lives in **docs/razorpay-setup.md** — follow it there, it is not duplicated here.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npm run build` | `tsc -b && vite build` → `dist/` |
| `npm run lint` | ESLint |
| `npm run preview` | Serves the production build locally (same `/gstapi` proxy) |

## Deploy — Vercel

- Framework preset **Vite**; build command `npm run build`, output directory `dist`.
- `vercel.json` rewrites every route to `/index.html` (SPA fallback). Vercel resolves filesystem routes first — static assets and the `/api/*` functions — so deep links fall back to the app and `/api/*` still hits the functions.
- Env vars: set everything from `.env.example` in the Vercel project (Production + Preview). `VITE_*` values are baked into the bundle at build time; `RAZORPAY_KEY_SECRET` and `GSTIN_API_KEY` stay server-side only.
- Firestore rules deploy separately: `firebase deploy --only firestore:rules` (`firebase.json` points firebase-tools at `firestore.rules`). No `.firebaserc` is committed — run `firebase use <project-id>` once, or pass `--project <id>`. Rules and app code must change together — deploy rules with any data-shape change.
- Live keys live in the local `.env` and in Vercel's env settings, never in git. `.env` is git-ignored; `.env.example` is the maintained template.
- Before shipping: `npm run build` and `npm run lint` must both pass. There is no test suite yet; `@firebase/rules-unit-testing` sits in devDependencies for when rules tests land.

## Data model cheat-sheet

- `shops/{uid}` (+ `offers/`, `views/`, `reports/`, `notifications/` subcollections) — the merchant's shop; owner or admin only.
- `feed/{mirrorId}` — public, world-readable mirror of one offer per doc; what customers actually read.
- `coupons/{code}` — claimed coupons; the doc id *is* the code, so a counter scan is a single get.
- `redemptions/{id}` — confirmed redemption log the customer history reads.
- `customers/{uid}` and `users/{uid}` — customer accounts (`users/` carries the working profile; `customers/` the lite profile).
- `redemption_reports/{id}`, `payments/{paymentId}` — customer-filed disputes; server-written fee records.

## Known-shape notes

Firestore deliberately forbids cross-shop reads of offers — the customer app cannot list or read another merchant's offers at all. The customer feed is therefore a merchant-maintained mirror in `feed/` (marketing fields only: names, deal, terms, dates, pin — no phones, GSTIN or review notes), synced from `src/business/feed.ts` whenever the offer or shop's public state changes. Display state (live / scheduled / ended) is derived from the copied dates at read time, so a scheduled offer goes live with no write. That is why deep links (`/<shopUid>/<offerId>`) render from `feed/` — and why draft, review and changes offers show an honest "not available" to visitors.

The admin allow-list is duplicated by design: `VITE_ADMIN_EMAILS` gates the UI in `src/admin/AdminPanel.tsx`, and `isAdmin()` in `firestore.rules` gates the data. Change both, or one of them gates nothing.

## Operating notes (six months from now)

- **Add or remove an admin**: update `VITE_ADMIN_EMAILS` in `.env` / Vercel env (UI gate) and the `isAdmin()` allow-list in `firestore.rules` (data gate), then `firebase deploy --only firestore:rules`. The admin can sign in with any Google account in the list.
- **Merchant paid but shop never went live**: the ₹1,000 fee is recorded in `payments/{paymentId}`. The wizard retries the *save* with the same payment id — money is never re-taken "just to retry". If a payment id exists but `shops/{uid}.paymentDone` is false, compare against the Razorpay dashboard before touching anything by hand.
- **Deep link shows "not available" for a live-looking offer**: the offer is probably draft / in review / needs changes — those have no `feed/` mirror by design. Check the offer's `status` in the merchant console before suspecting the rules.
- **A scheduled offer didn't go live**: display state is derived from the copied `startsAt` / `endsAt` in the mirror at read time — check the mirror doc's dates, not the offer doc's.
- **Rotating a key**: edit `.env` locally and the Vercel env settings; `VITE_*` values only take effect on the next build/deploy. Rotate `RAZORPAY_KEY_SECRET` / `GSTIN_API_KEY` in the Razorpay dashboard / gstinapi.in, update Vercel, redeploy.
- **Rules block an unexpected read**: default-deny — the wildcard rule at the bottom of `firestore.rules` only lets `isAdmin()` read anything outside the listed collections; matching is path-based, so collection-group queries live or die there too.

`environment.yml` (conda notebooks) is not part of the app — ignore it when deploying.
