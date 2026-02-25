import { cmsRequest, getTokenFromRequest, jsonResponse, errorResponse } from '$lib/server/cms';
import type { RequestHandler } from './$types';

// GET /api/bridge/users/[id] - Get public user profile
export const GET: RequestHandler = async ({ params, url, request }) => {
  try {
    const token = getTokenFromRequest(request);
    const queryParams = new URLSearchParams();

    // Forward query parameters (for depth, etc.)
    url.searchParams.forEach((value, key) => {
      queryParams.append(key, value);
    });

    const queryString = queryParams.toString();
    const endpoint = `/api/users/${params.id}${queryString ? `?${queryString}` : ''}`;

    const response = await cmsRequest(endpoint, {
      token: token || undefined,
    });

    if (!response.ok) {
      return errorResponse('User not found', 404);
    }

    const user = await response.json();

    // Return only public information (exclude email, phone, etc.)
    const publicProfile: Record<string, any> = {
      id: user.id,
      name: user.censorName ? censorUserName(user.name) : user.name,
      censorName: user.censorName || false,
      role: user.role,
      currency: user.currency,
      createdAt: user.createdAt,
    };

    // Include profile picture if it exists
    if (user.profilePicture) {
      publicProfile.profilePicture = typeof user.profilePicture === 'object'
        ? { id: user.profilePicture.id, url: user.profilePicture.url, filename: user.profilePicture.filename }
        : user.profilePicture;
    }

    return jsonResponse(publicProfile);
  } catch (error: any) {
    console.error('Bridge user profile GET error:', error);
    return errorResponse(error.message);
  }
};

// Helper function to censor user name
function censorUserName(name: string): string {
  if (!name) return 'User ***';
  const parts = name.split(' ');
  return parts.map(part => {
    if (part.length <= 2) return part[0] + '*';
    return part[0] + '*'.repeat(part.length - 1);
  }).join(' ');
}
