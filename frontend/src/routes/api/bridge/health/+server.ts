import { cmsRequest, jsonResponse } from '$lib/server/cms';
import type { RequestHandler } from './$types';

// GET /api/bridge/health - Check if CMS backend is reachable
export const GET: RequestHandler = async () => {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const response = await cmsRequest('/api/health');
    clearTimeout(timeout);

    if (!response.ok) {
      return jsonResponse({ status: 'down' }, 503);
    }

    const data = await response.json();
    return jsonResponse(data);
  } catch {
    return jsonResponse({ status: 'down' }, 503);
  }
};
