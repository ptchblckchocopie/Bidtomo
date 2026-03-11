import { cmsRequest, getTokenFromRequest, jsonResponse } from '$lib/server/cms';
import type { RequestHandler } from './$types';

// GET /api/bridge/maintenance - Get current maintenance status (public)
// Returns { enabled, scheduledAt, message, available } — available=false means CMS endpoint missing (mid-deploy)
export const GET: RequestHandler = async () => {
  try {
    const response = await cmsRequest('/api/maintenance');
    if (!response.ok) {
      // CMS returned 404 or error — endpoint not deployed yet
      return jsonResponse({ enabled: false, scheduledAt: null, message: '', available: false });
    }
    const data = await response.json();
    return jsonResponse({ ...data, available: true });
  } catch {
    // CMS unreachable
    return jsonResponse({ enabled: false, scheduledAt: null, message: '', available: false });
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
