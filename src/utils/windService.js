/**
 * "Connect with Wind" — pay-as-you-go billing client.
 *
 * Wind (https://usewind.app) is a metered billing gateway for AI. A user funds a
 * Wind balance once and authorizes this app to draw from it; afterwards each
 * scan is billed to the USER's Wind wallet (provider cost + a small fee) instead
 * of our own OpenAI/Vision keys. It's offered on the paywall as an alternative
 * to the one-time Pro purchase — the existing freemium/IAP path is untouched.
 *
 * OAuth is split for safety, matching the backend (api/wind/*):
 *   • The DEVICE runs PKCE + the authorize redirect (this file).
 *   • The BACKEND does the code→token exchange, so the client SECRET and the
 *     rotating refresh token never touch the app binary.
 *
 * Identity is the same device idfv the referral system uses (`deviceId`).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as WebBrowser from 'expo-web-browser';
import * as Crypto from 'expo-crypto';
import { getDeviceId } from './deviceId';
import { log, warn, error as logError } from './logger';
import {
  APP_API_KEY,
  WIND_CLIENT_ID,
  WIND_AUTHORIZE_BASE,
  WIND_REDIRECT_URI,
} from './config';

const BACKEND_BASE = 'https://calendar-ocr-backend.vercel.app/api';

// The feature slug registered on the Wind console (its default model is
// gemini-2.5-flash). Must match WIND_FEATURE on the backend.
const WIND_FEATURE = 'ocr';

// Last-known connection state, cached so the scan path can branch instantly
// (no network round-trip before every scan). The backend remains the source of
// truth — refreshWindStatus() reconciles it, and a dead token surfaces as a
// reconnect error at scan time regardless of what this cache says.
const WIND_CACHE_KEY = '@CalendarOCR:windConnected';

// ---------------------------------------------------------------------------
// PKCE helpers (RFC 7636, S256)
// ---------------------------------------------------------------------------

// Unreserved verifier/state alphabet (64 chars → clean byte→char mapping, all
// valid per RFC 7636 §4.1 so no escaping is ever needed).
const UNRESERVED = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

const randomString = async (byteLen) => {
  const bytes = await Crypto.getRandomBytesAsync(byteLen);
  let out = '';
  for (let i = 0; i < bytes.length; i++) out += UNRESERVED[bytes[i] % 64];
  return out;
};

const base64url = (b64) => b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

// challenge = BASE64URL(SHA256(ASCII(verifier)))
const challengeFromVerifier = async (verifier) => {
  const hash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, verifier, {
    encoding: Crypto.CryptoEncoding.BASE64,
  });
  return base64url(hash);
};

/** A fresh idempotency key so a retried scan reuses the same billed request. */
export const newIdempotencyKey = () => {
  try {
    return Crypto.randomUUID();
  } catch {
    // Non-crypto fallback; uniqueness is all the gateway needs for idempotency.
    return `idem-${Date.now().toString(16)}-${Math.floor(Math.random() * 0xffffffff).toString(16)}`;
  }
};

// ---------------------------------------------------------------------------
// Backend transport
// ---------------------------------------------------------------------------

/**
 * POST to one of the backend's /api/wind/* (or /api/scan-wind) endpoints.
 * Throws a typed error: `.windNetwork` for connectivity failures, otherwise an
 * error carrying `.status` and `.code` (e.g. 'wind_reconnect_required').
 */
const windPost = async (path, body) => {
  let response;
  try {
    response = await fetch(`${BACKEND_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-app-key': APP_API_KEY },
      body: JSON.stringify(body),
    });
  } catch (err) {
    logError('Wind: network error calling', path, err?.message);
    throw Object.assign(new Error('Could not reach the server. Check your connection.'), {
      windNetwork: true,
    });
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw Object.assign(new Error(data.message || `Request failed (${response.status})`), {
      status: response.status,
      code: data.error || null,
    });
  }
  return data;
};

const setCached = async (connected) => {
  try {
    await AsyncStorage.setItem(WIND_CACHE_KEY, connected ? 'true' : 'false');
  } catch (err) {
    warn('Wind: cache write failed:', err?.message);
  }
};

/** Instant local read of the last-known connection state (for scan branching). */
export const isWindConnectedCached = async () => {
  try {
    return (await AsyncStorage.getItem(WIND_CACHE_KEY)) === 'true';
  } catch {
    return false;
  }
};

/**
 * Ask the backend whether this device has a live connection, and reconcile the
 * local cache. Resilient: on any failure it falls back to the cached value so a
 * transient network blip never flips the UI to "disconnected".
 */
export const refreshWindStatus = async () => {
  try {
    const deviceId = await getDeviceId();
    const res = await windPost('/wind/status', { deviceId });
    const connected = !!res.connected;
    await setCached(connected);
    return { connected, connectionId: res.connectionId || null };
  } catch (err) {
    warn('Wind: status refresh failed, using cached value:', err?.message);
    return { connected: await isWindConnectedCached(), connectionId: null };
  }
};

// ---------------------------------------------------------------------------
// OAuth connect / disconnect
// ---------------------------------------------------------------------------

const parseCallbackParams = (url) => {
  const query = url.includes('?') ? url.slice(url.indexOf('?') + 1).split('#')[0] : '';
  const out = {};
  for (const pair of query.split('&')) {
    if (!pair) continue;
    const idx = pair.indexOf('=');
    const k = idx === -1 ? pair : pair.slice(0, idx);
    const v = idx === -1 ? '' : pair.slice(idx + 1);
    out[decodeURIComponent(k)] = decodeURIComponent(v);
  }
  return out;
};

/**
 * Run the full "Connect with Wind" flow: PKCE → hosted authorize/consent in a
 * secure auth session → hand the resulting code to the backend to exchange.
 *
 * Returns { ok: true } on success, { ok: false, canceled: true } if the user
 * dismissed the sheet, and throws on a genuine failure.
 */
export const connectWind = async () => {
  if (!WIND_CLIENT_ID) {
    throw new Error('Wind is not configured in this build.');
  }

  const deviceId = await getDeviceId();
  const verifier = await randomString(64); // 64 chars, within the 43–128 range
  const challenge = await challengeFromVerifier(verifier);
  const state = await randomString(24);

  const authorizeUrl =
    `${WIND_AUTHORIZE_BASE}/oauth/authorize?response_type=code` +
    `&code_challenge_method=S256` +
    `&client_id=${encodeURIComponent(WIND_CLIENT_ID)}` +
    `&redirect_uri=${encodeURIComponent(WIND_REDIRECT_URI)}` +
    `&code_challenge=${encodeURIComponent(challenge)}` +
    `&state=${encodeURIComponent(state)}` +
    `&features=${encodeURIComponent(WIND_FEATURE)}`;

  log('Wind: opening authorize session');
  const result = await WebBrowser.openAuthSessionAsync(authorizeUrl, WIND_REDIRECT_URI);

  if (result.type !== 'success' || !result.url) {
    log('Wind: auth session', result.type);
    return { ok: false, canceled: true };
  }

  const params = parseCallbackParams(result.url);
  if (params.error) {
    throw new Error(params.error_description || params.error);
  }
  // Reject a mismatched/absent state before spending the code (CSRF guard).
  if (!params.state || params.state !== state) {
    throw new Error('Could not verify the response. Please try connecting again.');
  }
  if (!params.code) {
    throw new Error('Wind did not return an authorization code.');
  }

  const res = await windPost('/wind/connect', {
    deviceId,
    code: params.code,
    code_verifier: verifier,
    redirect_uri: WIND_REDIRECT_URI,
  });
  if (!res.connected) {
    throw new Error('Connection could not be completed.');
  }

  await setCached(true);
  log('Wind: connected', res.connectionId || '');
  return { ok: true, connectionId: res.connectionId || null };
};

/**
 * Revoke the connection (best-effort at Wind) and clear local state. The device
 * always ends up disconnected, even if the server call fails.
 */
export const disconnectWind = async () => {
  const deviceId = await getDeviceId();
  try {
    await windPost('/wind/disconnect', { deviceId });
  } catch (err) {
    warn('Wind: disconnect call failed, clearing locally anyway:', err?.message);
  } finally {
    await setCached(false);
  }
  return { ok: true };
};

// ---------------------------------------------------------------------------
// Billed scan
// ---------------------------------------------------------------------------

/**
 * One multimodal OCR+parse call billed to the user's Wind wallet. Returns the
 * raw backend payload { success, events, wind } — the caller (ocrService)
 * normalizes `events` into the app's event objects. On a dead token the backend
 * replies 409 and this throws an error with code 'wind_reconnect_required'.
 */
export const scanWithWind = async ({ image, today, idempotencyKey }) => {
  const deviceId = await getDeviceId();
  return windPost('/scan-wind', { deviceId, image, today, idempotencyKey });
};
