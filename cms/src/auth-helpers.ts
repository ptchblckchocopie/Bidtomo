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
    const secret = process.env.PAYLOAD_SECRET!;

    // Verify and decode JWT
    const decoded: any = jwt.verify(token, secret);
    console.log('JWT verified, user ID:', decoded.id);

    // Fetch user from database
    if (decoded.id) {
      const user = await req.payload.findByID({
        collection: 'users',
        id: decoded.id,
      });

      // Set req.user so hooks can access it
      req.user = user as any;
      console.log('JWT auth successful for user:', user.email);
      return user;
    }
  } catch (error: any) {
    console.error('JWT verification failed:', error.message);
  }

  return null;
}
