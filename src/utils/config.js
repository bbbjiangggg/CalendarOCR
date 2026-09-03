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
 * Public App Store (or TestFlight) link used in the referral share message.
 * Set `expo.extra.appStoreUrl` in app.json to the real listing when available;
 * the placeholder below keeps the share flow working until then.
 */
export const APP_STORE_URL =
  extra.appStoreUrl || 'https://apps.apple.com/app/id0000000000';
