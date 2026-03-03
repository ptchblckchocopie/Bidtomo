import { cmsRequest, getTokenFromRequest, jsonResponse, errorResponse } from '$lib/server/cms';
import type { RequestHandler } from './$types';

// DELETE /api/bridge/watchlist/[id] - Remove from watchlist
export const DELETE: RequestHandler = async ({ params, request }) => {
  try {
    const token = getTokenFromRequest(request);
    if (!token) {
      return errorResponse('Unauthorized', 401);
    }

    const response = await cmsRequest(`/api/watchlist/${params.id}`, {
      method: 'DELETE',
      token,
    });

    const data = await response.json();
    return jsonResponse(data, response.status);
  } catch (error: any) {
    console.error('Bridge watchlist DELETE error:', error);
    return errorResponse(error.message);
  }
};
