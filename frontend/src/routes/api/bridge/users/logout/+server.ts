import { cmsRequest, getTokenFromRequest, jsonResponse, errorResponse } from '$lib/server/cms';
import type { RequestHandler } from './$types';

// POST /api/bridge/users/logout
export const POST: RequestHandler = async ({ request }) => {
  try {
    const token = getTokenFromRequest(request);

    const response = await cmsRequest('/api/users/logout', {
      method: 'POST',
      token: token || undefined,
    });

    return jsonResponse({ success: true });
  } catch (error: any) {
    console.error('Bridge logout error:', error);
    return errorResponse(error.message);
  }
};
