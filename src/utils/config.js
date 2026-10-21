/**
 * App configuration values sourced from app.json's `expo.extra` block.
 *
 * NOTE: The API key below is obfuscation, not real security — anything shipped
 * in the app binary can be extracted by a determined attacker. It exists to
 * block casual/automated abuse of the backend endpoints. For true protection,
 * pair this with server-side rate limiting and (ideally) App Attest.
 */
import Constants from 'expo-constants';

const extra =
  Constants?.expoConfig?.extra ||
  Constants?.manifest?.extra || // fallback for older Expo runtimes
  {};

export const APP_API_KEY = extra.appApiKey || '';

/**
 * "Connect with Wind" (pay-as-you-go billing) configuration.
 *
 * Only the CLIENT ID is public and safe to ship in the app binary — it just
 * names the app on Wind's OAuth screen. The client SECRET stays server-side
 * (Vercel env), used only by the backend's /api/wind/connect code exchange.
 *
 * The authorize base + redirect URI have production defaults; override via
 * `expo.extra` only if pointing at a different Wind environment. The redirect
 * must match the app's custom scheme (`calendarocr://`) AND a redirect_uri
 * registered on the Wind app, exactly.
 */
export const WIND_CLIENT_ID = extra.windClientId || '';
export const WIND_AUTHORIZE_BASE =
  extra.windAuthorizeBase || 'https://accounts.usewind.app';
export const WIND_REDIRECT_URI =
  extra.windRedirectUri || 'calendarocr://wind/callback';

/**
 * Public App Store (or TestFlight) link used in the referral share message.
 * Set `expo.extra.appStoreUrl` in app.json to the real listing when available;
 * the placeholder below keeps the share flow working until then.
 */
export const APP_STORE_URL =
  extra.appStoreUrl || 'https://apps.apple.com/app/id0000000000';
