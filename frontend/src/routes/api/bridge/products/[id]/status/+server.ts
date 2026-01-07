import { cmsRequest, jsonResponse, errorResponse } from '$lib/server/cms';
import type { RequestHandler } from './$types';

// GET /api/bridge/products/[id]/status - Get product status (for SSE fallback polling)
export const GET: RequestHandler = async ({ params }) => {
  try {
    const response = await cmsRequest(`/api/products/${params.id}/status`);
    const data = await response.json();

    return jsonResponse(data, response.status);
  } catch (error: any) {
    console.error('Bridge product status error:', error);
    return errorResponse(error.message);
  }
};
