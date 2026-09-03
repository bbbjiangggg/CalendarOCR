import {
  FREE_SCANS_PER_MONTH,
  freeRemaining,
  bonusRemaining,
  totalRemaining,
  consumeScan,
} from '../src/utils/referralMath';

describe('freeRemaining', () => {
  it('is the full allowance when nothing used', () => {
    expect(freeRemaining(0)).toBe(FREE_SCANS_PER_MONTH);
  });
  it('decreases with usage', () => {
    expect(freeRemaining(2)).toBe(1);
  });
  it('never goes negative', () => {
    expect(freeRemaining(5)).toBe(0);
  });
  it('treats missing input as 0 used', () => {
    expect(freeRemaining(undefined)).toBe(FREE_SCANS_PER_MONTH);
  });
});

describe('bonusRemaining', () => {
  it('is earned minus used', () => {
    expect(bonusRemaining(6, 2)).toBe(4);
  });
  it('never goes negative', () => {
    expect(bonusRemaining(3, 5)).toBe(0);
  });
  it('handles missing values', () => {
    expect(bonusRemaining(undefined, undefined)).toBe(0);
    expect(bonusRemaining(3, undefined)).toBe(3);
  });
});

describe('totalRemaining', () => {
  it('sums free and bonus', () => {
    // 1 monthly free left + (6-1)=5 bonus = 6
    expect(totalRemaining(2, 6, 1)).toBe(6);
  });
  it('is zero when both exhausted', () => {
    expect(totalRemaining(3, 3, 3)).toBe(0);
  });
});

describe('consumeScan', () => {
  it('charges monthly free first', () => {
    const r = consumeScan(0, 3, 0);
    expect(r).toEqual({ ok: true, bucket: 'free', monthlyUsed: 1, bonusUsed: 0 });
  });

  it('charges bonus once monthly free is exhausted', () => {
    const r = consumeScan(FREE_SCANS_PER_MONTH, 3, 0);
    expect(r).toEqual({
      ok: true,
      bucket: 'bonus',
      monthlyUsed: FREE_SCANS_PER_MONTH,
      bonusUsed: 1,
    });
  });

  it('fails when nothing is left', () => {
    const r = consumeScan(FREE_SCANS_PER_MONTH, 2, 2);
    expect(r).toEqual({
      ok: false,
      bucket: null,
      monthlyUsed: FREE_SCANS_PER_MONTH,
      bonusUsed: 2,
    });
  });

  it('does not mutate inputs', () => {
    const mUsed = 1;
    const r = consumeScan(mUsed, 0, 0);
    expect(r.monthlyUsed).toBe(2);
    expect(mUsed).toBe(1); // original untouched
  });

  it('spends the whole ladder in order: 3 free then 3 bonus', () => {
    let monthlyUsed = 0;
    let bonusUsed = 0;
    const earned = 3;
    const buckets = [];
    for (let i = 0; i < 6; i++) {
      const r = consumeScan(monthlyUsed, earned, bonusUsed);
      expect(r.ok).toBe(true);
      buckets.push(r.bucket);
      monthlyUsed = r.monthlyUsed;
      bonusUsed = r.bonusUsed;
    }
    expect(buckets).toEqual(['free', 'free', 'free', 'bonus', 'bonus', 'bonus']);
    // 7th scan should fail
    expect(consumeScan(monthlyUsed, earned, bonusUsed).ok).toBe(false);
  });
});
