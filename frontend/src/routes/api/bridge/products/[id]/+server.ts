import { cmsRequest, getTokenFromRequest, jsonResponse, errorResponse } from '$lib/server/cms';
import type { RequestHandler } from './$types';

// GET /api/bridge/products/[id] - Get single product
export const GET: RequestHandler = async ({ params, url, request }) => {
  try {
    const queryParams = new URLSearchParams();
    url.searchParams.forEach((value, key) => {
      queryParams.append(key, value);
    });

    const queryString = queryParams.toString();
    const endpoint = `/api/products/${params.id}${queryString ? `?${queryString}` : ''}`;

    // Forward auth token so CMS can evaluate access control for hidden products
    const token = getTokenFromRequest(request);
    const response = await cmsRequest(endpoint, {
      token: token || undefined,
    });
    const data = await response.json();

    return jsonResponse(data, response.status);
  } catch (error: any) {
    console.error('Bridge product GET error:', error);
    return errorResponse(error.message);
  }
};

// PATCH /api/bridge/products/[id] - Update product
export const PATCH: RequestHandler = async ({ params, request }) => {
  try {
    const token = getTokenFromRequest(request);
    if (!token) {
      return errorResponse('Unauthorized', 401);
    }

    const body = await request.json();

    const response = await cmsRequest(`/api/products/${params.id}`, {
      method: 'PATCH',
      body,
      token,
    });

    const data = await response.json();
    return jsonResponse(data, response.status);
  } catch (error: any) {
    console.error('Bridge product PATCH error:', error);
    return errorResponse(error.message);
  }
};
