import { cmsRequest, getTokenFromRequest, jsonResponse, errorResponse } from '$lib/server/cms';
import type { RequestHandler } from './$types';

// GET /api/bridge/ratings/[id] - Get single rating
export const GET: RequestHandler = async ({ params, url, request }) => {
  try {
    const token = getTokenFromRequest(request);
    const queryParams = new URLSearchParams();

    // Forward query parameters (for depth, etc.)
    url.searchParams.forEach((value, key) => {
      queryParams.append(key, value);
    });

    const queryString = queryParams.toString();
    const endpoint = `/api/ratings/${params.id}${queryString ? `?${queryString}` : ''}`;

    const response = await cmsRequest(endpoint, {
      token: token || undefined,
    });
    const data = await response.json();

    return jsonResponse(data, response.status);
  } catch (error: any) {
    console.error('Bridge rating GET error:', error);
    return errorResponse(error.message);
  }
};

// PATCH /api/bridge/ratings/[id] - Update rating (add follow-up)
export const PATCH: RequestHandler = async ({ params, request }) => {
  try {
    const token = getTokenFromRequest(request);
    if (!token) {
      return errorResponse('Unauthorized', 401);
    }

    const body = await request.json();

    const response = await cmsRequest(`/api/ratings/${params.id}`, {
      method: 'PATCH',
      body,
      token,
    });

    const data = await response.json();
    return jsonResponse(data, response.status);
  } catch (error: any) {
    console.error('Bridge rating PATCH error:', error);
    return errorResponse(error.message);
  }
};
