/**
 * Stable per-device identifier for the referral system.
 *
 * Uses iOS `identifierForVendor` (idfv) as the primary id and caches it in
 * AsyncStorage so it stays stable and we don't hit the native module on every
 * call. idfv persists across app updates and normal reinstalls (as long as the
 * user keeps at least one of the vendor's apps), which is what the referral
 * ledger keys on. A random fallback is persisted only if idfv is unavailable.
 *
 * NOTE: this is device-scoped identity (no login), matching the MVP decision.
 * It stops casual abuse but a determined user who deletes all vendor apps can
 * reset it — an accepted limitation, consistent with the unhardened paywall.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Application from 'expo-application';
import { Platform } from 'react-native';
import { warn } from './logger';

const DEVICE_ID_KEY = '@CalendarOCR:deviceId';

let cached = null;

/**
 * Fallback id — NOT cryptographically strong. Only used if idfv is unavailable;
 * once persisted it stays stable, which is all the ledger needs. Kept well above
 * the backend's 8-char minimum.
 */
const genFallbackId = () => {
  const rand = () =>
    Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, '0');
  return `fb-${rand()}${rand()}-${Date.now().toString(16)}`;
};

/**
 * Resolve (and cache) this device's referral id. Always returns a non-empty
 * string safe to send as `deviceId` to the backend.
 */
export const getDeviceId = async () => {
  if (cached) return cached;

  try {
    const stored = await AsyncStorage.getItem(DEVICE_ID_KEY);
    if (stored) {
      cached = stored;
      return stored;
    }
  } catch (err) {
    warn('deviceId: read failed:', err?.message);
  }

  let id = null;
  try {
    if (Platform.OS === 'ios') {
      id = await Application.getIosIdForVendorAsync();
    } else if (Platform.OS === 'android') {
      id = Application.getAndroidId?.() || Application.androidId || null;
    }
  } catch (err) {
    warn('deviceId: native lookup failed:', err?.message);
  }

  if (!id) id = genFallbackId();

  try {
    await AsyncStorage.setItem(DEVICE_ID_KEY, id);
  } catch (err) {
    warn('deviceId: persist failed:', err?.message);
  }

  cached = id;
  return id;
};
