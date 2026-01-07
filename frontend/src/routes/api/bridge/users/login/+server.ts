import { cmsRequest, jsonResponse, errorResponse } from '$lib/server/cms';
import type { RequestHandler } from './$types';

// POST /api/bridge/users/login
export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();

    const response = await cmsRequest('/api/users/login', {
      method: 'POST',
      body,
    });

    const data = await response.json();
    return jsonResponse(data, response.status);
  } catch (error: any) {
    console.error('Bridge login error:', error);
    return errorResponse('Invalid email or password', 401);
  }
};
