# Oura MCP Server

Local MCP (Model Context Protocol) server that enables AI assistants to access your Oura Ring health data through OAuth2-authenticated API calls.

Built for seamless integration with [Poke](https://poke.com) and other MCP-compatible clients.

## Features

- **OAuth2 with PKCE** - Secure authentication with automatic token refresh
- **9 MCP Tools** - Access sleep, readiness, activity, heart rate, workouts, and more
- **Dual Transport Support** - Both SSE and Streamable HTTP transports
- **Token Encryption** - AES-256-GCM encryption for OAuth tokens at rest
- **Smart Caching** - Reduce API calls with intelligent data caching
- **Rate Limiting** - Built-in protection against API quota exhaustion
- **ngrok Support** - Easy remote access for mobile and cloud integrations

## Prerequisites

- Node.js 18 or higher
- Oura Ring (all generations supported - Gen 2, Gen 3, and Gen 4)
- Oura account with API access
- ngrok (for remote access)

## Installation

1. Clone the repository:
```bash
git clone https://github.com/meimakes/oura-mcp-server.git
cd oura-mcp-server
```

2. Install dependencies:
```bash
npm install
```

3. Copy the example environment file:
```bash
cp .env.example .env
```

4. Generate required secrets:
```bash
# Generate AUTH_TOKEN
openssl rand -hex 32

# Generate TOKEN_ENCRYPTION_KEY
openssl rand -hex 32
```

## Configuration

### Step 1: Set up ngrok

1. Install and authenticate ngrok:
```bash
ngrok config add-authtoken YOUR_NGROK_TOKEN
```

2. Start ngrok tunnel:
```bash
ngrok http 3001
```

3. Note your ngrok URL (e.g., `https://your-domain.ngrok.dev`)

### Step 2: Register Oura OAuth Application

1. Go to https://cloud.ouraring.com/oauth/applications
2. Click "Create New Application"
3. Fill in:
   - **Application Name:** "Personal MCP Server" (or your choice)
   - **Redirect URI:** `https://your-domain.ngrok.dev/oauth/callback`
   - **Scopes:** Select all available scopes
4. Save the **Client ID** and **Client Secret**

### Step 3: Configure Environment Variables

Edit `.env` file:

```env
# MCP Server Authentication
AUTH_TOKEN=<generated-token-from-step-4>

# Oura OAuth Credentials
OURA_CLIENT_ID=<your-client-id>
OURA_CLIENT_SECRET=<your-client-secret>
OURA_REDIRECT_URI=https://your-domain.ngrok.dev/oauth/callback

# Server Configuration
PORT=3001
NODE_ENV=production

# Token Encryption
TOKEN_ENCRYPTION_KEY=<generated-key-from-step-4>

# CORS Origin (set to * to allow all origins)
CORS_ORIGIN=*
```

## Usage

### Starting the Server

1. Build the TypeScript code:
```bash
npm run build
```

2. Start the server:
```bash
npm start
```

For development with auto-reload:
```bash
npm run dev
```

### Connecting Your Oura Account

1. Open your browser to: `http://localhost:3001/oauth/authorize`
   (or use your ngrok URL: `https://your-domain.ngrok.dev/oauth/authorize`)
2. Log in to your Oura account
3. Approve the requested permissions
4. You'll be redirected back with a success message

### Connecting to MCP Clients

#### Poke

1. Open Poke app
2. Go to Settings → Integrations → Add Integration
3. Select "Model Context Protocol (MCP)"
4. Enter:
   - **Name:** Oura
   - **Server URL:** `https://your-domain.ngrok.dev/sse`
   - **API Key:** Your `AUTH_TOKEN` from `.env`
5. Tap "Add Integration"

The server supports both SSE and Streamable HTTP transports for maximum compatibility.

#### Other MCP Clients

Configure your MCP client with:
- **Server URL:** `https://your-domain.ngrok.dev/sse`
- **API Key (Bearer Token):** Your `AUTH_TOKEN` from `.env`

## Available MCP Tools

### 1. get_personal_info
Get user's personal information and ring details.

### 2. get_sleep_summary
Get sleep data for a date range.

**Parameters:**
- `start_date` (required): YYYY-MM-DD
- `end_date` (optional): YYYY-MM-DD
- `include_hrv` (optional): boolean

### 3. get_readiness_score
Get daily readiness scores.

**Parameters:**
- `start_date` (required): YYYY-MM-DD
- `end_date` (optional): YYYY-MM-DD

### 4. get_activity_summary
Get activity data for a date range.

**Parameters:**
- `start_date` (required): YYYY-MM-DD
- `end_date` (optional): YYYY-MM-DD

### 5. get_heart_rate
Get heart rate data in 5-minute intervals.

**Parameters:**
- `start_datetime` (required): ISO 8601 format
- `end_datetime` (optional): ISO 8601 format

### 6. get_workouts
Get workout sessions.

**Parameters:**
- `start_date` (required): YYYY-MM-DD
- `end_date` (optional): YYYY-MM-DD

### 7. get_sleep_detailed
Get detailed sleep period data with heart rate and HRV.

**Parameters:**
- `start_date` (required): YYYY-MM-DD
- `end_date` (optional): YYYY-MM-DD

### 8. get_tags
Get user-created tags and notes.

**Parameters:**
- `start_date` (required): YYYY-MM-DD
- `end_date` (optional): YYYY-MM-DD

### 9. get_health_insights
Get AI-powered insights based on recent data.

**Parameters:**
- `days` (optional): Number of days to analyze (default: 7)

## API Endpoints

### Health Check
```
GET /health
```
Returns server status, OAuth connection status, and cache statistics.

### OAuth Endpoints
```
GET  /oauth/authorize     - Start OAuth flow
GET  /oauth/callback      - OAuth callback (automatic)
GET  /oauth/status        - Get connection status (requires auth)
POST /oauth/disconnect    - Disconnect and clear tokens (requires auth)
```

### MCP Endpoints

The server supports both transport modes:

**Streamable HTTP (recommended for Poke):**
```
POST /sse                 - JSON-RPC requests with direct responses
```

**Classic SSE:**
```
GET  /sse                 - Establish SSE connection
POST /message             - Send JSON-RPC requests via session
```

## Security

### Token Encryption
All OAuth tokens are encrypted at rest using AES-256-GCM encryption.

### Authentication
MCP endpoints require Bearer token authentication:
```
Authorization: Bearer YOUR_AUTH_TOKEN
```

### Rate Limiting
- MCP endpoints: 100 requests per 15 minutes per IP
- Oura API: 5000 requests per day (tracked automatically)

### CORS
Configure allowed origins in `.env` with `CORS_ORIGIN`.

## Troubleshooting

### OAuth Callback Failed
- Verify redirect URI matches exactly in Oura app settings
- Ensure ngrok is running before starting OAuth flow
- Check CLIENT_ID and CLIENT_SECRET are correct

### Token Refresh Failed
- Verify TOKEN_ENCRYPTION_KEY is set correctly
- Check tokens.json file exists and is readable
- Ensure refresh token hasn't been revoked

### Rate Limit Exceeded
- Implement caching (already built-in with 5-minute default)
- Reduce polling frequency
- Check rate limit headers in responses

### Connection Lost to ngrok
- Restart ngrok tunnel
- Update OURA_REDIRECT_URI if ngrok URL changed
- Verify ngrok authentication token

## Development

### Project Structure
```
oura-mcp-server/
├── src/
│   ├── index.ts              # Main server file
│   ├── oauth/
│   │   ├── handler.ts        # OAuth flow handler
│   │   └── tokens.ts         # Token management
│   ├── mcp/
│   │   ├── server.ts         # MCP protocol implementation
│   │   └── tools.ts          # Tool definitions
│   ├── oura/
│   │   ├── client.ts         # Oura API client
│   │   └── types.ts          # TypeScript types
│   ├── utils/
│   │   ├── encryption.ts     # Token encryption
│   │   ├── cache.ts          # Data caching
│   │   └── validation.ts     # Input validation
│   └── middleware/
│       ├── auth.ts           # Authentication middleware
│       └── errorHandler.ts   # Error handling
├── .env                      # Environment variables (gitignored)
├── tokens.json               # Encrypted tokens (gitignored)
├── package.json
├── tsconfig.json
└── README.md
```

### Running Tests
```bash
npm test
```

### Type Checking
```bash
npm run typecheck
```

### Linting
```bash
npm run lint
```

## Deployment Options

### Option 1: Local Machine
- Keep your computer running
- Free (ngrok + local machine)
- Most private (tokens stay local)

### Option 2: Cloud VM (VPS)
- Deploy to DigitalOcean, AWS EC2, etc.
- Always available
- Use static IP instead of ngrok

### Option 3: Docker
```bash
docker build -t oura-mcp-server .
docker run -p 3001:3001 --env-file .env oura-mcp-server
```

## License

MIT

## Support

For issues or questions:
- GitHub Issues: https://github.com/meimakes/oura-mcp-server/issues
- Oura API Docs: https://cloud.ouraring.com/docs
- MCP Protocol: https://modelcontextprotocol.io

## Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) for details.
