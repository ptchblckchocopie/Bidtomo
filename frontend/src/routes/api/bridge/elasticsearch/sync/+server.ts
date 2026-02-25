import { cmsRequest, getTokenFromRequest, jsonResponse, errorResponse } from '$lib/server/cms';
import type { RequestHandler } from './$types';

// POST /api/bridge/elasticsearch/sync - Trigger bulk ES sync (admin only)
export const POST: RequestHandler = async ({ request }) => {
  try {
    const token = getTokenFromRequest(request);
    if (!token) {
      return errorResponse('Unauthorized', 401);
    }

    const response = await cmsRequest('/api/elasticsearch/sync', {
      method: 'POST',
      token,
    });

    const data = await response.json();
    return jsonResponse(data, response.status);
  } catch (error: any) {
    console.error('Bridge ES sync error:', error);
    return errorResponse(error.message);
  }
};
