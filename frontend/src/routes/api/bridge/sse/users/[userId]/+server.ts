import { env } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';
import type { RequestHandler } from './$types';

const SSE_URL = env.SSE_URL || publicEnv.PUBLIC_SSE_URL?.replace('/sse', '') || 'http://localhost:3002';

// GET /api/bridge/sse/users/:userId — Proxy SSE with httpOnly cookie auth
export const GET: RequestHandler = async ({ params, cookies }) => {
  const token = cookies.get('auth_token');
  if (!token) {
    return new Response(JSON.stringify({ error: 'Authentication required' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { userId } = params;
  const upstreamUrl = `${SSE_URL}/events/users/${userId}?token=${encodeURIComponent(token)}`;

  try {
    const upstream = await fetch(upstreamUrl, {
      headers: { Accept: 'text/event-stream' },
    });

    if (!upstream.ok) {
      return new Response(JSON.stringify({ error: 'SSE connection failed' }), {
        status: upstream.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Stream the SSE response back to the client
    return new Response(upstream.body, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (error) {
    console.error('SSE bridge proxy error:', error);
    return new Response(JSON.stringify({ error: 'SSE service unavailable' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
