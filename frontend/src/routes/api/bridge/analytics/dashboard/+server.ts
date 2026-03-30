import { cmsRequest, getTokenFromRequest, jsonResponse, errorResponse } from '$lib/server/cms';
import type { RequestHandler } from './$types';

// GET /api/bridge/analytics/dashboard - Proxy analytics dashboard data from CMS
export const GET: RequestHandler = async ({ request, url, cookies }) => {
  try {
    const token = getTokenFromRequest(request, cookies);
    if (!token) {
      return errorResponse('Unauthorized', 401);
    }

    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);

    const qs = params.toString();
    const path = `/api/analytics/dashboard${qs ? `?${qs}` : ''}`;

    const response = await cmsRequest(path, { token });
    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: 'Failed to fetch analytics' }));
      return jsonResponse(err, response.status);
    }
    const data = await response.json();
    return jsonResponse(data);
  } catch (error: any) {
    return errorResponse(error?.message || 'Failed to fetch analytics');
  }
};
