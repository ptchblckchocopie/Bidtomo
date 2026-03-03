import { cmsRequest, getTokenFromRequest, jsonResponse, errorResponse } from '$lib/server/cms';
import type { RequestHandler } from './$types';

// PATCH /api/bridge/reports/[id] - Update report (admin only)
export const PATCH: RequestHandler = async ({ params, request }) => {
  try {
    const token = getTokenFromRequest(request);
    if (!token) {
      return errorResponse('Unauthorized', 401);
    }

    const body = await request.json();

    const response = await cmsRequest(`/api/reports/${params.id}`, {
      method: 'PATCH',
      body,
      token,
    });

    const data = await response.json();
    return jsonResponse(data, response.status);
  } catch (error: any) {
    console.error('Bridge report PATCH error:', error);
    return errorResponse(error.message);
  }
};
