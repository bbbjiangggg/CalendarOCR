import AsyncStorage from '@react-native-async-storage/async-storage';
import * as IAP from 'react-native-iap';
import { Platform } from 'react-native';
import { log, error as logError } from './logger';
import { totalRemaining, consumeScan } from './referralMath';
import { getStatus, activate } from './referralService';

// Product IDs (must match what you set up in App Store Connect)
const PRODUCT_IDS = Platform.select({
  ios: ['com.bowenjiang.calendarocr.pro'],
  android: ['pro_unlimited'],
});

const SCAN_LIMIT_KEY = '@CalendarOCR:scanCount';          // monthly free scans used
const SCAN_RESET_KEY = '@CalendarOCR:lastResetDate';
const PRO_STATUS_KEY = '@CalendarOCR:isPro';
const BONUS_EARNED_KEY = '@CalendarOCR:bonusScansEarned'; // cache of server-earned bonus
const BONUS_USED_KEY = '@CalendarOCR:bonusScansUsed';     // bonus pool consumed
const ACTIVATED_KEY = '@CalendarOCR:referralActivated';   // first-save activation sent

// Read a stored non-negative integer counter (0 if unset/invalid).
const readInt = async (key) => {
  const s = await AsyncStorage.getItem(key);
  const parsed = s ? parseInt(s, 10) : 0;
  return Number.isFinite(parsed) ? parsed : 0;
};

/**
 * Initialize IAP connection
 */
export const initIAP = async () => {
  try {
    await IAP.initConnection();
    log('IAP: Connection initialized');

    // Check if user has purchased Pro
    await checkPurchaseStatus();

    // Pull latest referral bonus balance (non-fatal if offline)
    await syncReferralBonus();
  } catch (error) {
    logError('IAP: Failed to initialize:', error);
  }
};

/**
 * Clean up IAP connection
 */
export const endIAP = async () => {
  try {
    await IAP.endConnection();
    log('IAP: Connection ended');
  } catch (error) {
    logError('IAP: Failed to end connection:', error);
  }
};

/**
 * Check if user has Pro version
 */
export const checkIsPro = async () => {
  try {
    const isPro = await AsyncStorage.getItem(PRO_STATUS_KEY);
    return isPro === 'true';
  } catch (error) {
    logError('IAP: Error checking Pro status:', error);
    return false;
  }
};

/**
 * Get remaining free scans for current month
 */
export const getRemainingScans = async () => {
  try {
    // If user is Pro, return unlimited
    const isPro = await checkIsPro();
    if (isPro) {
      return -1; // -1 means unlimited
    }

    // Check if we need to reset the monthly counter (bonus pool never resets)
    await resetMonthlyScansIfNeeded();

    const monthlyUsed = await readInt(SCAN_LIMIT_KEY);
    const bonusEarned = await readInt(BONUS_EARNED_KEY);
    const bonusUsed = await readInt(BONUS_USED_KEY);

    return totalRemaining(monthlyUsed, bonusEarned, bonusUsed);
  } catch (error) {
    logError('IAP: Error getting remaining scans:', error);
    return 0;
  }
};

/**
 * Increment scan counter
 */
export const incrementScanCount = async () => {
  try {
    const isPro = await checkIsPro();
    if (isPro) {
      return true; // Pro users have unlimited scans
    }

    await resetMonthlyScansIfNeeded();

    const monthlyUsed = await readInt(SCAN_LIMIT_KEY);
    const bonusEarned = await readInt(BONUS_EARNED_KEY);
    const bonusUsed = await readInt(BONUS_USED_KEY);

    // Spend monthly free first, then the permanent referral bonus pool.
    const result = consumeScan(monthlyUsed, bonusEarned, bonusUsed);
    if (!result.ok) {
      return false; // No scans left (monthly + bonus both exhausted)
    }

    if (result.bucket === 'free') {
      await AsyncStorage.setItem(SCAN_LIMIT_KEY, String(result.monthlyUsed));
    } else {
      await AsyncStorage.setItem(BONUS_USED_KEY, String(result.bonusUsed));
    }
    log(`IAP: Scan charged to ${result.bucket} bucket`);
    return true;
  } catch (error) {
    logError('IAP: Error incrementing scan count:', error);
    return false;
  }
};

/**
 * Reset scan counter if month has changed
 */
const resetMonthlyScansIfNeeded = async () => {
  try {
    const lastResetStr = await AsyncStorage.getItem(SCAN_RESET_KEY);
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${now.getMonth()}`;

    if (lastResetStr !== currentMonth) {
      // New month - reset counter
      await AsyncStorage.setItem(SCAN_LIMIT_KEY, '0');
      await AsyncStorage.setItem(SCAN_RESET_KEY, currentMonth);
      log('IAP: Monthly scan counter reset');
    }
  } catch (error) {
    logError('IAP: Error resetting monthly scans:', error);
  }
};

/**
 * Referral: pull the server-authoritative earned bonus balance into the local
 * cache so getRemainingScans reflects it. Non-fatal on failure (keeps last
 * known value). Returns the full status object (or null).
 */
export const syncReferralBonus = async () => {
  try {
    const status = await getStatus();
    if (status && Number.isFinite(status.bonusScans)) {
      await AsyncStorage.setItem(BONUS_EARNED_KEY, String(status.bonusScans));
    }
    return status;
  } catch (error) {
    logError('Referral: bonus sync failed:', error);
    return null;
  }
};

/**
 * Referral: mark this device activated on its first successful save. Tells the
 * backend to credit any pending referral (both sides +3). Sent at most once per
 * device (guarded locally); the backend is also idempotent. After a successful
 * activation we re-sync so a referred user's own +3 shows up immediately.
 */
export const markActivatedIfNeeded = async () => {
  try {
    const already = await AsyncStorage.getItem(ACTIVATED_KEY);
    if (already === 'true') return;

    const result = await activate();
    if (result) {
      await AsyncStorage.setItem(ACTIVATED_KEY, 'true');
      await syncReferralBonus();
    }
  } catch (error) {
    logError('Referral: activation failed:', error);
  }
};

/**
 * Purchase Pro version
 */
export const purchasePro = async () => {
  try {
    log('IAP: Starting purchase flow...');

    // Get products
    const products = await IAP.getProducts({ skus: PRODUCT_IDS });
    log('IAP: Available products:', products);

    if (!products || products.length === 0) {
      throw new Error('No products available');
    }

    // Request purchase
    const productId = PRODUCT_IDS[0];
    await IAP.requestPurchase({ sku: productId });

    log('IAP: Purchase successful!');
    return true;
  } catch (error) {
    logError('IAP: Purchase failed:', error);

    // User cancelled
    if (error.code === 'E_USER_CANCELLED') {
      log('IAP: User cancelled purchase');
      return false;
    }

    throw error;
  }
};

/**
 * Restore previous purchases (for users who reinstalled)
 */
export const restorePurchases = async () => {
  try {
    log('IAP: Restoring purchases...');

    const purchases = await IAP.getAvailablePurchases();
    log('IAP: Available purchases:', purchases);

    // Check if user has purchased Pro
    const hasPro = purchases.some(purchase =>
      PRODUCT_IDS.includes(purchase.productId)
    );

    if (hasPro) {
      await AsyncStorage.setItem(PRO_STATUS_KEY, 'true');
      log('IAP: Pro status restored');
      return true;
    }

    log('IAP: No purchases to restore');
    return false;
  } catch (error) {
    logError('IAP: Error restoring purchases:', error);
    return false;
  }
};

/**
 * Check purchase status on app start
 */
export const checkPurchaseStatus = async () => {
  try {
    // First check local storage
    const localProStatus = await checkIsPro();
    if (localProStatus) {
      return true;
    }

    // If not found locally, check with store
    return await restorePurchases();
  } catch (error) {
    logError('IAP: Error checking purchase status:', error);
    return false;
  }
};

/**
 * Set up purchase listener
 */
export const setupPurchaseListener = () => {
  const purchaseUpdateSubscription = IAP.purchaseUpdatedListener(
    async (purchase) => {
      log('IAP: Purchase update:', purchase);

      const receipt = purchase.transactionReceipt;
      if (receipt) {
        try {
          // Validate purchase with store
          if (Platform.OS === 'ios') {
            await IAP.finishTransaction({ purchase, isConsumable: false });
          } else {
            await IAP.acknowledgePurchaseAndroid({ token: purchase.purchaseToken });
          }

          // Mark user as Pro
          await AsyncStorage.setItem(PRO_STATUS_KEY, 'true');
          log('IAP: Purchase completed and saved!');

        } catch (error) {
          logError('IAP: Error finishing transaction:', error);
        }
      }
    }
  );

  const purchaseErrorSubscription = IAP.purchaseErrorListener(
    (error) => {
      logError('IAP: Purchase error:', error);
    }
  );

  // Return cleanup function
  return () => {
    purchaseUpdateSubscription.remove();
    purchaseErrorSubscription.remove();
  };
};
