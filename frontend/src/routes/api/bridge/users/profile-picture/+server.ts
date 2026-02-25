import { cmsRequest, getTokenFromRequest, jsonResponse, errorResponse } from '$lib/server/cms';
import type { RequestHandler } from './$types';

// POST /api/bridge/users/profile-picture — Set profile picture (mediaId in JSON body)
export const POST: RequestHandler = async ({ request }) => {
  try {
    const token = getTokenFromRequest(request);
    if (!token) {
      return errorResponse('Unauthorized', 401);
    }

    const body = await request.json();

    const response = await cmsRequest('/api/users/profile-picture', {
      method: 'POST',
      token,
      body,
    });

    const data = await response.json();
    return jsonResponse(data, response.status);
  } catch (error: any) {
    console.error('Bridge profile picture error:', error);
    return errorResponse('Failed to update profile picture', 500);
  }
};

// DELETE /api/bridge/users/profile-picture — Remove profile picture
export const DELETE: RequestHandler = async ({ request }) => {
  try {
    const token = getTokenFromRequest(request);
    if (!token) {
      return errorResponse('Unauthorized', 401);
    }

    const response = await cmsRequest('/api/users/profile-picture', {
      method: 'DELETE',
      token,
    });

    const data = await response.json();
    return jsonResponse(data, response.status);
  } catch (error: any) {
    console.error('Bridge remove profile picture error:', error);
    return errorResponse('Failed to remove profile picture', 500);
  }
};
