import { cmsRequest, getTokenFromRequest, jsonResponse, errorResponse } from '$lib/server/cms';
import type { RequestHandler } from './$types';

// GET /api/bridge/transactions/[id] - Get single transaction
export const GET: RequestHandler = async ({ params, request }) => {
  try {
    const token = getTokenFromRequest(request);
    if (!token) {
      return errorResponse('Unauthorized', 401);
    }

    const response = await cmsRequest(`/api/transactions/${params.id}`, {
      token,
    });

    const data = await response.json();
    return jsonResponse(data, response.status);
  } catch (error: any) {
    console.error('Bridge transaction GET error:', error);
    return errorResponse(error.message);
  }
};

// PATCH /api/bridge/transactions/[id] - Update transaction status
export const PATCH: RequestHandler = async ({ params, request }) => {
  try {
    const token = getTokenFromRequest(request);
    if (!token) {
      return errorResponse('Unauthorized', 401);
    }

    const body = await request.json();

    const response = await cmsRequest(`/api/transactions/${params.id}`, {
      method: 'PATCH',
      body,
      token,
    });

    const data = await response.json();
    return jsonResponse(data, response.status);
  } catch (error: any) {
    console.error('Bridge transaction PATCH error:', error);
    return errorResponse(error.message);
  }
};
