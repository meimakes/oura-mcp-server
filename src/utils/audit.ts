/**
 * Audit logging for security events
 * Logs critical security events for compliance and forensics
 */

import { logger } from './logger.js';

export enum AuditEventType {
  AUTH_SUCCESS = 'AUTH_SUCCESS',
  AUTH_FAILURE = 'AUTH_FAILURE',
  OAUTH_INITIATED = 'OAUTH_INITIATED',
  OAUTH_SUCCESS = 'OAUTH_SUCCESS',
  OAUTH_FAILURE = 'OAUTH_FAILURE',
  OAUTH_DISCONNECTED = 'OAUTH_DISCONNECTED',
  TOKEN_REFRESH = 'TOKEN_REFRESH',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  DATA_ACCESS = 'DATA_ACCESS',
  SESSION_CREATED = 'SESSION_CREATED',
  SESSION_EXPIRED = 'SESSION_EXPIRED',
  INVALID_REQUEST = 'INVALID_REQUEST',
}

interface AuditEvent {
  timestamp: string;
  eventType: AuditEventType;
  userId?: string;
  ipAddress?: string;
  userAgent?: string;
  details?: Record<string, any>;
  success: boolean;
}

/**
 * Logs an audit event
 * In production, this should write to a secure audit log storage
 */
export function auditLog(
  eventType: AuditEventType,
  success: boolean,
  details?: {
    userId?: string;
    ipAddress?: string;
    userAgent?: string;
    metadata?: Record<string, any>;
  }
): void {
  const event: AuditEvent = {
    timestamp: new Date().toISOString(),
    eventType,
    userId: details?.userId,
    ipAddress: details?.ipAddress,
    userAgent: details?.userAgent,
    details: sanitizeDetails(details?.metadata),
    success,
  };

  // Log to structured output
  logger.info(`[AUDIT] ${eventType}`, {
    ...event,
    // Ensure sensitive data is not logged
    details: event.details ? JSON.stringify(event.details) : undefined,
  });

  // In production, additionally write to:
  // - Separate audit log file with rotation
  // - SIEM system (Splunk, ELK, etc.)
  // - Cloud logging service (CloudWatch, Stackdriver, etc.)
}

/**
 * Sanitize audit details to prevent sensitive data leakage
 */
function sanitizeDetails(metadata?: Record<string, any>): Record<string, any> | undefined {
  if (!metadata) return undefined;

  const sanitized: Record<string, any> = {};
  const sensitiveKeys = [
    'token',
    'access_token',
    'refresh_token',
    'password',
    'secret',
    'key',
    'authorization',
    'auth',
  ];

  for (const [key, value] of Object.entries(metadata)) {
    const lowerKey = key.toLowerCase();

    // Check if key contains sensitive terms
    const isSensitive = sensitiveKeys.some(sensitiveKey => lowerKey.includes(sensitiveKey));

    if (isSensitive) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      // Recursively sanitize nested objects
      sanitized[key] = sanitizeDetails(value as Record<string, any>);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Helper to get client IP from request (handles proxies)
 */
export function getClientIP(req: any): string {
  return (
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    (req.headers['x-real-ip'] as string) ||
    req.socket?.remoteAddress ||
    req.connection?.remoteAddress ||
    'unknown'
  );
}
