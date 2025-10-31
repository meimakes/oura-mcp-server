import dotenv from 'dotenv';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { handleAuthorize, handleCallback, getOAuthStatus, disconnectOAuth } from './oauth/handler.js';
import { handleSSE, handleMessage } from './mcp/server.js';
import { authenticateMCP } from './middleware/auth.js';
import { tokenRateLimiter } from './middleware/tokenRateLimit.js';
import { errorHandler, notFoundHandler, asyncHandler } from './middleware/errorHandler.js';
import { cache } from './utils/cache.js';
import { getRateLimitInfo } from './oura/client.js';
import { tokensFileExists } from './oauth/tokens.js';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Trust proxy - required for Railway, ngrok, and other reverse proxies
app.set('trust proxy', 1);

// HTTPS enforcement middleware (except for local development)
app.use((req: Request, res: Response, next: NextFunction) => {
  if (process.env.NODE_ENV === 'production' && !req.secure && req.get('x-forwarded-proto') !== 'https') {
    return res.redirect(301, `https://${req.get('host')}${req.url}`);
  }
  next();
});

// Security headers with Helmet
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
    },
  },
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true,
  },
}));

// Request size limits (100kb for JSON, prevent DoS)
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));

// CORS configuration
const corsOrigin = process.env.CORS_ORIGIN || '*';
app.use(
  cors({
    origin: corsOrigin === '*' ? true : corsOrigin,
    credentials: true,
    methods: ['GET', 'POST'],
    allowedHeaders: ['Authorization', 'Content-Type'],
  })
);

// Rate limiting for MCP endpoints
const mcpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: {
    error: {
      code: -32001,
      message: 'Too many requests',
      data: {
        details: 'Rate limit exceeded. Please try again later.',
      },
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Basic health check for Railway/monitoring (no auth required)
app.get('/healthz', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ok' });
});

// Detailed health check endpoint (requires authentication to prevent information disclosure)
app.get('/health', authenticateMCP, asyncHandler(async (_req: Request, res: Response) => {
  const oauthStatus = await getOAuthStatus();
  const rateLimitInfo = getRateLimitInfo();
  const hasTokens = await tokensFileExists();

  res.json({
    status: 'ok',
    oauth_connected: oauthStatus.connected,
    oura_api_available: true,
    uptime: process.uptime(),
    cache_size: cache.size(),
    rate_limit: rateLimitInfo,
    has_tokens: hasTokens,
  });
}));

// OAuth endpoints
app.get('/oauth/authorize', (req: Request, res: Response) => {
  handleAuthorize(req, res);
});

app.get('/oauth/callback', asyncHandler(async (req: Request, res: Response) => {
  await handleCallback(req, res);
}));

app.get('/oauth/status', authenticateMCP, asyncHandler(async (_req: Request, res: Response) => {
  const status = await getOAuthStatus();
  res.json(status);
}));

app.post('/oauth/disconnect', authenticateMCP, asyncHandler(async (_req: Request, res: Response) => {
  await disconnectOAuth();
  res.json({ success: true, message: 'OAuth disconnected successfully' });
}));

// MCP endpoints
// OPTIONS handlers for CORS preflight
app.options('/sse', (_req: Request, res: Response) => {
  res.status(200).end();
});

app.options('/message', (_req: Request, res: Response) => {
  res.status(200).end();
});

// Support both GET and POST for SSE endpoint (some MCP clients use POST)
app.get('/sse', authenticateMCP, tokenRateLimiter, asyncHandler(async (req: Request, res: Response) => {
  await handleSSE(req, res);
}));

app.post('/sse', authenticateMCP, tokenRateLimiter, asyncHandler(async (req: Request, res: Response) => {
  await handleSSE(req, res);
}));

app.post('/message', authenticateMCP, tokenRateLimiter, mcpLimiter, asyncHandler(async (req: Request, res: Response) => {
  await handleMessage(req, res);
}));

// Root endpoint
app.get('/', (_req: Request, res: Response) => {
  res.send(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Oura MCP Server</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            max-width: 800px;
            margin: 50px auto;
            padding: 20px;
            line-height: 1.6;
          }
          h1 { color: #0066cc; }
          .status {
            background: #f0f0f0;
            padding: 15px;
            border-radius: 8px;
            margin: 20px 0;
          }
          .endpoint {
            background: #fff;
            border: 1px solid #ddd;
            padding: 10px;
            margin: 10px 0;
            border-radius: 4px;
          }
          .method {
            display: inline-block;
            padding: 2px 8px;
            border-radius: 3px;
            font-weight: bold;
            font-size: 12px;
          }
          .get { background: #61affe; color: white; }
          .post { background: #49cc90; color: white; }
          a { color: #0066cc; text-decoration: none; }
          a:hover { text-decoration: underline; }
        </style>
      </head>
      <body>
        <h1>🔵 Oura MCP Server</h1>
        <p>MCP server for accessing Oura Ring data via OAuth2</p>

        <div class="status">
          <strong>Status:</strong> Running on port ${PORT}<br>
          <strong>Health Check:</strong> <a href="/health">/health</a><br>
          <strong>OAuth Status:</strong> <a href="/oauth/status">/oauth/status</a> (requires auth)
        </div>

        <h2>Available Endpoints</h2>

        <div class="endpoint">
          <span class="method get">GET</span> <strong>/oauth/authorize</strong><br>
          <small>Start OAuth2 authorization flow</small>
        </div>

        <div class="endpoint">
          <span class="method get">GET</span> <strong>/oauth/callback</strong><br>
          <small>OAuth2 callback endpoint (automatic)</small>
        </div>

        <div class="endpoint">
          <span class="method get">GET</span> <strong>/oauth/status</strong><br>
          <small>Get OAuth connection status (requires API key)</small>
        </div>

        <div class="endpoint">
          <span class="method post">POST</span> <strong>/oauth/disconnect</strong><br>
          <small>Disconnect OAuth and clear tokens (requires API key)</small>
        </div>

        <div class="endpoint">
          <span class="method get">GET</span> <strong>/sse</strong><br>
          <small>MCP SSE endpoint for establishing connection (requires API key)</small>
        </div>

        <div class="endpoint">
          <span class="method post">POST</span> <strong>/message</strong><br>
          <small>MCP message endpoint for tool calls (requires API key)</small>
        </div>

        <h2>Quick Start</h2>
        <ol>
          <li>Visit <a href="/oauth/authorize">/oauth/authorize</a> to connect your Oura account</li>
          <li>Configure your MCP client with this server URL and your API key</li>
          <li>Start making tool calls through the MCP protocol</li>
        </ol>

        <h2>Documentation</h2>
        <p>For full documentation, see the <a href="https://github.com/yourusername/oura-mcp-server">README.md</a></p>
      </body>
    </html>
  `);
});

// 404 handler
app.use(notFoundHandler);

// Error handler (must be last)
app.use(errorHandler);

// Start server
app.listen(PORT, () => {
  const baseUrl = process.env.RAILWAY_PUBLIC_DOMAIN
    ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
    : `http://localhost:${PORT}`;

  console.log(`
╔════════════════════════════════════════════════════════╗
║         🔵 Oura MCP Server                            ║
╟────────────────────────────────────────────────────────╢
║  Status:     Running                                   ║
║  Port:       ${PORT}                                        ║
║  Env:        ${process.env.NODE_ENV || 'development'}                              ║
╟────────────────────────────────────────────────────────╢
║  Endpoints:                                            ║
║    • ${baseUrl.padEnd(48)}║
║    • ${(baseUrl + '/health').padEnd(48)}║
║    • ${(baseUrl + '/oauth/authorize').padEnd(48)}║
╟────────────────────────────────────────────────────────╢
║  Next Steps:                                           ║
║    1. Set OURA_REDIRECT_URI in environment             ║
║    2. Visit /oauth/authorize to connect Oura          ║
║    3. Configure MCP client with server URL            ║
╚════════════════════════════════════════════════════════╝
  `);

  // Validate environment variables
  const requiredEnvVars = [
    'AUTH_TOKEN',
    'OURA_CLIENT_ID',
    'OURA_CLIENT_SECRET',
    'OURA_REDIRECT_URI',
    'TOKEN_ENCRYPTION_KEY',
  ];

  const missingVars = requiredEnvVars.filter((varName) => !process.env[varName]);

  if (missingVars.length > 0) {
    console.warn('\n⚠️  Warning: Missing environment variables:');
    missingVars.forEach((varName) => {
      console.warn(`   • ${varName}`);
    });
    console.warn('\nPlease configure these in your .env file\n');
  } else {
    console.log('\n✓ All required environment variables are set\n');
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('\n[Server] Received SIGTERM, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('\n[Server] Received SIGINT, shutting down gracefully...');
  process.exit(0);
});
