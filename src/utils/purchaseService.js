import AsyncStorage from '@react-native-async-storage/async-storage';
import * as IAP from 'react-native-iap';
import { Platform } from 'react-native';

// Product IDs (must match what you set up in App Store Connect)
const PRODUCT_IDS = Platform.select({
  ios: ['com.bowenjiang.calendarocr.pro'],
  android: ['pro_unlimited'],
});

const SCAN_LIMIT_KEY = '@CalendarOCR:scanCount';
const SCAN_RESET_KEY = '@CalendarOCR:lastResetDate';
const PRO_STATUS_KEY = '@CalendarOCR:isPro';

// Constants
const FREE_SCANS_PER_MONTH = 3;

/**
 * Initialize IAP connection
 */
export const initIAP = async () => {
  try {
    await IAP.initConnection();
    console.log('IAP: Connection initialized');

    // Check if user has purchased Pro
    await checkPurchaseStatus();
  } catch (error) {
    console.error('IAP: Failed to initialize:', error);
  }
};

/**
 * Clean up IAP connection
 */
export const endIAP = async () => {
  try {
    await IAP.endConnection();
    console.log('IAP: Connection ended');
  } catch (error) {
    console.error('IAP: Failed to end connection:', error);
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
    console.error('IAP: Error checking Pro status:', error);
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

    // Check if we need to reset monthly counter
    await resetMonthlyScansIfNeeded();

    // Get current scan count
    const scanCountStr = await AsyncStorage.getItem(SCAN_LIMIT_KEY);
    const scanCount = scanCountStr ? parseInt(scanCountStr) : 0;

    const remaining = FREE_SCANS_PER_MONTH - scanCount;
    return Math.max(0, remaining);
  } catch (error) {
    console.error('IAP: Error getting remaining scans:', error);
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

    const scanCountStr = await AsyncStorage.getItem(SCAN_LIMIT_KEY);
    const scanCount = scanCountStr ? parseInt(scanCountStr) : 0;

    if (scanCount >= FREE_SCANS_PER_MONTH) {
      return false; // Limit reached
    }

    await AsyncStorage.setItem(SCAN_LIMIT_KEY, String(scanCount + 1));
    console.log(`IAP: Scan count incremented to ${scanCount + 1}`);
    return true;
  } catch (error) {
    console.error('IAP: Error incrementing scan count:', error);
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
      console.log('IAP: Monthly scan counter reset');
    }
  } catch (error) {
    console.error('IAP: Error resetting monthly scans:', error);
  }
};

/**
 * Purchase Pro version
 */
export const purchasePro = async () => {
  try {
    console.log('IAP: Starting purchase flow...');

    // Get products
    const products = await IAP.getProducts({ skus: PRODUCT_IDS });
    console.log('IAP: Available products:', products);

    if (!products || products.length === 0) {
      throw new Error('No products available');
    }

    // Request purchase
    const productId = PRODUCT_IDS[0];
    await IAP.requestPurchase({ sku: productId });

    console.log('IAP: Purchase successful!');
    return true;
  } catch (error) {
    console.error('IAP: Purchase failed:', error);

    // User cancelled
    if (error.code === 'E_USER_CANCELLED') {
      console.log('IAP: User cancelled purchase');
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
    console.log('IAP: Restoring purchases...');

    const purchases = await IAP.getAvailablePurchases();
    console.log('IAP: Available purchases:', purchases);

    // Check if user has purchased Pro
    const hasPro = purchases.some(purchase =>
      PRODUCT_IDS.includes(purchase.productId)
    );

    if (hasPro) {
      await AsyncStorage.setItem(PRO_STATUS_KEY, 'true');
      console.log('IAP: Pro status restored');
      return true;
    }

    console.log('IAP: No purchases to restore');
    return false;
  } catch (error) {
    console.error('IAP: Error restoring purchases:', error);
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
    console.error('IAP: Error checking purchase status:', error);
    return false;
  }
};

/**
 * Set up purchase listener
 */
export const setupPurchaseListener = () => {
  const purchaseUpdateSubscription = IAP.purchaseUpdatedListener(
    async (purchase) => {
      console.log('IAP: Purchase update:', purchase);

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
          console.log('IAP: Purchase completed and saved!');

        } catch (error) {
          console.error('IAP: Error finishing transaction:', error);
        }
      }
    }
  );

  const purchaseErrorSubscription = IAP.purchaseErrorListener(
    (error) => {
      console.error('IAP: Purchase error:', error);
    }
  );

  // Return cleanup function
  return () => {
    purchaseUpdateSubscription.remove();
    purchaseErrorSubscription.remove();
  };
};
