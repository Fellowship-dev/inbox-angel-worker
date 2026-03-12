// Simple API key auth for Cloudflare Workers.
// Session-based auth (dashboard login) resolves session tokens to API keys
// in the router before calling requireAuth().

export class AuthError extends Error {
  constructor(
    message: string,
    public readonly status: 401 | 403 = 401,
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

export interface AuthContext {
  userId: string;
}

export interface AuthEnv {
  API_KEY?: string;
}

/**
 * Verifies the caller's identity via X-Api-Key header.
 * Returns { userId } on success; throws AuthError on failure.
 */
export async function requireAuth(request: Request, env: AuthEnv): Promise<AuthContext> {
  const apiKey = request.headers.get('x-api-key');
  if (!apiKey || !env.API_KEY || apiKey !== env.API_KEY) {
    throw new AuthError('Unauthorized — provide X-Api-Key header');
  }
  return { userId: apiKey };
}
