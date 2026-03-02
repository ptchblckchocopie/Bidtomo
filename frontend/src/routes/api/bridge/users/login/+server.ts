import { cmsRequest, jsonResponse, errorResponse } from '$lib/server/cms';
import type { RequestHandler } from './$types';

// POST /api/bridge/users/login
export const POST: RequestHandler = async ({ request, cookies }) => {
  try {
    const body = await request.json();

    const response = await cmsRequest('/api/users/login', {
      method: 'POST',
      body,
    });

    const data = await response.json();

    // Set httpOnly cookie with the JWT token (not accessible to client-side JS)
    if (response.ok && data.token) {
      cookies.set('auth_token', data.token, {
        httpOnly: true,
        secure: true,
        sameSite: 'strict',
        path: '/',
        maxAge: 60 * 60 * 24 * 30, // 30 days
      });
    }

    return jsonResponse(data, response.status);
  } catch (error: any) {
    console.error('Bridge login error:', error);
    return errorResponse('Invalid email or password', 401);
  }
};
