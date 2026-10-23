# CLAUDE.md — CalendarOCR

Quick-context for future sessions. Concise by design; read the code for detail.

## What it is
Expo/React Native **iOS** app (SDK 52, RN 0.76.9). Snap a photo of an event poster →
OCR + GPT extract structured events → review/edit → save to a dedicated "CalendarOCR"
calendar. Freemium: 3 free scans/month, then a one-time "Pro" unlock (IAP).

## Two repos
- **App:** `/Users/bowenjiang/Desktop/Projects/CalendarOCR` (this repo)
- **Backend:** `/Users/bowenjiang/Desktop/Projects/backends/CalendarOCR-backend`
  (Vercel serverless, auto-deploys on push to `main`; GitHub `bbbjiangggg/CalendarOCR-backend`)

## Architecture / flow
Camera → `ocrService.extractAndParseEvent(uri, onProgress)`:
1. `preprocessImage` — resize to 1600px + compress. **No crop** (the camera white box is
   visual guidance only; screen-% crop misaligned vs sensor aspect ratio, so it was removed).
2. POST base64 image → backend `/api/ocr` (Google Vision) → raw text.
3. POST text + local `today` → backend `/api/parse-event` (GPT‑4o‑mini) → `{events:[...]}`.
4. Build array of event objects (Date + duration default 60) → `SET_MULTIPLE_EVENTS`.
Regex parser in `eventParsing.js` is the fallback if GPT fails.

State: `src/context/EventContext.js` (reducer; `events[]`, `currentEventIndex`).
Multi-event: multiple dates → multiple swipeable cards (horizontal paged ScrollView +
dot indicators + "X of N events"); each card saved individually.

## Key files
- `src/utils/ocrService.js` — pipeline, typed `OCR_ERROR`, `onProgress` stages
  (`analyzing`/`extracting`/`organizing`), sends `x-app-key` + local `today`.
- `src/utils/eventParsing.js` — pure regex fallback parsers (unit-tested).
- `src/utils/config.js` — `APP_API_KEY` from `app.json` `expo.extra.appApiKey`.
- `src/utils/logger.js` — `log/warn/error`; `log` gated behind `__DEV__`.
- `src/utils/calendarService.js`, `purchaseService.js` (IAP).
- `src/screens/EventEditorScreen.js` — the card editor (Airbnb-style redesign), loader,
  error UI, success animation orchestration, per-card save.
- `src/components/SuccessAnimation.js` — confetti + drawn checkmark on save.
- `src/components/AnalyzingLoader.js` — pink progress bar + live stage text.
- `App.js` — stack nav; EventEditor uses `forFade` cardStyleInterpolator (fade to home).

## Backend
- `api/ocr.js` (Google Vision), `api/parse-event.js` (OpenAI GPT‑4o‑mini), `api/_auth.js`.
- Env vars (Vercel): `GOOGLE_VISION_API_KEY`, `OPENAI_API_KEY`, `APP_API_KEY`.
- **Shared-key auth:** both endpoints require header `x-app-key` == `APP_API_KEY`.
  Enforcement is opt-in (skipped if `APP_API_KEY` unset). The app's key lives in
  `app.json` `expo.extra.appApiKey` and MUST match the Vercel env value.
- parse-event prompt: interprets posters (composes concise titles, resolves relative
  dates like "this Friday" against client `today`, writes summaries). Payload size caps.

## Build & deploy (IMPORTANT gotchas)
- **Bare workflow** — committed `ios/` dir. EAS reads version from **`ios/CalendarOCR/Info.plist`
  `CFBundleShortVersionString`**, NOT `app.json` (keep both in sync when bumping). Build
  number auto-increments remotely (`eas.json` `production.autoIncrement: true`,
  `appVersionSource: remote`).
- TestFlight: `npx eas build --profile production --platform ios --auto-submit`.
- **Apple requires Xcode 26 / iOS 26 SDK** (as of Apr 2026) → `eas.json`
  `production.ios.image: "latest"`.
- RN 0.76 bundles **fmt 11.0.2 which fails to compile on Xcode 26** (consteval). Fixed via
  `ios/Podfile` `post_install` patch forcing `FMT_USE_CONSTEVAL=0`. Do NOT remove until
  upgrading RN ≥ 0.83 / Expo SDK ≥ 56.
- **Pod deployment target:** newer Xcode 26 images treat a too-low
  `IPHONEOS_DEPLOYMENT_TARGET` (SDWebImage / `*_resources` bundles default to 9.0) as a
  hard error. `ios/Podfile` `post_install` forces every pod target + resource bundle to
  the project min (15.1).
- Not Expo Go compatible (react-native-iap + dev-client). Ad-hoc `preview` builds hit
  device-registration/"integrity" issues → use TestFlight.

## Share Extension (screenshot / album → CalendarOCR)
Second native iOS target **`ShareExtension`** (`ios/ShareExtension/`, Swift) so the app
shows in the system share sheet's app row for images (screenshots, Photos).
- **Flow:** extension saves the shared image to App Group container
  `group.com.bowenjiang.CalendarOCR` as `pending-share.jpg`, best-effort foregrounds the
  app, then the app picks it up and runs the **existing** OCR pipeline (OCR + paywall all
  reused — no logic duplicated).
- **Why not hand the image in via deep link?** iOS blocks extensions from launching the
  host app: `extensionContext.open` returns false for share extensions, and the
  responder-chain `openURL:` hack is force-failed on iOS 18+. So correctness does NOT
  depend on the open succeeding — the app reads the pending file on its next activation.
- **Pickup:** native module `ios/CalendarOCR/PendingShare.m`
  (`NativeModules.PendingShare.consume()`) copies the App Group file into app cache,
  deletes the original (one-shot), returns the path. `App.js` `<ShareIntentHandler>`
  calls it on mount + every AppState `active`, then dispatches `SET_IMAGE` + navigates to
  EventEditor. No-op (silent) when nothing is pending, so the camera flow is untouched.
- Activation rule: images only (`NSExtensionActivationSupportsImageWithMaxCount`), no
  storyboard (principal-class `ShareViewController`, UI-less).

### Share Extension gotchas (each cost real build cycles — don't relearn)
- **App Group entitlement is THE one that bites.** The extension target MUST have
  `CODE_SIGN_ENTITLEMENTS = ShareExtension/ShareExtension.entitlements` in
  `project.pbxproj`. Adding "App Groups" via Xcode's Signing & Capabilities UI did NOT
  persist the build setting → extension signed with no App Group → `containerURL(...)`
  returned nil → file never written → `consume()` always null. Both app AND extension
  need the group in their entitlements files; EAS syncs capabilities to the App IDs/
  profiles FROM those files, so if `CODE_SIGN_ENTITLEMENTS` is unset it silently never
  registers them. Verify a build:
  `codesign -d --entitlements :- Payload/CalendarOCR.app/PlugIns/ShareExtension.appex`
- **Deployment target:** Xcode creates the target at the newest SDK (iOS 27) → it won't
  appear in the share sheet on older-iOS devices. Set ShareExtension
  `IPHONEOS_DEPLOYMENT_TARGET` to 17.6 (dropdown min) / match the app.
- **Version match:** App Store rejects if extension `CFBundleVersion` ≠ app's. EAS
  `autoIncrement` only bumps the main target and the extension uses
  `GENERATE_INFOPLIST_FILE`. Fixed by a Run Script build phase on the **CalendarOCR**
  target ("Sync Extension Version") that stamps every embedded `*.appex` Info.plist with
  the host's version/build at archive time.
- **Native module membership:** `PendingShare.m` must belong to the **CalendarOCR app**
  target, not the extension.
- **Submit config:** `eas.json` `submit.production.ios.ascAppId` must be the real ASC app
  id **6754291511** (was wrong once → "app not found" on submit).
- Inspecting a cloud build locally: `.ipa` is a zip — `unzip` it and `codesign`/`plutil`
  the embedded `.appex` to check entitlements / `MinimumOSVersion` / versions without a
  device.
- Not worth doing (considered): an Action Extension (`com.apple.ui-services`) to also sit
  in the share sheet's bottom action list — it's a whole second target + signing surface
  for a less-discoverable spot. The app row is the primary placement.

## Tests
`npm test` (jest). 30 tests in `__tests__/eventParsing.test.js` (parseTime AM/PM,
duration, time ranges, dates, location). Babel: `babel.config.js` (`babel-preset-expo`).

## Conventions / notes
- Verify JS compiles with `babel-preset-expo` (can't run the native app in this env):
  `node -e 'require("@babel/core").transformFileSync("<file>",{presets:["babel-preset-expo"]})'`
- Icons: `@expo/vector-icons` (Feather) — no new native dep. Theme pink: card `#FFF0F0`,
  accent `#FF6B6B`, bg `#FAFAFA`.
- Reduce Motion respected in animations.

## IAP / Pro recovery
One-time non-consumable (`com.bowenjiang.calendarocr.pro`), tied to Apple ID. On reinstall
it auto-restores on launch (`checkPurchaseStatus` → `getAvailablePurchases`) + manual
"Restore Purchase" button. **Pro status is client-side only (no server receipt validation)** —
restore works fine; flag is technically spoofable (paywall intentionally not hardened yet).

## Current state
- Version **1.2.0** (marketing). Backend deployed + verified. Share Extension live &
  working on TestFlight (share a screenshot/photo → app opens → parses). To publish:
  App Store Connect → create 1.2.0 version → attach the build → "What's New" → submit for
  review (export compliance already declared via `ITSAppUsesNonExemptEncryption=false`).
- Latest session: Share Extension (screenshot/album → CalendarOCR) + its native pickup
  module, version-sync build phase, Podfile deployment-target patch, `ascAppId` fix.
- Earlier: logging gate, crop removal, backend auth + smarter parsing, typed OCR errors +
  retry UI, calendar cache fix, regex location fallback, tests, keyboard dismissal,
  confetti success animation, pink progress loader, Airbnb-style card redesign,
  fade-to-home, referral system, Wind pay-as-you-go.

## Possible follow-ups (not done)
- Harden paywall with server-side receipt validation.
- Per-card "skip/discard" in multi-event flow.
- Upgrade Expo SDK / RN (removes the fmt Podfile patch need).
