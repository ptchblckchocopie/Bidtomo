import { BRIDGE_URL, getAuthHeaders } from './_shared';
import type { Product, Transaction } from './types';

export async function fetchMyTransactions(): Promise<Transaction[]> {
  try {
    const response = await fetch(`${BRIDGE_URL}/api/bridge/transactions?limit=100&sort=-createdAt`, {
      headers: getAuthHeaders(),
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error('Failed to fetch transactions');
    }

    const data = await response.json();
    return data.docs || [];
  } catch (error) {
    console.error('Error fetching transactions:', error);
    return [];
  }
}

export async function updateTransactionStatus(
  transactionId: string,
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled',
  notes?: string
): Promise<Transaction | null> {
  try {
    const response = await fetch(`${BRIDGE_URL}/api/bridge/transactions/${transactionId}`, {
      method: 'PATCH',
      headers: getAuthHeaders(),
      credentials: 'include',
      body: JSON.stringify({ status, ...(notes && { notes }) }),
    });

    if (!response.ok) {
      throw new Error('Failed to update transaction');
    }

    return await response.json();
  } catch (error) {
    console.error('Error updating transaction:', error);
    return null;
  }
}

export async function fetchTransactionForProduct(productId: string): Promise<Transaction | null> {
  try {
    const response = await fetch(
      `${BRIDGE_URL}/api/bridge/transactions?where[product][equals]=${productId}&depth=1`,
      {
        headers: getAuthHeaders(),
        credentials: 'include',
      }
    );

    if (!response.ok) {
      throw new Error('Failed to fetch transaction');
    }

    const data = await response.json();
    return data.docs?.[0] || null;
  } catch (error) {
    console.error('Error fetching transaction:', error);
    return null;
  }
}

export async function fetchMyPurchases(): Promise<Product[]> {
  try {
    const response = await fetch(`${BRIDGE_URL}/api/bridge/transactions?depth=2&limit=100`, {
      headers: getAuthHeaders(),
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error('Failed to fetch purchases');
    }

    const data = await response.json();
    const transactions = data.docs || [];

    const { getCurrentUser } = await import('./auth');
    const currentUser = await getCurrentUser();
    if (!currentUser) return [];

    return transactions
      .filter((tx: any) => {
        const buyerId = typeof tx.buyer === 'object' ? tx.buyer?.id : tx.buyer;
        return buyerId === currentUser.id;
      })
      .map((tx: any) => tx.product)
      .filter((p: any) => p && typeof p === 'object');
  } catch (error) {
    console.error('Error fetching purchases:', error);
    return [];
  }
}
