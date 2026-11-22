# Offer revalidation

`functions/index.js` exports `revalidateOffers`, a Firebase **v2 scheduled
Cloud Function** that runs every 15 minutes (`asia-south1`) and checks every
customer-facing offer mirror in `feed/`. Each doc gets a genuine
`lastCheckedAt` stamp plus `checkOk`, `checkStatus` and `checkIssues`. The
customer offer page prefers `lastCheckedAt` over the old mirror-sync stamp.

The function only records results — it never changes offer visibility.

## Deploy

1. Install the functions' own dependencies once:

   ```bash
   cd functions && npm install
   ```

2. From the repo root, deploy just this function:

   ```bash
   firebase deploy --only functions:revalidateOffers
   ```

   Scheduled functions require the Firebase **Blaze** plan. The target project
   is set in `.firebaserc` (`nearzoop`) — change it there if needed, or run
   `firebase use <project-id>`.

3. Confirm it ran:

   ```bash
   firebase functions:log --only revalidateOffers
   ```

   Each run logs the number of mirrors checked and flagged.

There is no HTTP endpoint and no shared secret — Cloud Scheduler invokes the
function directly, so the old `CRON_SECRET` / Vercel cron setup is gone.

## Local testing

```bash
firebase emulators:start --only functions,firestore
```

The emulator does not fire schedules on its own; trigger the function from the
Emulator Suite UI (or by calling it through the functions emulator) while the
Firestore emulator has `feed/` documents.
