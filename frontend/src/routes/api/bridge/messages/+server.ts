import { cmsRequest, getTokenFromRequest, jsonResponse, errorResponse, sanitizeQueryParams } from '$lib/server/cms';
import type { RequestHandler } from './$types';

// GET /api/bridge/messages - List messages
export const GET: RequestHandler = async ({ url, request }) => {
  try {
    const token = getTokenFromRequest(request);
    if (!token) {
      return errorResponse('Unauthorized', 401);
    }

    const params = sanitizeQueryParams(url.searchParams);

    const response = await cmsRequest(`/api/messages?${params.toString()}`, {
      token,
    });

    const data = await response.json();
    return jsonResponse(data, response.status);
  } catch (error: any) {
    console.error('Bridge messages GET error:', error);
    return errorResponse(error.message);
  }
};

// POST /api/bridge/messages - Send message
export const POST: RequestHandler = async ({ request }) => {
  try {
    const token = getTokenFromRequest(request);
    if (!token) {
      return errorResponse('Unauthorized', 401);
    }

    const body = await request.json();

    const response = await cmsRequest('/api/messages', {
      method: 'POST',
      body,
      token,
    });

    const data = await response.json();
    return jsonResponse(data, response.status);
  } catch (error: any) {
    console.error('Bridge messages POST error:', error);
    return errorResponse(error.message);
  }
};
