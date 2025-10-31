/**
 * Simple logger utility that respects LOG_LEVEL environment variable
 * Levels: error, warn, info, debug
 */

type LogLevel = 'error' | 'warn' | 'info' | 'debug';

const LOG_LEVELS: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

class Logger {
  private level: LogLevel;

  constructor() {
    const envLevel = (process.env.LOG_LEVEL || 'info').toLowerCase() as LogLevel;
    this.level = LOG_LEVELS[envLevel] !== undefined ? envLevel : 'info';
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] <= LOG_LEVELS[this.level];
  }

  error(message: string, ...args: any[]): void {
    if (this.shouldLog('error')) {
      console.error(`[ERROR] ${message}`, ...args);
    }
  }

  warn(message: string, ...args: any[]): void {
    if (this.shouldLog('warn')) {
      console.warn(`[WARN] ${message}`, ...args);
    }
  }

  info(message: string, ...args: any[]): void {
    if (this.shouldLog('info')) {
      console.log(`[INFO] ${message}`, ...args);
    }
  }

  debug(message: string, ...args: any[]): void {
    if (this.shouldLog('debug')) {
      console.log(`[DEBUG] ${message}`, ...this.sanitizeArgs(args));
    }
  }

  /**
   * Sanitize arguments to prevent logging sensitive data
   */
  private sanitizeArgs(args: any[]): any[] {
    // In production, don't log potentially sensitive arguments
    if (process.env.NODE_ENV === 'production') {
      return args.map(arg => {
        if (typeof arg === 'object' && arg !== null) {
          return '[Object - redacted in production]';
        }
        if (typeof arg === 'string' && arg.length > 100) {
          return arg.substring(0, 100) + '... [truncated]';
        }
        return arg;
      });
    }
    return args;
  }
}

export const logger = new Logger();
