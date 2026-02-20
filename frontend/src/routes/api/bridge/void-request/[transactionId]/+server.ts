import { cmsRequest, getTokenFromRequest, jsonResponse, errorResponse } from '$lib/server/cms';
import type { RequestHandler } from './$types';

// GET /api/bridge/void-request/[transactionId] - Get void requests for a transaction
export const GET: RequestHandler = async ({ params, request }) => {
  try {
    const token = getTokenFromRequest(request);
    if (!token) {
      return errorResponse('Unauthorized', 401);
    }

    const { transactionId } = params;

    const response = await cmsRequest(`/api/void-request/${transactionId}`, {
      token,
    });

    const data = await response.json();
    return jsonResponse(data, response.status);
  } catch (error: any) {
    console.error('Bridge void-request GET error:', error);
    return errorResponse(error.message);
  }
};
