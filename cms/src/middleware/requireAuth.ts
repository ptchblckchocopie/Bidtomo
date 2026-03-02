import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

// Payload v2 hashes the secret before signing JWTs:
//   crypto.createHash('sha256').update(secret).digest('hex').slice(0, 32)
// Lazily computed to avoid issues with module load order.
let _payloadJwtSecret = '';
export function getPayloadJwtSecret(): string {
  if (!_payloadJwtSecret) {
    const crypto = require('crypto');
    _payloadJwtSecret = crypto.createHash('sha256').update(process.env.PAYLOAD_SECRET!).digest('hex').slice(0, 32);
  }
  return _payloadJwtSecret;
}

/**
 * Express middleware that extracts userId from req.user (Payload) or JWT header.
 * Returns 401 if no user found. Sets (req as any).userId for downstream handlers.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  let userId: number | string | null = (req as any).user?.id || null;

  if (!userId) {
    const authHeader = req.headers.authorization;
    if (authHeader && (authHeader.startsWith('JWT ') || authHeader.startsWith('Bearer '))) {
      const token = authHeader.startsWith('JWT ') ? authHeader.substring(4) : authHeader.substring(7);
      try {
        const decoded = jwt.verify(token, getPayloadJwtSecret()) as any;
        if (decoded.id) userId = decoded.id;
      } catch (err: any) {
        console.error(`[Auth] JWT verify failed for ${req.method} ${req.path}:`, err.message);
      }
    }
  }

  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  (req as any).userId = userId;
  next();
}
