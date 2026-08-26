# FCM Push Notification Setup — Runbook

**Date:** 2026-08-26 (updated same day — see Status Update below)
**Status:** Steps 1, 2, 4, 5 below are already done. Only Steps 3 (place `google-services.json`) and 6 (rebuild) remain.

## Status update (2026-08-26, later same day)

A separate work session already completed the EAS/Firebase-console half of this, logged in `bug_fixes_2026-07-23.md` under "2026-08-26: Push notifications actually reaching the Android tray": a real Firebase project (`near-and-now-978e6`) was created, all 3 package names were registered as Android apps under it, a service-account key was generated, and it was assigned to all three apps' FCM V1 slot via `eas credentials` (confirmed via the CLI's own success message per app). EAS project linkage was also fixed for the rider and customer apps (both previously had no linked EAS project at all).

**What that session did not do:** download each app's `google-services.json` and place it in the actual repo/native project. That client-side half is still required — a correctly-configured FCM V1 service account on EAS lets Expo's servers *call* FCM, but the device still can't mint a push token in the first place without the app itself being registered with Firebase locally (`google-services.json` baked into the native build). So push still won't reach a device until Steps 3 and 6 below are done.

**Also fixed this session:** the original version of this doc had the client apps reference `googleServicesFile: "./google-services.json"` in `app.config.js` unconditionally. Two of the three apps (customer, rider) are **managed workflow** (their `android/` folder is gitignored and regenerated fresh by `expo prebuild` on every EAS build) — for those, referencing a path that doesn't exist yet makes prebuild throw and fails the build outright, which is worse than the original problem. This is now guarded behind a `fs.existsSync()` check in both apps' `app.config.js`, so it silently no-ops until the real file is added, then activates automatically. The **shopkeeper app is bare workflow** (`android/` is committed to git) — EAS Build uses it as-is and never runs `expo prebuild` at all, so the `app.config.js` field has *zero effect* there regardless. Its Firebase wiring had to be added directly to the native project instead: `android/build.gradle` now declares the `com.google.gms:google-services:4.4.1` classpath, and `android/app/build.gradle` has a guarded `if (file('google-services.json').exists()) { apply plugin: 'com.google.gms.google-services' }` block. Same idea — inert until the file is actually placed, active once it is.

## Background

In-app notifications work fine — rows land correctly in the `notifications` table and show up in each app's inbox. Phone push notifications never arrive on any device, on any of the 3 apps, because **none of the 3 Android apps had its `google-services.json` in the actual project** (the EAS-side FCM V1 credential is now set up — see Status Update above — but that's only half of what's needed).

What existed before today (2026-08-26) was cosmetic only:

- `AndroidManifest.xml` in all 3 apps has `com.google.firebase.messaging.*` `<meta-data>` entries (channel/icon/color defaults) — these only affect how a push looks *if* one arrives. They don't register the app with Firebase.
- `google-service-account.json` (referenced in each `eas.json` under `submit.production.android.serviceAccountKeyPath`) is a **Google Play Console publishing credential**, used by `eas submit` to auto-upload the AAB. It is unrelated to Firebase/FCM despite the similar name — this is almost certainly the source of the original "we already added FCM" belief.

Since Google deprecated the legacy FCM HTTP API (June 2024), Android push requires every app to have its own real Firebase project *and* the built app itself to carry that project's `google-services.json`. Without the latter, `getExpoPushTokenAsync()` fails to initialize Firebase natively, throws, and the failure is swallowed into a `token-failed` state that's only logged behind `__DEV__` — invisible in production. No token ever reaches the backend, so `sendExpoPush()` has nothing to send to.

**Scope note:** This setup is not tied to a build profile. `google-services.json` is read from `app.config.js` (customer/rider) or directly from the native `android/` project (shopkeeper), independent of the `development`/`preview`/`production` EAS profile. The FCM service account uploaded to EAS is scoped to the whole project, not one profile. So preview and production builds both pick this up identically once done — you do not need to repeat any of this per profile. (Testing via Expo Go is excluded either way — push registration is already skipped there by design.)

App package names, for reference:

| App | Repo | Package name |
|---|---|---|
| Customer | `nearandnowcustomerapp` | `com.nearandnow.customer` |
| Shopkeeper | `near-now-store_owner` | `com.nearandnow.shopkeeper` |
| Rider | `NAT_Near-Now_Rider-` | `com.nearandnow.rider` |

---

## Step 1 — Create a Firebase project ✅ already done

Already completed in the 2026-08-26 session logged in `bug_fixes_2026-07-23.md`: Firebase project `near-and-now-978e6` exists. Nothing to do here — skip to Step 3.

<details>
<summary>Original instructions (for reference / if a fresh project is ever needed)</summary>

1. Go to https://console.firebase.google.com/
2. Click **Add project**.
3. Name it something like `near-and-now` (any name — it's just a container for the 3 Android apps).
4. Disable Google Analytics for the project unless you specifically want it (not needed for push).
5. Click **Create project** and wait for it to finish provisioning.

You only need **one** Firebase project — all 3 apps live inside it as separate "Android apps."

</details>

---

## Step 2 — Register the 3 Android apps in Firebase ✅ already done

Already completed in the same session: all three package names (`com.nearandnow.customer`, `com.nearandnow.shopkeeper`, `com.nearandnow.rider`) are registered as Android apps under `near-and-now-978e6`. Skip to Step 3 — you just need to download the `google-services.json` each one already has, not register anything new.

<details>
<summary>Original instructions (for reference / if a 4th app is ever added)</summary>

Repeat this once per package name.

1. In the Firebase console, open your project → click the **Android icon** (Add app).
2. **Android package name** — enter exactly (must match `app.config.js`'s `android.package` field, case-sensitive).
3. App nickname — anything, e.g. "Near & Now Customer".
4. SHA-1 — leave blank (not required for push notifications, only for some auth/Dynamic Links features).
5. Click **Register app**.
6. On the next screen, **download `google-services.json`**.
7. Click through **Next → Next → Continue to console** (skip the SDK-integration code steps).

</details>

---

## Step 3 — Download and place each `google-services.json` file ⬅ start here

In the Firebase console (`near-and-now-978e6`) → gear icon → **Project settings** → scroll to **Your apps** → for each of the 3 already-registered Android apps, click it and click **Download `google-services.json`**.

**Placement differs per app** — this matters, don't use the same path for all three:

```bash
# Customer app (managed workflow — app.config.js references this path directly)
cp ~/Downloads/google-services.json /Users/tiasmondal166/projects/nearandnowcustomerapp/google-services.json

# Rider app (managed workflow — same as above)
cp ~/Downloads/google-services\ \(1\).json "/Users/tiasmondal166/projects/NAT_Near-Now_Rider-/google-services.json"

# Shopkeeper app — DIFFERENT: this app's android/ is committed to git (bare
# workflow), so the file must go directly into the native project, not the
# repo root. android/app/build.gradle already has the guarded plugin
# application wired up to look for it exactly here.
cp ~/Downloads/google-services\ \(2\).json /Users/tiasmondal166/projects/near-now-store_owner/android/app/google-services.json
```

(Adjust the source filenames — Chrome/Firefox usually append `(1)`, `(2)` to repeat downloads with the same name. Just make sure each app gets the file downloaded for *its own* Android app entry in Firebase, not a mismatched one.)

Verify each file matches its app before moving on:

```bash
grep package_name /Users/tiasmondal166/projects/nearandnowcustomerapp/google-services.json
grep package_name /Users/tiasmondal166/projects/near-now-store_owner/android/app/google-services.json
grep package_name "/Users/tiasmondal166/projects/NAT_Near-Now_Rider-/google-services.json"
```

Each should print the matching package name back. These files are git-ignored (customer/rider via each repo's root `.gitignore`; shopkeeper's `android/app/google-services.json` isn't currently gitignored specifically — check `git status` after placing it and add `android/app/google-services.json` to that repo's `.gitignore` if it shows as untracked-and-about-to-be-added, since it shouldn't be committed).

---

## Step 4 — Generate the FCM V1 service account key ✅ already done

Already completed in the same 2026-08-26 session: one service-account key was generated and assigned to all three apps' FCM V1 slot via `eas credentials` (confirmed via the CLI's own success message for each package). Skip to Step 6.

<details>
<summary>Original instructions (for reference / if the key ever needs rotating)</summary>

This is the credential that lets **Expo's servers** call FCM on your behalf. Generate it once (project-wide), then upload it separately to each EAS project.

1. In the Firebase console, click the **gear icon → Project settings**.
2. Go to the **Service accounts** tab.
3. Under "Firebase Admin SDK", click **Generate new private key**.
4. Confirm — a JSON file downloads (something like `near-and-now-firebase-adminsdk-xxxxx.json`).
5. Keep this file safe — it's a real credential. Don't commit it to any repo.

</details>

---

## Step 5 — Upload the service account key to each EAS project ✅ already done

Already completed in the same session for all three apps. The steps below are kept for reference only (e.g. if the key is ever rotated) — you don't need to run this again.

<details>
<summary>Original instructions</summary>

You need to be logged into the correct EAS/Expo account first:

```bash
eas whoami
# should print: nearandnowofficial2025 (or the org account)
```

Then, for **each** of the 3 app directories, run:

```bash
cd /Users/tiasmondal166/projects/nearandnowcustomerapp
eas credentials --platform android
```

This opens an interactive menu:

1. **Which build profile do you want to configure?** → pick `production` (or whichever profile you actually distribute builds from — repeat this whole `eas credentials` run again per profile if you need push working from multiple profiles, e.g. also `preview`).
2. It shows a credentials summary screen → choose **Google Service Account**.
3. Choose **Set up a Google Service Account for Push Notifications (FCM V1)**.
4. Choose **Upload a new service account key**.
5. Point it at the file from Step 4 (same file for all 3 apps — it's project-wide, not app-specific).
6. Confirm/save, then exit the menu (Ctrl+C or select "Go back" until it exits).

Repeat for the other two:

```bash
cd /Users/tiasmondal166/projects/near-now-store_owner
eas credentials --platform android

cd "/Users/tiasmondal166/projects/NAT_Near-Now_Rider-"
eas credentials --platform android
```

To sanity-check what's configured without going through the interactive flow each time, you can re-run `eas credentials --platform android` any time and just view the summary screen (first menu) without changing anything — it lists whether a Google Service Account is currently set for that profile.

</details>

---

## Step 6 — Rebuild all 3 apps (real native build, not an OTA update)

`google-services.json` is compiled into the native binary. An EAS Update (OTA/JS-only push) will **not** pick this up — you need an actual new build.

```bash
cd /Users/tiasmondal166/projects/nearandnowcustomerapp
eas build --platform android --profile production

cd /Users/tiasmondal166/projects/near-now-store_owner
eas build --platform android --profile production

cd "/Users/tiasmondal166/projects/NAT_Near-Now_Rider-"
eas build --platform android --profile production
```

If you want to verify the fix faster before a full production release, use `--profile preview` instead — as noted above, the Firebase/FCM setup applies identically to both profiles, so a preview build is a valid way to test first:

```bash
eas build --platform android --profile preview
```

Each build takes a few minutes on EAS's servers. When done, install the resulting APK/AAB on a physical test device (`eas build` gives you a download link/QR code at the end).

---

## Step 7 — Verify on a real device

1. Install the new build on a physical Android device (must be a real device — push doesn't work on emulators without Google Play services configured, and won't work at all in Expo Go).
2. Open the app, go through login, and grant notification permission when prompted.
3. Check that a token actually registers:
   - Shopkeeper app: check `stores.expo_push_token` in Supabase for that store — should now be a non-null `ExponentPushToken[...]` value.
   - Rider app: check `delivery_partners.expo_push_token`.
   - Customer app: check `app_users.expo_push_token`.
4. Trigger a real notification (e.g. place a test order, or use whichever admin action fires `notification.service.ts`) and confirm the phone actually receives it, including with the app fully closed.
5. If a token still doesn't register, re-check `NotificationSettings.tsx`'s error surface (shopkeeper app) or the equivalent `lastRegistrationError` value in the other two apps — it should no longer report `token-failed` once the Firebase project is wired correctly.

---

## Common failure points to check if it still doesn't work after all steps

- **Wrong `google-services.json` in the wrong repo** — double check the `package_name` inside each file (Step 3's `grep` command) matches that repo's app.
- **Old build still installed** — uninstall the old APK from the test device first; don't rely on an in-place update over a build that predates this fix.
- **Service account uploaded to the wrong build profile** — if you tested with `--profile preview` but only uploaded credentials under the `production` profile in Step 5, redo Step 5 selecting `preview` too.
- **Tested via Expo Go** — push registration is intentionally skipped in Expo Go in all 3 apps (`IS_EXPO_GO` check / `usePushNotifications.expo-go.ts`). This only ever works in a real dev-client/preview/production build.
- **Notification permission denied on-device** — Android 13+ requires runtime permission (`POST_NOTIFICATIONS`); if the user denied it, no push will show even with a valid token. Check device Settings → Apps → [app] → Notifications.
