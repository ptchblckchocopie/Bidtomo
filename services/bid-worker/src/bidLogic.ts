/**
 * Pure bid validation and calculation functions.
 * Extracted from index.ts for testability — no DB or Redis dependencies.
 */

export interface BidValidation {
  valid: boolean;
  error?: string;
}

export interface AutoBidder {
  bidderId: number;
  maxAmount: number;
  censorName: boolean;
  createdAt: number;
}

export interface AutoBidStep {
  amount: number;
  bidderId: number;
  censorName: boolean;
}

/**
 * Validate a bid amount against product state.
 */
export function validateBid(
  amount: number,
  currentBid: number,
  bidInterval: number,
  startingPrice: number,
): BidValidation {
  if (typeof amount !== 'number' || isNaN(amount) || !isFinite(amount) || amount <= 0) {
    return { valid: false, error: 'Invalid bid amount' };
  }

  const minimumBid = currentBid > 0 ? currentBid + bidInterval : startingPrice;

  if (amount < minimumBid) {
    return { valid: false, error: `Bid must be at least ${minimumBid}` };
  }

  // Cap maximum bid to prevent griefing
  const maxBid = Math.max((currentBid || startingPrice) * 10, 10_000_000);
  if (amount > maxBid) {
    return { valid: false, error: `Bid amount exceeds maximum allowed (${maxBid})` };
  }

  return { valid: true };
}

/**
 * Check if a bid is a shill bid (bidder is the seller).
 */
export function isShillBid(bidderId: number, sellerId: number): boolean {
  return bidderId === sellerId;
}

/**
 * Calculate the minimum bid for a product.
 */
export function calculateMinimumBid(
  currentBid: number,
  bidInterval: number,
  startingPrice: number,
): number {
  return currentBid > 0 ? currentBid + bidInterval : startingPrice;
}

/**
 * Calculate auto-bid steps for competing auto-bidders.
 * Returns an array of bids that would be placed in sequence.
 *
 * @param autoBidders - Map of bidderId → AutoBidder
 * @param currentBid - Current highest bid amount
 * @param currentBidderId - Current highest bidder's ID
 * @param bidInterval - Minimum bid increment
 * @param startingPrice - Product starting price
 * @param maxSteps - Maximum incremental steps before jumping to final
 */
export function calculateAutoBidSteps(
  autoBidders: Map<number, AutoBidder>,
  currentBid: number,
  currentBidderId: number,
  bidInterval: number,
  startingPrice: number,
  maxSteps = 50,
): { steps: AutoBidStep[]; finalBidderId: number; finalAmount: number } {
  const steps: AutoBidStep[] = [];
  let runningBid = currentBid;
  let currentHighBidderId = currentBidderId;

  for (let step = 0; step < maxSteps; step++) {
    const nextMin = runningBid > 0 ? runningBid + bidInterval : startingPrice;

    const currentHolderAB = autoBidders.get(currentHighBidderId);
    let bestCounter: AutoBidder | null = null;

    for (const [bidderId, ab] of autoBidders) {
      if (bidderId === currentHighBidderId) continue;
      if (ab.maxAmount <= runningBid) continue;

      const wouldBidAmount = ab.maxAmount >= nextMin ? nextMin : ab.maxAmount;
      if (wouldBidAmount === ab.maxAmount && currentHolderAB &&
          currentHolderAB.maxAmount === ab.maxAmount &&
          currentHolderAB.createdAt < ab.createdAt) {
        continue; // Current holder was first with same max
      }

      if (!bestCounter || ab.maxAmount > bestCounter.maxAmount ||
          (ab.maxAmount === bestCounter.maxAmount && ab.createdAt < bestCounter.createdAt)) {
        bestCounter = ab;
      }
    }

    if (!bestCounter) break;

    const counterBidAmount = bestCounter.maxAmount >= nextMin ? nextMin : bestCounter.maxAmount;
    steps.push({ amount: counterBidAmount, bidderId: bestCounter.bidderId, censorName: bestCounter.censorName });
    runningBid = counterBidAmount;
    currentHighBidderId = bestCounter.bidderId;
  }

  return {
    steps,
    finalBidderId: currentHighBidderId,
    finalAmount: runningBid,
  };
}

/**
 * Check if an auction should be auto-extended.
 */
export function shouldAutoExtend(
  auctionEndDate: Date,
  autoExtendMinutes: number,
  now: Date = new Date(),
): boolean {
  if (autoExtendMinutes <= 0) return false;
  const endTime = auctionEndDate.getTime();
  const nowTime = now.getTime();
  const thresholdMs = autoExtendMinutes * 60 * 1000;
  return endTime - nowTime < thresholdMs && endTime > nowTime;
}
