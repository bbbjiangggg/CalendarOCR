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
- Not Expo Go compatible (react-native-iap + dev-client). Ad-hoc `preview` builds hit
  device-registration/"integrity" issues → use TestFlight.

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
- Version **1.1.6** (marketing). Backend deployed + verified (auth on, multi-event parsing
  confirmed live). App committed & green; ship via the TestFlight command above.
- Session delivered: logging gate, crop removal, backend auth + smarter parsing, typed OCR
  errors + retry UI, calendar cache fix, regex location fallback, 30 tests, keyboard
  dismissal, confetti success animation, pink progress loader, Airbnb-style card redesign,
  fade-to-home (no card flash).

## Possible follow-ups (not done)
- Harden paywall with server-side receipt validation.
- Per-card "skip/discard" in multi-event flow.
- Upgrade Expo SDK / RN (removes the fmt Podfile patch need).
