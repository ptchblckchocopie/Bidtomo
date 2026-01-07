import { getTokenFromRequest, jsonResponse, errorResponse, CMS_URL } from '$lib/server/cms';
import type { RequestHandler } from './$types';

// POST /api/bridge/media - Upload media (forwards multipart form data)
export const POST: RequestHandler = async ({ request }) => {
  try {
    const token = getTokenFromRequest(request);
    if (!token) {
      return errorResponse('Unauthorized', 401);
    }

    // Get the content type to preserve multipart boundary
    const contentType = request.headers.get('Content-Type');

    // Forward the request body as-is (it's already FormData/multipart)
    const body = await request.arrayBuffer();

    const response = await fetch(`${CMS_URL}/api/media`, {
      method: 'POST',
      headers: {
        'Authorization': `JWT ${token}`,
        ...(contentType ? { 'Content-Type': contentType } : {}),
      },
      body,
    });

    const data = await response.json();
    return jsonResponse(data, response.status);
  } catch (error: any) {
    console.error('Bridge media upload error:', error);
    return errorResponse(error.message);
  }
};
