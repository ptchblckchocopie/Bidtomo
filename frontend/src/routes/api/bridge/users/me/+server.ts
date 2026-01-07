import { cmsRequest, getTokenFromRequest, jsonResponse, errorResponse } from '$lib/server/cms';
import type { RequestHandler } from './$types';

// GET /api/bridge/users/me
export const GET: RequestHandler = async ({ request }) => {
  try {
    const token = getTokenFromRequest(request);
    if (!token) {
      return errorResponse('Unauthorized', 401);
    }

    const response = await cmsRequest('/api/users/me', {
      token,
    });

    const data = await response.json();
    return jsonResponse(data, response.status);
  } catch (error: any) {
    console.error('Bridge me error:', error);
    return errorResponse('Unauthorized', 401);
  }
};

// PATCH /api/bridge/users/me - Update current user profile
export const PATCH: RequestHandler = async ({ request }) => {
  try {
    const token = getTokenFromRequest(request);
    if (!token) {
      return errorResponse('Unauthorized', 401);
    }

    // First get the current user to get their ID
    const meResponse = await cmsRequest('/api/users/me', { token });
    if (!meResponse.ok) {
      return errorResponse('Unauthorized', 401);
    }
    const currentUser = await meResponse.json();

    // Get the update data from request body
    const body = await request.json();

    // Only allow updating specific fields
    const allowedFields = ['name', 'countryCode', 'phoneNumber', 'currency'];
    const updateData: Record<string, any> = {};
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field];
      }
    }

    // Update the user via PayloadCMS API
    const response = await cmsRequest(`/api/users/${currentUser.user.id}`, {
      method: 'PATCH',
      token,
      body: updateData,
    });

    const data = await response.json();
    return jsonResponse(data, response.status);
  } catch (error: any) {
    console.error('Bridge update user error:', error);
    return errorResponse('Failed to update profile', 500);
  }
};
