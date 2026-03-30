import { BRIDGE_URL, getAuthHeaders, handleExpiredToken, extractErrorMessage } from './_shared';
import type { Report } from './types';

export async function reportProduct(
  productId: string,
  reason: string,
  description?: string
): Promise<boolean> {
  try {
    const response = await fetch(`${BRIDGE_URL}/api/bridge/reports`, {
      method: 'POST',
      headers: getAuthHeaders(),
      credentials: 'include',
      body: JSON.stringify({ productId, reason, description }),
    });

    if (response.status === 401) {
      handleExpiredToken();
      return false;
    }

    if (!response.ok) {
      const msg = await extractErrorMessage(response, 'Failed to submit report');
      throw new Error(msg);
    }

    return true;
  } catch (error) {
    console.error('Error reporting product:', error);
    throw error;
  }
}

export async function fetchReports(params?: {
  status?: string;
  page?: number;
  limit?: number;
  sort?: string;
}): Promise<{ docs: Report[]; totalDocs: number; totalPages: number; page: number }> {
  const searchParams = new URLSearchParams();
  searchParams.set('depth', '1');
  if (params?.status) searchParams.set('where[status][equals]', params.status);
  if (params?.page) searchParams.set('page', String(params.page));
  if (params?.limit) searchParams.set('limit', String(params.limit));
  if (params?.sort) searchParams.set('sort', params.sort);

  const response = await fetch(`${BRIDGE_URL}/api/bridge/reports?${searchParams.toString()}`, {
    headers: getAuthHeaders(),
    credentials: 'include',
  });

  if (response.status === 401) {
    handleExpiredToken();
    throw new Error('Unauthorized');
  }

  if (!response.ok) {
    throw new Error('Failed to fetch reports');
  }

  return response.json();
}

export async function updateReport(
  id: string,
  data: { status?: string; adminNotes?: string }
): Promise<Report> {
  const response = await fetch(`${BRIDGE_URL}/api/bridge/reports/${id}`, {
    method: 'PATCH',
    headers: getAuthHeaders(),
    credentials: 'include',
    body: JSON.stringify(data),
  });

  if (response.status === 401) {
    handleExpiredToken();
    throw new Error('Unauthorized');
  }

  if (!response.ok) {
    const msg = await extractErrorMessage(response, 'Failed to update report');
    throw new Error(msg);
  }

  const result = await response.json();
  return result.doc;
}
