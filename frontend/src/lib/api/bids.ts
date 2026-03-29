import { BRIDGE_URL, getAuthHeaders, extractErrorMessage } from './_shared';
import * as Sentry from '@sentry/sveltekit';
import type { Bid } from './types';

export async function placeBid(productId: string, amount: number, censorName: boolean = false): Promise<Bid | null> {
  try {
    const response = await fetch(`${BRIDGE_URL}/api/bridge/bids`, {
      method: 'POST',
      headers: getAuthHeaders(),
      credentials: 'include',
      body: JSON.stringify({
        product: productId,
        amount,
        censorName,
      }),
    });

    if (!response.ok) {
      const msg = await extractErrorMessage(response, 'Failed to place bid');
      console.error('Bid failed:', response.status, msg);
      throw new Error(msg);
    }

    const data = await response.json();
    Sentry.addBreadcrumb({ category: 'auction', message: 'Bid placed', level: 'info', data: { productId, amount } });
    return data.doc || data;
  } catch (error) {
    console.error('Error placing bid:', error);
    return null;
  }
}

export async function fetchProductBids(productId: string, customFetch?: typeof fetch): Promise<Bid[]> {
  try {
    const fetchFn = customFetch || fetch;
    const response = await fetchFn(`${BRIDGE_URL}/api/bridge/product-bids/${productId}`, {
      headers: getAuthHeaders(),
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error('Failed to fetch bids');
    }

    const data = await response.json();
    return data.docs || [];
  } catch (error) {
    console.error('Error fetching bids:', error);
    return [];
  }
}
