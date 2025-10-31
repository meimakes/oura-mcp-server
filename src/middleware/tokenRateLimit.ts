import { Request, Response, NextFunction } from 'express';
import { auditLog, AuditEventType, getClientIP } from '../utils/audit.js';

/**
 * Per-token rate limiting
 * Tracks requests per AUTH_TOKEN to prevent abuse
 */

interface TokenRateLimit {
  count: number;
  resetAt: number;
}

// In-memory store for token rate limits
// In production, use Redis or similar distributed store
const tokenRateLimits = new Map<string, TokenRateLimit>();

// Configuration
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_REQUESTS_PER_TOKEN = 500; // 500 requests per 15 minutes per token

/**
 * Middleware to enforce per-token rate limiting
 */
export function tokenRateLimiter(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    // No auth header, skip token rate limiting (will be caught by auth middleware)
    next();
    return;
  }

  const token = authHeader.split(' ')[1];
  if (!token) {
    next();
    return;
  }

  const now = Date.now();
  const tokenLimit = tokenRateLimits.get(token);

  if (!tokenLimit || now > tokenLimit.resetAt) {
    // Create new rate limit window
    tokenRateLimits.set(token, {
      count: 1,
      resetAt: now + WINDOW_MS,
    });
    next();
    return;
  }

  if (tokenLimit.count >= MAX_REQUESTS_PER_TOKEN) {
    // Rate limit exceeded
    auditLog(AuditEventType.RATE_LIMIT_EXCEEDED, false, {
      ipAddress: getClientIP(req),
      userAgent: req.headers['user-agent'],
      metadata: {
        endpoint: req.path,
        method: req.method,
      },
    });

    res.status(429).json({
      jsonrpc: '2.0',
      id: null,
      error: {
        code: -32001,
        message: 'Rate limit exceeded',
        data: {
          details: `Too many requests for this token. Limit: ${MAX_REQUESTS_PER_TOKEN} requests per ${WINDOW_MS / 60000} minutes.`,
          retryAfter: Math.ceil((tokenLimit.resetAt - now) / 1000),
        },
      },
    });
    return;
  }

  // Increment count
  tokenLimit.count++;
  next();
}

/**
 * Cleanup expired rate limit entries periodically
 */
setInterval(() => {
  const now = Date.now();
  for (const [token, limit] of tokenRateLimits.entries()) {
    if (now > limit.resetAt) {
      tokenRateLimits.delete(token);
    }
  }
}, 60000); // Cleanup every minute
