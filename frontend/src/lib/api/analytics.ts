import { BRIDGE_URL, getAuthHeaders, handleExpiredToken, extractErrorMessage } from './_shared';
import type { AnalyticsDashboard } from './types';

export async function fetchAnalyticsDashboard(params?: {
  from?: string;
  to?: string;
}): Promise<AnalyticsDashboard> {
  const searchParams = new URLSearchParams();
  if (params?.from) searchParams.set('from', params.from);
  if (params?.to) searchParams.set('to', params.to);

  const qs = searchParams.toString();
  const url = `${BRIDGE_URL}/api/bridge/analytics/dashboard${qs ? `?${qs}` : ''}`;

  const response = await fetch(url, {
    headers: getAuthHeaders(),
    credentials: 'include',
  });

  if (response.status === 401) {
    handleExpiredToken();
    throw new Error('Unauthorized');
  }

  if (!response.ok) {
    const msg = await extractErrorMessage(response, 'Failed to fetch analytics');
    throw new Error(msg);
  }

  return response.json();
}
