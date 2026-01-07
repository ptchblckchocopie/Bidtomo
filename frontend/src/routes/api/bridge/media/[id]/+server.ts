import { cmsRequest, getTokenFromRequest, jsonResponse, errorResponse } from '$lib/server/cms';
import type { RequestHandler } from './$types';

// GET /api/bridge/media/[id] - Get media info
export const GET: RequestHandler = async ({ params }) => {
  try {
    const response = await cmsRequest(`/api/media/${params.id}`);
    const data = await response.json();

    return jsonResponse(data, response.status);
  } catch (error: any) {
    console.error('Bridge media GET error:', error);
    return errorResponse(error.message);
  }
};

// DELETE /api/bridge/media/[id] - Delete media
export const DELETE: RequestHandler = async ({ params, request }) => {
  try {
    const token = getTokenFromRequest(request);
    if (!token) {
      return errorResponse('Unauthorized', 401);
    }

    const response = await cmsRequest(`/api/media/${params.id}`, {
      method: 'DELETE',
      token,
    });

    const data = await response.json();
    return jsonResponse(data, response.status);
  } catch (error: any) {
    console.error('Bridge media DELETE error:', error);
    return errorResponse(error.message);
  }
};
