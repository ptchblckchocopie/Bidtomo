import { Router } from 'express';
import jwt from 'jsonwebtoken';
import type { Payload } from 'payload';
import { getPayloadJwtSecret } from '../middleware/requireAuth';

interface AdminDeps {
  payload: Payload;
  payloadReady: () => boolean;
}

export function createAdminRouter({ payload, payloadReady }: AdminDeps): Router {
  const router = Router();

  const FROG_VIDEO_URL = `${process.env.SUPABASE_URL || 'https://htcdkqplcmdbyjlvzono.supabase.co'}/storage/v1/object/public/${process.env.S3_BUCKET || 'bidmo-media'}/bidmoto/frog.mp4`;

  router.get('/admin/access-denied', (req, res) => {
    res.clearCookie('payload-token');
    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Access Denied - Bidmo.to CMS</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { display: flex; align-items: center; justify-content: center; min-height: 100vh; background: #000; overflow: hidden; }
    .overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; z-index: 10; }
    video { max-width: 80vw; max-height: 80vh; border-radius: 12px; box-shadow: 0 0 80px rgba(0,0,0,0.8); }
    .text-overlay { position: fixed; bottom: 2rem; left: 50%; transform: translateX(-50%); text-align: center; z-index: 20; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    .text-overlay h1 { font-size: 1.3rem; color: #fff; margin-bottom: 0.5rem; text-shadow: 0 2px 8px rgba(0,0,0,0.8); }
    .text-overlay p { font-size: 0.85rem; color: rgba(255,255,255,0.6); text-shadow: 0 1px 4px rgba(0,0,0,0.8); }
  </style>
</head>
<body>
  <div class="overlay">
    <video autoplay loop muted playsinline>
      <source src="${FROG_VIDEO_URL}" type="video/mp4">
    </video>
  </div>
  <div class="text-overlay">
    <h1>Access Denied</h1>
    <p>Only admin accounts can access this panel.</p>
  </div>
</body>
</html>`);
  });

  // Guard: auto-logout non-admin users from admin panel
  router.use('/admin', async (req, res, next) => {
    if (!payloadReady()) return next();

    // Only check HTML page loads, skip assets and API calls
    const accept = req.headers.accept || '';
    if (!accept.includes('text/html')) return next();
    if (req.path === '/access-denied') return next();

    // Parse payload-token from cookie header
    const cookies = req.headers.cookie || '';
    const tokenMatch = cookies.match(/payload-token=([^;]+)/);
    if (!tokenMatch) return next();

    try {
      const token = decodeURIComponent(tokenMatch[1]);
      const decoded = jwt.verify(token, getPayloadJwtSecret()) as any;

      if (decoded?.id) {
        const user = await payload.findByID({
          collection: 'users',
          id: decoded.id,
        });

        if (user && user.role !== 'admin') {
          return res.redirect('/admin/access-denied');
        }
      }
    } catch {
      // Invalid or expired token — clear it
      res.clearCookie('payload-token');
      return res.redirect('/admin');
    }

    next();
  });

  return router;
}
