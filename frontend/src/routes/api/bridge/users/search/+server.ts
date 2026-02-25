import { cmsRequest, getTokenFromRequest, jsonResponse, errorResponse } from '$lib/server/cms';
import type { RequestHandler } from './$types';

// GET /api/bridge/users/search?search=...&page=1&limit=12
export const GET: RequestHandler = async ({ url, request }) => {
  try {
    const token = getTokenFromRequest(request);
    const search = url.searchParams.get('search') || '';
    const page = url.searchParams.get('page') || '1';
    const limit = url.searchParams.get('limit') || '12';

    if (!search.trim()) {
      return jsonResponse({ docs: [], totalDocs: 0, totalPages: 0, page: 1, limit: parseInt(limit) });
    }

    // Query Payload CMS users collection: search by name, exclude admins
    const queryParams = new URLSearchParams();
    queryParams.append('where[name][like]', search);
    queryParams.append('where[role][not_equals]', 'admin');
    queryParams.append('limit', limit);
    queryParams.append('page', page);
    queryParams.append('sort', 'name');
    queryParams.append('depth', '1');

    const endpoint = `/api/users?${queryParams.toString()}`;
    const response = await cmsRequest(endpoint, {
      token: token || undefined,
    });

    if (!response.ok) {
      return errorResponse('Failed to search users', response.status);
    }

    const data = await response.json();

    // Map to public-safe profiles
    const docs = (data.docs || []).map((user: any) => ({
      id: user.id,
      name: user.censorName ? censorUserName(user.name) : user.name,
      censorName: user.censorName || false,
      role: user.role,
      currency: user.currency,
      createdAt: user.createdAt,
      profilePicture: user.profilePicture && typeof user.profilePicture === 'object'
        ? { id: user.profilePicture.id, url: user.profilePicture.url, filename: user.profilePicture.filename }
        : undefined,
    }));

    return jsonResponse({
      docs,
      totalDocs: data.totalDocs || 0,
      totalPages: data.totalPages || 0,
      page: data.page || 1,
      limit: data.limit || parseInt(limit),
    });
  } catch (error: any) {
    console.error('Bridge user search error:', error);
    return errorResponse(error.message);
  }
};

function censorUserName(name: string): string {
  if (!name) return 'User ***';
  const parts = name.split(' ');
  return parts.map(part => {
    if (part.length <= 2) return part[0] + '*';
    return part[0] + '*'.repeat(part.length - 1);
  }).join(' ');
}
