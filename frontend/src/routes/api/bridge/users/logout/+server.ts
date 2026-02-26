import { cmsRequest, getTokenFromRequest, jsonResponse, errorResponse } from '$lib/server/cms';
import type { RequestHandler } from './$types';

// POST /api/bridge/users/logout
export const POST: RequestHandler = async ({ request, cookies }) => {
  try {
    const token = getTokenFromRequest(request) || cookies.get('auth_token') || undefined;

    const response = await cmsRequest('/api/users/logout', {
      method: 'POST',
      token,
    });

    // Clear the httpOnly auth cookie
    cookies.delete('auth_token', { path: '/' });

    return jsonResponse({ success: true });
  } catch (error: any) {
    console.error('Bridge logout error:', error);
    return errorResponse(error.message);
  }
};
