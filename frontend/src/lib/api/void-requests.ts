import { BRIDGE_URL, getAuthHeaders } from './_shared';
import type { VoidRequest } from './types';

export async function createVoidRequest(
  transactionId: string,
  reason: string
): Promise<{ success: boolean; voidRequest?: VoidRequest; error?: string }> {
  try {
    const response = await fetch(`${BRIDGE_URL}/api/bridge/void-request/create`, {
      method: 'POST',
      headers: getAuthHeaders(),
      credentials: 'include',
      body: JSON.stringify({ transactionId, reason }),
    });

    const data = await response.json();

    if (!response.ok) {
      return { success: false, error: data.error || 'Failed to create void request' };
    }

    return { success: true, voidRequest: data.voidRequest };
  } catch (error) {
    console.error('Error creating void request:', error);
    return { success: false, error: 'Failed to create void request' };
  }
}

export async function respondToVoidRequest(
  voidRequestId: string,
  action: 'approve' | 'reject',
  rejectionReason?: string
): Promise<{ success: boolean; voidRequest?: VoidRequest; error?: string; requiresSellerChoice?: boolean }> {
  try {
    const response = await fetch(`${BRIDGE_URL}/api/bridge/void-request/respond`, {
      method: 'POST',
      headers: getAuthHeaders(),
      credentials: 'include',
      body: JSON.stringify({ voidRequestId, action, rejectionReason }),
    });

    const data = await response.json();

    if (!response.ok) {
      return { success: false, error: data.error || 'Failed to respond to void request' };
    }

    return { success: true, voidRequest: data.voidRequest, requiresSellerChoice: data.requiresSellerChoice };
  } catch (error) {
    console.error('Error responding to void request:', error);
    return { success: false, error: 'Failed to respond to void request' };
  }
}

export async function submitSellerChoice(
  voidRequestId: string,
  choice: 'restart_bidding' | 'offer_second_bidder'
): Promise<{ success: boolean; voidRequest?: VoidRequest; error?: string; notifiedBidders?: number; onlyOption?: string }> {
  try {
    const response = await fetch(`${BRIDGE_URL}/api/bridge/void-request/seller-choice`, {
      method: 'POST',
      headers: getAuthHeaders(),
      credentials: 'include',
      body: JSON.stringify({ voidRequestId, choice }),
    });

    const data = await response.json();

    if (!response.ok) {
      return { success: false, error: data.error || 'Failed to submit seller choice', onlyOption: data.onlyOption };
    }

    return { success: true, voidRequest: data.voidRequest, notifiedBidders: data.notifiedBidders };
  } catch (error) {
    console.error('Error submitting seller choice:', error);
    return { success: false, error: 'Failed to submit seller choice' };
  }
}

export async function respondToSecondBidderOffer(
  voidRequestId: string,
  action: 'accept' | 'decline'
): Promise<{ success: boolean; voidRequest?: VoidRequest; error?: string }> {
  try {
    const response = await fetch(`${BRIDGE_URL}/api/bridge/void-request/second-bidder-response`, {
      method: 'POST',
      headers: getAuthHeaders(),
      credentials: 'include',
      body: JSON.stringify({ voidRequestId, action }),
    });

    const data = await response.json();

    if (!response.ok) {
      return { success: false, error: data.error || 'Failed to respond to offer' };
    }

    return { success: true, voidRequest: data.voidRequest };
  } catch (error) {
    console.error('Error responding to second bidder offer:', error);
    return { success: false, error: 'Failed to respond to offer' };
  }
}

export async function getVoidRequestsForTransaction(
  transactionId: string
): Promise<VoidRequest[]> {
  try {
    const response = await fetch(
      `${BRIDGE_URL}/api/bridge/void-request/${transactionId}`,
      {
        headers: getAuthHeaders(),
        credentials: 'include',
      }
    );

    if (!response.ok) {
      throw new Error('Failed to fetch void requests');
    }

    const data = await response.json();
    return data.voidRequests || [];
  } catch (error) {
    console.error('Error fetching void requests:', error);
    return [];
  }
}
