import { cmsRequest, getTokenFromRequest, jsonResponse } from '$lib/server/cms';
import type { RequestHandler } from './$types';

// POST /api/bridge/analytics/track - Send analytics events to CMS
// Token is optional (anonymous page views allowed)
export const POST: RequestHandler = async ({ request }) => {
  try {
    const token = getTokenFromRequest(request);
    const body = await request.json();

    await cmsRequest('/api/analytics/track', {
      method: 'POST',
      body,
      token: token || undefined,
    });

    return jsonResponse({ success: true });
  } catch {
    // Always return success — analytics should never fail visibly
    return jsonResponse({ success: true });
  }
};
