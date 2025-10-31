import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger.js';

/**
 * Error handling middleware for Express
 */
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  logger.error('Request error:', err);

  // Determine error type and status code
  let statusCode = 500;
  let errorCode = -32603; // Internal error
  let message = 'Internal server error';
  let details = err.message;

  // Parse error message for specific cases
  if (err.message.includes('Validation error')) {
    statusCode = 400;
    errorCode = -32602; // Invalid params
    message = 'Invalid parameters';
  } else if (err.message.includes('authenticate') || err.message.includes('OAuth')) {
    statusCode = 403;
    errorCode = -32000; // Server error (OAuth not authenticated)
    message = 'Authentication required';
  } else if (err.message.includes('Rate limit')) {
    statusCode = 429;
    errorCode = -32001; // Server error (Rate limit exceeded)
    message = 'Rate limit exceeded';
  } else if (err.message.includes('Oura API')) {
    statusCode = 502;
    errorCode = -32002; // Server error (Oura API error)
    message = 'Oura API error';
  } else if (err.message.includes('Not found')) {
    statusCode = 404;
    errorCode = -32601; // Method not found
    message = 'Not found';
  }

  // Sanitize error details in production to prevent information leakage
  if (process.env.NODE_ENV === 'production') {
    // In production, only send generic error messages
    if (statusCode === 500) {
      details = 'An internal error occurred. Please try again later.';
    } else if (statusCode === 502) {
      details = 'External service temporarily unavailable. Please try again later.';
    } else {
      // For client errors, sanitize but keep useful info
      details = details.split('\n')[0]; // Only first line
      // Remove any file paths or stack traces
      details = details.replace(/\/[^\s]+/g, '').replace(/at .+/g, '').trim();
    }
  }

  // Send JSON-RPC error response
  res.status(statusCode).json({
    jsonrpc: '2.0',
    id: (req.body as any)?.id || null,
    error: {
      code: errorCode,
      message,
      data: {
        details,
      },
    },
  });
}

/**
 * 404 handler for unknown routes
 */
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    jsonrpc: '2.0',
    id: null,
    error: {
      code: -32601,
      message: 'Not found',
      data: {
        details: `Route ${req.method} ${req.path} not found`,
      },
    },
  });
}

/**
 * Async handler wrapper to catch errors in async route handlers
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
