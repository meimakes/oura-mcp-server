import { Request, Response, NextFunction } from 'express';

/**
 * Middleware to authenticate MCP requests using API key
 */
export function authenticateMCP(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    res.status(401).json({
      error: {
        code: -32000,
        message: 'Unauthorized',
        data: {
          details: 'Missing Authorization header',
        },
      },
    });
    return;
  }

  const [bearer, token] = authHeader.split(' ');

  if (bearer !== 'Bearer' || !token) {
    res.status(401).json({
      error: {
        code: -32000,
        message: 'Unauthorized',
        data: {
          details: 'Invalid Authorization header format. Expected: Bearer <token>',
        },
      },
    });
    return;
  }

  const authToken = process.env.AUTH_TOKEN;

  if (!authToken) {
    console.error('[Auth] AUTH_TOKEN not configured in environment');
    res.status(500).json({
      error: {
        code: -32603,
        message: 'Internal server error',
        data: {
          details: 'Server authentication not configured',
        },
      },
    });
    return;
  }

  if (token !== authToken) {
    console.warn('[Auth] Invalid API key attempt');
    res.status(401).json({
      error: {
        code: -32000,
        message: 'Unauthorized',
        data: {
          details: 'Invalid API key',
        },
      },
    });
    return;
  }

  // Authentication successful
  next();
}

/**
 * Optional authentication middleware (allows unauthenticated requests)
 */
export function optionalAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    // No auth provided, continue without authentication
    next();
    return;
  }

  // If auth is provided, validate it
  authenticateMCP(req, res, next);
}
