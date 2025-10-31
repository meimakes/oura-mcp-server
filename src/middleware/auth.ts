import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger.js';
import { auditLog, AuditEventType, getClientIP } from '../utils/audit.js';

/**
 * Middleware to authenticate MCP requests using API key
 */
export function authenticateMCP(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  const clientIP = getClientIP(req);
  const userAgent = req.headers['user-agent'];

  if (!authHeader) {
    auditLog(AuditEventType.AUTH_FAILURE, false, {
      ipAddress: clientIP,
      userAgent,
      metadata: { reason: 'missing_header', path: req.path }
    });

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
    auditLog(AuditEventType.AUTH_FAILURE, false, {
      ipAddress: clientIP,
      userAgent,
      metadata: { reason: 'invalid_format', path: req.path }
    });

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
    logger.error('AUTH_TOKEN not configured in environment');
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
    logger.warn('Invalid API key attempt');
    auditLog(AuditEventType.AUTH_FAILURE, false, {
      ipAddress: clientIP,
      userAgent,
      metadata: { reason: 'invalid_token', path: req.path }
    });

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
  auditLog(AuditEventType.AUTH_SUCCESS, true, {
    ipAddress: clientIP,
    userAgent,
    metadata: { path: req.path, method: req.method }
  });

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
