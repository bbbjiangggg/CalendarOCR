/**
 * Pure scan-balance arithmetic for the freemium + referral bonus system.
 *
 * Kept free of AsyncStorage/native deps so it can be unit-tested. purchaseService
 * reads the raw counters from storage, delegates the math here, and writes back.
 *
 * Model:
 *  • Monthly free scans: FREE_SCANS_PER_MONTH, reset each month (monthlyUsed).
 *  • Bonus pool: earned via referrals (bonusEarned, server-authoritative),
 *    a ONE-TIME PERMANENT pool that never resets. bonusUsed tracks consumption.
 *  • Consumption order: spend monthly free first, then the bonus pool.
 */

export const FREE_SCANS_PER_MONTH = 3;

const n = (v) => (Number.isFinite(v) ? v : 0);

/** Monthly free scans still available this month. */
export function freeRemaining(monthlyUsed) {
  return Math.max(0, FREE_SCANS_PER_MONTH - n(monthlyUsed));
}

/** Bonus scans still available from the permanent pool. */
export function bonusRemaining(bonusEarned, bonusUsed) {
  return Math.max(0, n(bonusEarned) - n(bonusUsed));
}

/** Total scans a (non-Pro) user can still perform. */
export function totalRemaining(monthlyUsed, bonusEarned, bonusUsed) {
  return freeRemaining(monthlyUsed) + bonusRemaining(bonusEarned, bonusUsed);
}

/**
 * Decide how to charge one scan, spending monthly free first, then bonus.
 * Returns the NEW counter values plus which bucket was charged:
 *   { ok: true,  bucket: 'free'|'bonus', monthlyUsed, bonusUsed }
 *   { ok: false, bucket: null, monthlyUsed, bonusUsed }   // no scans left
 * Never mutates its inputs.
 */
export function consumeScan(monthlyUsed, bonusEarned, bonusUsed) {
  const mUsed = n(monthlyUsed);
  const bUsed = n(bonusUsed);

  if (freeRemaining(mUsed) > 0) {
    return { ok: true, bucket: 'free', monthlyUsed: mUsed + 1, bonusUsed: bUsed };
  }
  if (bonusRemaining(bonusEarned, bUsed) > 0) {
    return { ok: true, bucket: 'bonus', monthlyUsed: mUsed, bonusUsed: bUsed + 1 };
  }
  return { ok: false, bucket: null, monthlyUsed: mUsed, bonusUsed: bUsed };
}
