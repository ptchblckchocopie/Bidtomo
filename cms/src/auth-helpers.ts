// Lazily compute the hashed secret to avoid importing crypto at module level
// (Webpack bundles this file for the admin panel where Node crypto is unavailable)
let _payloadJwtSecret = '';
function getPayloadJwtSecret(): string {
  if (!_payloadJwtSecret) {
    const crypto = require('crypto');
    _payloadJwtSecret = crypto.createHash('sha256').update(process.env.PAYLOAD_SECRET!).digest('hex').slice(0, 32);
  }
  return _payloadJwtSecret;
}

export async function authenticateJWT(req: any): Promise<any | null> {
  const jwt = require('jsonwebtoken');
  // If already authenticated via cookie, return existing user
  if (req.user) {
    return req.user;
  }

  // Check for JWT in Authorization header
  const authHeader = req.headers?.authorization;
  if (!authHeader || (!authHeader.startsWith('JWT ') && !authHeader.startsWith('Bearer '))) {
    return null;
  }

  const token = authHeader.startsWith('JWT ') ? authHeader.substring(4) : authHeader.substring(7);

  try {
    // Payload v2 hashes the secret with SHA-256 before signing JWTs
    const decoded: any = jwt.verify(token, getPayloadJwtSecret());

    // Fetch user from database
    if (decoded.id) {
      const user = await req.payload.findByID({
        collection: 'users',
        id: decoded.id,
      });

      // Set req.user so hooks can access it
      req.user = user as any;
      return user;
    }
  } catch (error: any) {
    // Don't log error details — could contain token fragments
  }

  return null;
}
