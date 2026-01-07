import { cmsRequest, getTokenFromRequest, jsonResponse, errorResponse } from '$lib/server/cms';
import type { RequestHandler } from './$types';

// GET /api/bridge/ratings - List ratings
export const GET: RequestHandler = async ({ url, request }) => {
  try {
    const token = getTokenFromRequest(request);
    const params = new URLSearchParams();

    // Forward query parameters
    url.searchParams.forEach((value, key) => {
      params.append(key, value);
    });

    const response = await cmsRequest(`/api/ratings?${params.toString()}`, {
      token: token || undefined,
    });
    const data = await response.json();

    return jsonResponse(data, response.status);
  } catch (error: any) {
    console.error('Bridge ratings GET error:', error);
    return errorResponse(error.message);
  }
};

// POST /api/bridge/ratings - Create rating
export const POST: RequestHandler = async ({ request }) => {
  try {
    const token = getTokenFromRequest(request);
    if (!token) {
      return errorResponse('Unauthorized', 401);
    }

    const body = await request.json();

    const response = await cmsRequest('/api/ratings', {
      method: 'POST',
      body,
      token,
    });

    const data = await response.json();
    return jsonResponse(data, response.status);
  } catch (error: any) {
    console.error('Bridge ratings POST error:', error);
    return errorResponse(error.message);
  }
};
