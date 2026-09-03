/**
 * Client for the CalendarOCR referral backend (Vercel + Upstash).
 *
 * Endpoints (all POST, gated by the shared x-app-key like ocrService):
 *   /api/referral/code     -> { code, bonusScans, referrals }
 *   /api/referral/redeem   -> 200 { success:true } | 409 { success:false, reason, message }
 *   /api/referral/activate -> { credited, alreadyActivated, bonusScans }
 *   /api/referral/status   -> { code, bonusScans, referrals, referredBy, activated }
 *
 * Each function resolves the deviceId itself so callers don't have to. Read
 * calls (code/status/activate) return null on failure and are treated as
 * non-fatal by callers; redeem always returns a structured result so the UI can
 * show the backend's friendly message.
 */
import { APP_API_KEY } from './config';
import { getDeviceId } from './deviceId';
import { log, error as logError } from './logger';

const REFERRAL_BASE_URL = 'https://calendar-ocr-backend.vercel.app/api/referral';

const postReferral = async (path, extraBody = {}) => {
  const deviceId = await getDeviceId();
  const response = await fetch(`${REFERRAL_BASE_URL}/${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-app-key': APP_API_KEY,
    },
    body: JSON.stringify({ deviceId, ...extraBody }),
  });
  const data = await response.json().catch(() => ({}));
  return { httpOk: response.ok, status: response.status, data };
};

/**
 * Get this device's own referral code (minting one on first call).
 * Returns { code, bonusScans, referrals } or null on failure.
 */
export const getMyCode = async () => {
  try {
    const { httpOk, data } = await postReferral('code');
    if (!httpOk || !data.success) return null;
    return { code: data.code, bonusScans: data.bonusScans, referrals: data.referrals };
  } catch (err) {
    logError('Referral: getMyCode failed:', err.message);
    return null;
  }
};

/**
 * Redeem a friend's code. Always returns a structured result:
 *   { success: true }
 *   { success: false, reason, message }   // invalid_code | self_referral | already_referred | not_new_user | network
 */
export const redeemCode = async (code) => {
  try {
    const { data } = await postReferral('redeem', { code });
    if (data && data.success) return { success: true };
    return {
      success: false,
      reason: data?.reason || 'unknown',
      message: data?.message || 'Could not redeem that code. Please try again.',
    };
  } catch (err) {
    logError('Referral: redeemCode failed:', err.message);
    return {
      success: false,
      reason: 'network',
      message: 'Could not reach the server. Check your connection and try again.',
    };
  }
};

/**
 * Mark this device as activated (first successful save). Idempotent server-side.
 * Returns { credited, alreadyActivated, bonusScans } or null on failure.
 */
export const activate = async () => {
  try {
    const { httpOk, data } = await postReferral('activate');
    if (!httpOk || !data.success) return null;
    log('Referral: activate ->', data);
    return {
      credited: !!data.credited,
      alreadyActivated: !!data.alreadyActivated,
      bonusScans: data.bonusScans || 0,
    };
  } catch (err) {
    logError('Referral: activate failed:', err.message);
    return null;
  }
};

/**
 * Fetch referral status for the UI + bonus sync.
 * Returns { code, bonusScans, referrals, referredBy, activated } or null.
 */
export const getStatus = async () => {
  try {
    const { httpOk, data } = await postReferral('status');
    if (!httpOk || !data.success) return null;
    return {
      code: data.code,
      bonusScans: data.bonusScans || 0,
      referrals: data.referrals || 0,
      referredBy: !!data.referredBy,
      activated: !!data.activated,
    };
  } catch (err) {
    logError('Referral: getStatus failed:', err.message);
    return null;
  }
};
