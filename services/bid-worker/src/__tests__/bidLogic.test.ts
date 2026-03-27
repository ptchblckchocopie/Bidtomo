import { describe, it, expect } from 'vitest';
import {
  validateBid,
  isShillBid,
  calculateMinimumBid,
  calculateAutoBidSteps,
  shouldAutoExtend,
  type AutoBidder,
} from '../bidLogic';

describe('validateBid', () => {
  it('accepts a valid first bid at starting price', () => {
    expect(validateBid(100, 0, 10, 100)).toEqual({ valid: true });
  });

  it('accepts a valid bid above minimum', () => {
    expect(validateBid(160, 150, 10, 100)).toEqual({ valid: true });
  });

  it('rejects bid below minimum (current + interval)', () => {
    const result = validateBid(155, 150, 10, 100);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('160');
  });

  it('rejects bid below starting price when no bids exist', () => {
    const result = validateBid(50, 0, 10, 100);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('100');
  });

  it('rejects zero amount', () => {
    expect(validateBid(0, 0, 10, 100).valid).toBe(false);
  });

  it('rejects negative amount', () => {
    expect(validateBid(-50, 0, 10, 100).valid).toBe(false);
  });

  it('rejects NaN', () => {
    expect(validateBid(NaN, 0, 10, 100).valid).toBe(false);
  });

  it('rejects Infinity', () => {
    expect(validateBid(Infinity, 0, 10, 100).valid).toBe(false);
  });

  it('rejects bid exceeding max cap (10x current or 10M)', () => {
    const result = validateBid(20_000_000, 1000, 10, 100);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('maximum');
  });

  it('accepts bid just under max cap', () => {
    // Max = max(1000 * 10, 10M) = 10M
    expect(validateBid(9_999_999, 1000, 10, 100).valid).toBe(true);
  });

  it('uses startingPrice for max cap when currentBid is 0', () => {
    // Max = max(100 * 10, 10M) = 10M
    expect(validateBid(10_000_001, 0, 10, 100).valid).toBe(false);
  });
});

describe('isShillBid', () => {
  it('detects shill bid (bidder === seller)', () => {
    expect(isShillBid(5, 5)).toBe(true);
  });

  it('allows legitimate bid (bidder !== seller)', () => {
    expect(isShillBid(5, 10)).toBe(false);
  });
});

describe('calculateMinimumBid', () => {
  it('returns startingPrice when no bids exist', () => {
    expect(calculateMinimumBid(0, 10, 100)).toBe(100);
  });

  it('returns currentBid + interval when bids exist', () => {
    expect(calculateMinimumBid(150, 10, 100)).toBe(160);
  });

  it('works with decimal intervals', () => {
    expect(calculateMinimumBid(99.50, 0.50, 50)).toBe(100);
  });
});

describe('calculateAutoBidSteps', () => {
  function makeAutoBidder(bidderId: number, maxAmount: number, createdAt = 0): AutoBidder {
    return { bidderId, maxAmount, censorName: false, createdAt };
  }

  it('returns empty steps when no auto-bidders can counter', () => {
    const bidders = new Map<number, AutoBidder>();
    bidders.set(1, makeAutoBidder(1, 100));
    // Bidder 1 is already the high bidder with max 100, running bid is 100
    const result = calculateAutoBidSteps(bidders, 100, 1, 10, 50);
    expect(result.steps).toHaveLength(0);
    expect(result.finalBidderId).toBe(1);
  });

  it('resolves 2 auto-bidders correctly', () => {
    const bidders = new Map<number, AutoBidder>();
    bidders.set(1, makeAutoBidder(1, 200, 1000)); // max 200, set first
    bidders.set(2, makeAutoBidder(2, 300, 2000)); // max 300, set second

    // Current bid is 100 by bidder 1, interval 10, start 50
    const result = calculateAutoBidSteps(bidders, 100, 1, 10, 50);

    // Bidder 2 should counter at 110, bidder 1 at 120, etc.
    expect(result.steps.length).toBeGreaterThan(0);
    // Bidder 2 has higher max so should win
    expect(result.finalBidderId).toBe(2);
    // Final amount should be just above bidder 1's max (200 + 10 = 210)
    expect(result.finalAmount).toBe(210);
  });

  it('resolves 3 auto-bidders with tie-breaking by timestamp', () => {
    const bidders = new Map<number, AutoBidder>();
    bidders.set(1, makeAutoBidder(1, 200, 3000)); // latest
    bidders.set(2, makeAutoBidder(2, 200, 1000)); // earliest
    bidders.set(3, makeAutoBidder(3, 200, 2000)); // middle

    // All have same max. Bidder 2 set first, should win ties.
    const result = calculateAutoBidSteps(bidders, 50, 99, 10, 50);

    // Should have some steps, earliest bidder (2) should end up winning
    expect(result.finalBidderId).toBe(2);
  });

  it('handles bidder exhaustion correctly', () => {
    const bidders = new Map<number, AutoBidder>();
    bidders.set(1, makeAutoBidder(1, 120)); // exhausts at 120
    bidders.set(2, makeAutoBidder(2, 500)); // much higher max

    const result = calculateAutoBidSteps(bidders, 100, 99, 10, 50);

    // Bidder 1 counters at 110, bidder 2 at 120, bidder 1 can't go above 120
    // Bidder 2 wins at 130 (120 + interval)
    expect(result.finalBidderId).toBe(2);
    expect(result.finalAmount).toBe(130);
  });

  it('respects max steps limit', () => {
    const bidders = new Map<number, AutoBidder>();
    bidders.set(1, makeAutoBidder(1, 1_000_000));
    bidders.set(2, makeAutoBidder(2, 1_000_000));

    const result = calculateAutoBidSteps(bidders, 0, 99, 1, 1, 10);

    // Should cap at 10 steps
    expect(result.steps).toHaveLength(10);
  });

  it('returns correct steps for single counter-bidder', () => {
    const bidders = new Map<number, AutoBidder>();
    bidders.set(1, makeAutoBidder(1, 150)); // only auto-bidder

    // Manual bidder 99 has current high bid at 100
    const result = calculateAutoBidSteps(bidders, 100, 99, 10, 50);

    // Bidder 1 should place one counter-bid at 110
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0]).toEqual({ amount: 110, bidderId: 1, censorName: false });
    expect(result.finalBidderId).toBe(1);
    expect(result.finalAmount).toBe(110);
  });

  it('handles first bid (no current bids) correctly', () => {
    const bidders = new Map<number, AutoBidder>();
    bidders.set(1, makeAutoBidder(1, 200));

    // No bids yet (currentBid=0, currentBidderId=0)
    const result = calculateAutoBidSteps(bidders, 0, 0, 10, 50);

    // Should bid starting price (50)
    expect(result.steps[0].amount).toBe(50);
  });
});

describe('shouldAutoExtend', () => {
  it('returns true when bid arrives within threshold', () => {
    const end = new Date(Date.now() + 2 * 60 * 1000); // 2 min from now
    expect(shouldAutoExtend(end, 5)).toBe(true); // threshold is 5 min
  });

  it('returns false when plenty of time remaining', () => {
    const end = new Date(Date.now() + 30 * 60 * 1000); // 30 min from now
    expect(shouldAutoExtend(end, 5)).toBe(false);
  });

  it('returns false when auction already ended', () => {
    const end = new Date(Date.now() - 60 * 1000); // 1 min ago
    expect(shouldAutoExtend(end, 5)).toBe(false);
  });

  it('returns false when autoExtendMinutes is 0', () => {
    const end = new Date(Date.now() + 1 * 60 * 1000); // 1 min from now
    expect(shouldAutoExtend(end, 0)).toBe(false);
  });

  it('returns true at exact threshold boundary', () => {
    const now = new Date();
    const end = new Date(now.getTime() + 5 * 60 * 1000 - 1); // just under 5 min
    expect(shouldAutoExtend(end, 5, now)).toBe(true);
  });
});
