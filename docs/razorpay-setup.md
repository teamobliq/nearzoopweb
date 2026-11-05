# Razorpay payments — operator runbook

NearZoop charges a ₹1,000/year fee to list a verified shop. Payments run through
**Razorpay Standard Checkout** against server-created orders, and the fee is
**settled exclusively by the Vercel functions in `api/`** — never by the browser.

```
Browser                  Vercel (api/)                    External
─────────                ──────────────                    ────────────────
"Pay ₹1,000" ──POST /api/razorpay-order──▶ firebase idToken check
                         POST /orders ─────────────────────▶ Razorpay
            ◀── { orderId, amount, keyId }  (Basic auth, secret server-side)
                                                          │
open Checkout ◀───────────────────────────────────────────┘
                                                          │  merchant pays
Checkout handler ──POST /api/razorpay-verify──▶ signature check (HMAC)
                         GET /payments/{id} ─────────────▶ Razorpay (money moved?)
                         Firestore txn: shops/{uid} + payments/{paymentId}
            ◀── { ok, feeExpiresAt }                      
                                                          │
Razorpay ──POST /api/razorpay-webhook──▶ raw-body HMAC check
                         settleFee(via: 'webhook') — backstop, idempotent
```

Both routes to settlement write the same Firestore transaction
(`api/_lib/settle.js#settleFee`), so whichever lands first wins and the other is
a no-op: `paymentDone: true, paymentId, feeExpiresAt = max(now, existing) + 365d,
setupDone: true`, and `verification: 'pending'` unless the shop was already
`verified`. The fee audit trail lives in the `payments/{paymentId}` collection
(one doc per payment: shopUid, orderId, amount, via: `verify` | `webhook`).

---

## (a) Rotate the live Key Secret — do this first

The live `RAZORPAY_KEY_SECRET` was pasted into a chat on **2026-11-05**. Treat it
as compromised:

1. Razorpay dashboard (live mode, toggle top-left) → **Settings → API Keys**.
2. Regenerate the Key Secret for the live Key ID (or generate a fresh pair).
3. Update `.env` locally (`RAZORPAY_KEY_SECRET=`) and the Vercel project env
   (below) with the new secret. The old one must never appear anywhere — not in
   git, not in docs, not in hosted env vars left unused.
4. If the shop went live with the compromised secret in any hosted env, check
   Razorpay → **Settings → API Keys** → "last used" and the payments list for
   anything you don't recognize, and dispute/refund as needed.

Test keys are a separate pair — nothing here requires changing the test setup.

## (b) Razorpay dashboard configuration

1. **Auto-capture**: leave on (Settings → Payment Methods / Capture). The flow
   assumes `payment.captured`; manual capture would strand payments in
   `authorized` and the verify call would (correctly) reject them.
2. **Webhook**: Settings → **Webhooks** → Add new webhook:
   - URL: `https://<your-vercel-domain>/api/razorpay-webhook`
     (e.g. `https://nearzoop.vercel.app/api/razorpay-webhook`)
   - Secret: generate any strong random string; this is `RAZORPAY_WEBHOOK_SECRET`.
   - Events: **`payment.captured`** (required) and optionally **`payment.failed`**
     (logged only, harmless).
   - Active. Save.
3. Copy the webhook secret into Vercel env as `RAZORPAY_WEBHOOK_SECRET`.

The webhook is the backstop: if the merchant's browser dies after paying but
before `/api/razorpay-verify` runs, Razorpay calls the webhook and the fee
settles anyway — same transaction, same result.

## (c) Firebase service account (Admin SDK) — required for the functions

The functions write Firestore bypassing security rules with the Admin SDK, so
they need a service account:

1. Firebase console → **Project settings → Service accounts** (project
   `nearzoop`).
2. **Generate new private key** → downloads a JSON file. Handle it like a
   password; do not commit it.
3. From the JSON, set these Vercel env vars:
   - `FIREBASE_ADMIN_PROJECT_ID` = the `project_id` field (`nearzoop`)
   - `FIREBASE_ADMIN_CLIENT_EMAIL` = the `client_email` field
   - `FIREBASE_ADMIN_PRIVATE_KEY` = the `private_key` field, **with `\n`
     escapes intact** (the functions convert `\\n` → newlines at boot). Easiest
     reliable paste: keep it on one line as it appears in the JSON, quotes
     removed. If your host mangles newlines, base64-encode the whole PEM and
     store that, then decode in code — do not hand-fix partial pastes; the
     function throws a clear error (`Firebase admin credentials missing…`) if
     the key can't be parsed into a cert.
4. Keep the JSON file out of the repo (it is gitignored by virtue of `.env*`
   patterns — but double-check you didn't save it into the project tree).

## (d) Environment variables

### Vercel project → Settings → Environment Variables (Production; mirror for Preview if you test there)

| Variable | Scope | Notes |
| --- | --- | --- |
| `VITE_RAZORPAY_KEY_ID` | build + runtime | Live Key ID (`rzp_live_…`) for the browser. Public by design. |
| `RAZORPAY_KEY_SECRET` | runtime (functions) | Live Key Secret, **server-only**. No `VITE_` prefix — never in the bundle. |
| `RAZORPAY_KEY_ID` | runtime (functions) | Optional. Falls back to `VITE_RAZORPAY_KEY_ID`; set only to use a distinct pair for functions. |
| `RAZORPAY_WEBHOOK_SECRET` | runtime (functions) | From §(b). Required — the webhook 500s without it. |
| `FIREBASE_ADMIN_PROJECT_ID` | runtime (functions) | `nearzoop` |
| `FIREBASE_ADMIN_CLIENT_EMAIL` | runtime (functions) | Service account email |
| `FIREBASE_ADMIN_PRIVATE_KEY` | runtime (functions) | PEM with `\n` escapes |
| plus the existing `VITE_FIREBASE_*` / `VITE_IMGBB_KEY` / `GSTIN_API_KEY` / `VITE_ADMIN_EMAILS` | build | Unchanged. |

### Local development

- **`npm run dev` (vite) cannot serve `/api/`** — the payment functions are
  Vercel functions. The buttons will render, but paying fails with
  "Payments only work on a deployment or under `vercel dev`".
- **`vercel dev`** runs Vite *and* the functions together against your local
  `.env`. Install the CLI once (`npm i -g vercel` or `npx vercel`), run
  `vercel dev` in the project root, use the printed URL (default `:3000`).
  This is the only local setup that can take a full test payment end-to-end.
- `.env` locally should carry the **test** key pair if you want to test
  payments without touching live money: `VITE_RAZORPAY_KEY_ID=rzp_test_…`,
  `RAZORPAY_KEY_SECRET=…` — the code is identical for test and live keys.
  (Live keys are currently in `.env` on this machine; keep them out of git.)

## (e) Live test protocol

Before trusting real money to the flow:

1. Deploy (or `vercel --prod`), with the §(d) env vars set on Vercel.
2. On the **live** site, register a shop with a Play/test phone, complete
   steps 1–3, and pay the ₹1,000 with a real card or UPI.
   - There is no smaller live denomination for this fee — the amount is fixed
     at 100000 paise, hard-coded server-side in both `api/razorpay-order.js`
     and `api/razorpay-verify.js`.
3. Confirm the flips: shop doc in Firestore shows `paymentDone: true`,
   `feeExpiresAt` ≈ now + 365d, `setupDone: true`, `verification: 'pending'`.
   The merchant lands on the "checking" screen.
4. Refund the ₹1,000 from Razorpay dashboard → **Payments** → pick the payment
   → **Refund** → full amount. The fee settlement is a Firestore record, not a
   captured balance you track; a refund does **not** claw back
   `paymentDone` — that's deliberate (the support/refund decision stays with a
   human). If your policy is "refunded = unlist", handle it from the admin
   console: set `verification: 'failed'` with a reviewNote.
5. Check the audit trail: Firestore `payments/{razorpay_payment_id}` — `via`
   tells you whether the client verify or the webhook settled it. Use this when
   debugging "money taken but shop not marked paid".

## (f) Failure modes

| Symptom | Meaning | Action |
| --- | --- | --- |
| `/api/razorpay-verify` → **400 "signature did not match"** | Forged or tampered Checkout response, or wrong secret in env | Check `RAZORPAY_KEY_SECRET` matches the Key ID pair on Vercel. If the merchant insists they paid, treat as a forgery attempt and check Razorpay payments for the id. |
| **400 "Payment could not be verified"** | Signature OK, but Razorpay REST says not captured / wrong amount / wrong order / wrong shop | Check `payments/` and Razorpay dashboard. If the payment exists and is captured but `notes.shopUid` is someone else, something replayed a response — flag it. |
| **Money deducted, shop not marked paid** | The browser died before verify; webhook should settle within seconds–minutes | Wait ~5 min (`payment.captured` webhook). If still unpaid, find the payment in Razorpay dashboard; if captured, settle by hand: set `paymentDone`/`feeExpiresAt` from a trusted environment (Admin SDK script) or contact the merchant with the payment id. If the webhook is failing, Razorpay shows it under Webhooks → attempt logs — fix the env (`RAZORPAY_WEBHOOK_SECRET`) and Razorpay auto-retries recent deliveries. |
| Webhook returns **500** | Function crashed — bad Firebase admin creds or Firestore unreachable | Fix env (§c), then re-deliver from Razorpay dashboard (Webhooks → the failed event → Redeliver) — settlement is idempotent, no double-counting. |
| "Couldn't start the payment" (button) | `/api/razorpay-order` failed — usually auth token or `RAZORPAY_KEY_SECRET` missing on the server | Check Vercel function logs; confirm the user is signed in (the call needs a Firebase ID token). |
| Vite dev: "Payments only work on a deployment or under `vercel dev`" | Plain `npm run dev` has no `/api` | Use `vercel dev` or a preview deployment. |
| Vercel function cold-start limits | First hit after idle can be slow (~1s); Hobby plan caps function duration | Not a payment-integrity issue — the verify call either settles or the webhook does. Don't raise limits; keep handlers fast. |
| Razorpay webhook retry | Non-2xx → Razorpay retries with exponential backoff | Fix the cause; re-delivery is safe (idempotent `settleFee`). |

## (g) Renewal math

`feeExpiresAt = new Date(effectiveStart + 365 * 24 * 60 * 60 * 1000).toISOString()`
where `effectiveStart = max(Date.now(), Date.parse(shop.feeExpiresAt ?? 0))`.

- Renewing early extends **from the end of the current paid year** — no paid
  days are lost.
- Lapse → the merchant re-enters the wizard at the payment step
  (`feeExpired` routes to step 3); paying there settles a fresh year.
- Computed **server-side only** (`api/_lib/settle.js`). The browser cannot and
  must not compute or set it — Firestore rules forbid owners writing
  `feeExpiresAt`.

## (h) First payment → admin approval queue (unchanged)

A first payment flips the shop to `verification: 'pending'`; the admin
manual-review queue is exactly as before. GSTIN auto-check still only moves the
shop *into* review, never to live. Rejection = `verification: 'failed'` and the
shop is hidden from the feed; the merchant sees the failed screen with the
review note and the "Upload another document" path. The refunded-if-rejected
promise stays a human decision — nothing in code auto-refunds.

## (i) Security notes

- **Browser writes nothing payment-related anymore.** `firestore.rules` now
  denies owners any update that touches `paymentDone / paymentId / feeExpiresAt /
  setupDone`; admins keep full update. The functions bypass rules via the
  Admin SDK. The old console-forge path (set `paymentDone: true` on your own
  shop doc) is closed.
- **Secrets never ship.** Only `VITE_RAZORPAY_KEY_ID` is in the client bundle;
  `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, and `FIREBASE_ADMIN_*` are
  function-only env vars. `git grep` the repo for the secret value before
  pushing any branch — it should only ever exist in `.env` and Vercel.
- The signature checks are **timing-safe** (`crypto.timingSafeEqual`) and the
  webhook verifies the **raw** body bytes, not a re-serialized JSON object.
- `payments/` collection holds the settlement audit trail; it's not readable or
  writable from the browser (deny-by-default rules unchanged).

## (j) Go-live checklist

- [ ] Live Key Secret rotated (§a); new pair in `.env` and Vercel.
- [ ] Auto-capture confirmed on Razorpay (§b).
- [ ] Webhook created for the production domain; `payment.captured` enabled;
      secret copied to Vercel as `RAZORPAY_WEBHOOK_SECRET` (§b, §d).
- [ ] Service account generated; `FIREBASE_ADMIN_*` set in Vercel; function
      logs clean on a test call (§c, §d).
- [ ] Firestore rules deployed with the payment-field owner block
      (`firebase deploy --only firestore:rules`) and a smoke-test from the
      Firebase console that an owner update with `paymentDone: true` is denied.
- [ ] Test pair exercised end-to-end under `vercel dev` (§d, §e with test keys).
- [ ] One real ₹1,000 payment + refund completed; `payments/` doc reviewed;
      shop seen in the admin queue; refund decision handled (§e).
- [ ] Vercel function logs show `razorpay-verify` and `razorpay-webhook` 200s.
- [ ] Support runbook known to whoever staffs the inbox: "money deducted but
      shop unpaid → check `payments/` → check webhook attempts → hand-settle
      with the payment id if needed" (§f).
