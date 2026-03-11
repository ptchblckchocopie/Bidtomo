import { cmsRequest, getTokenFromRequest, jsonResponse } from '$lib/server/cms';
import type { RequestHandler } from './$types';

// GET /api/bridge/maintenance - Get current maintenance status (public)
export const GET: RequestHandler = async () => {
  try {
    const response = await cmsRequest('/api/maintenance');
    if (!response.ok) {
      return jsonResponse({ enabled: false, scheduledAt: null, message: '' });
    }
    const data = await response.json();
    return jsonResponse(data);
  } catch {
    return jsonResponse({ enabled: false, scheduledAt: null, message: '' });
  }
};

// POST /api/bridge/maintenance - Toggle maintenance mode (admin-only)
export const POST: RequestHandler = async ({ request }) => {
  try {
    const token = getTokenFromRequest(request);
    if (!token) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    const body = await request.json();
    const response = await cmsRequest('/api/maintenance', {
      method: 'POST',
      token,
      body,
    });

    const data = await response.json();
    return jsonResponse(data, response.status);
  } catch (error: any) {
    return jsonResponse({ error: error?.message || 'Failed to update maintenance' }, 500);
  }
};
