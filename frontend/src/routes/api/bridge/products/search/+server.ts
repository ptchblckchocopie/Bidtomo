import { cmsRequest, getTokenFromRequest, jsonResponse, errorResponse } from '$lib/server/cms';
import type { RequestHandler } from './$types';

// GET /api/bridge/products/search?q=...&status=...&region=...&city=...&page=...&limit=...
export const GET: RequestHandler = async ({ url, request }) => {
  try {
    const token = getTokenFromRequest(request);

    // Forward all query params to the CMS search endpoint
    const queryParams = new URLSearchParams();
    for (const [key, value] of url.searchParams.entries()) {
      queryParams.append(key, value);
    }

    const endpoint = `/api/products/search?${queryParams.toString()}`;
    const response = await cmsRequest(endpoint, {
      token: token || undefined,
    });

    if (!response.ok) {
      return errorResponse('Search failed', response.status);
    }

    const data = await response.json();
    return jsonResponse(data);
  } catch (error: any) {
    console.error('Bridge product search error:', error);
    return errorResponse(error.message);
  }
};
