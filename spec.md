# Oura Ring MCP Server Specification

## Project Overview

**Name:** oura-mcp-server  
**Purpose:** Local MCP server that enables Poke.com to access Oura Ring data through OAuth2-authenticated API calls  
**Architecture:** Local Node.js server exposed via ngrok tunnel  
**Protocol:** MCP (Model Context Protocol) over HTTP with SSE

## Table of Contents

1. [System Architecture](#system-architecture)
1. [OAuth2 Flow](#oauth2-flow)
1. [MCP Implementation](#mcp-implementation)
1. [Oura API Integration](#oura-api-integration)
1. [Data Models](#data-models)
1. [Security](#security)
1. [Configuration](#configuration)
1. [API Reference](#api-reference)
1. [Setup Instructions](#setup-instructions)
1. [Error Handling](#error-handling)

-----

## System Architecture

### High-Level Architecture

```
┌─────────────┐
│  Poke.com   │
│   (Client)  │
└──────┬──────┘
       │ HTTPS
       ▼
┌─────────────────────────────┐
│  ngrok tunnel               │
│  random-words.ngrok.dev     │
└──────────┬──────────────────┘
           │
           ▼
┌──────────────────────────────────┐
│  Local Computer                  │
│  ┌────────────────────────────┐  │
│  │  Oura MCP Server           │  │
│  │  (Node.js + Express)       │  │
│  │  Port: 3001                │  │
│  │                            │  │
│  │  Components:               │  │
│  │  ├─ OAuth2 Handler         │  │
│  │  ├─ Token Manager          │  │
│  │  ├─ MCP Endpoint (SSE)     │  │
│  │  ├─ Oura API Client        │  │
│  │  └─ Data Cache             │  │
│  └────────────────────────────┘  │
│                                  │
│  ┌────────────────────────────┐  │
│  │  Local Storage             │  │
│  │  ├─ .env (secrets)         │  │
│  │  └─ tokens.json (OAuth)    │  │
│  └────────────────────────────┘  │
└──────────────────────────────────┘
           │
           ▼
┌──────────────────────────────────┐
│  Oura Cloud API                  │
│  cloud.ouraring.com              │
└──────────────────────────────────┘
```

### Component Responsibilities

**OAuth2 Handler:**

- Initiates OAuth flow
- Handles authorization callbacks
- Exchanges authorization codes for tokens
- Manages token refresh

**Token Manager:**

- Securely stores access/refresh tokens
- Automatically refreshes expired tokens
- Encrypts tokens at rest

**MCP Endpoint:**

- Implements SSE (Server-Sent Events) protocol
- Authenticates Poke requests via API key
- Routes tool calls to appropriate handlers
- Returns data in MCP format

**Oura API Client:**

- Authenticates API calls with OAuth tokens
- Handles rate limiting
- Parses Oura API responses
- Manages API versioning

**Data Cache:**

- Caches recent data to reduce API calls
- Respects Oura’s rate limits
- Provides quick responses for repeated queries

-----

## OAuth2 Flow

### Overview

Oura uses OAuth 2.0 Authorization Code Flow with PKCE (Proof Key for Code Exchange).

### Registration (One-Time Setup)

1. Create application at: https://cloud.ouraring.com/oauth/applications
1. Configure application:
- **Name:** “Poke MCP Integration” (or your preference)
- **Redirect URI:** `https://your-domain.ngrok.dev/oauth/callback`
- **Scopes:**
  - `email`
  - `personal`
  - `daily`
  - `heartrate`
  - `workout`
  - `tag`
  - `session`
  - `spo2`
1. Save **Client ID** and **Client Secret**

### Authorization Flow

```
User                    Poke             MCP Server          Oura
  │                      │                   │                │
  │  1. "Connect Oura"   │                   │                │
  ├─────────────────────>│                   │                │
  │                      │  2. Request auth  │                │
  │                      ├──────────────────>│                │
  │                      │                   │  3. Redirect   │
  │<──────────────────────────────────────────────────────────┤
  │                      │                   │                │
  │  4. Login & Approve  │                   │                │
  ├────────────────────────────────────────────────────────────>
  │                      │                   │  5. Callback   │
  │                      │                   │<───────────────┤
  │                      │                   │  + auth code   │
  │                      │                   │                │
  │                      │                   │  6. Exchange   │
  │                      │                   │    code for    │
  │                      │                   │    tokens      │
  │                      │                   ├───────────────>│
  │                      │                   │<───────────────┤
  │                      │                   │  7. Tokens     │
  │                      │                   │                │
  │                      │  8. Success msg   │                │
  │<──────────────────────────────────────────┤                │
  │                      │                   │                │
```

### Token Management

**Access Token:**

- Lifetime: 24 hours
- Used for API requests
- Stored in memory and disk

**Refresh Token:**

- Lifetime: Indefinite (until revoked)
- Used to obtain new access tokens
- Stored encrypted on disk

**Token Refresh Logic:**

```javascript
async function getValidAccessToken() {
  if (isAccessTokenValid() && !isExpiringSoon()) {
    return cachedAccessToken;
  }
  
  if (hasRefreshToken()) {
    return await refreshAccessToken();
  }
  
  throw new Error('User must re-authenticate');
}
```

### Endpoints

**Authorization URL:**

```
GET https://cloud.ouraring.com/oauth/authorize
Query Parameters:
  - client_id: YOUR_CLIENT_ID
  - redirect_uri: https://your-domain.ngrok.dev/oauth/callback
  - response_type: code
  - scope: email personal daily heartrate workout tag session spo2
  - state: RANDOM_STRING (CSRF protection)
  - code_challenge: BASE64URL(SHA256(code_verifier))
  - code_challenge_method: S256
```

**Token Exchange:**

```
POST https://api.ouraring.com/oauth/token
Headers:
  Content-Type: application/x-www-form-urlencoded
Body:
  - grant_type: authorization_code
  - code: AUTHORIZATION_CODE
  - redirect_uri: https://your-domain.ngrok.dev/oauth/callback
  - client_id: YOUR_CLIENT_ID
  - client_secret: YOUR_CLIENT_SECRET
  - code_verifier: ORIGINAL_VERIFIER
```

**Token Refresh:**

```
POST https://api.ouraring.com/oauth/token
Headers:
  Content-Type: application/x-www-form-urlencoded
Body:
  - grant_type: refresh_token
  - refresh_token: REFRESH_TOKEN
  - client_id: YOUR_CLIENT_ID
  - client_secret: YOUR_CLIENT_SECRET
```

-----

## MCP Implementation

### MCP Protocol Overview

The server implements MCP over HTTP using Server-Sent Events (SSE) for streaming responses.

### Authentication

**API Key Authentication:**

- Poke includes API key in HTTP headers
- Server validates against `AUTH_TOKEN` from `.env`
- Separate from Oura OAuth tokens

```
Authorization: Bearer YOUR_AUTH_TOKEN
```

### Endpoints

#### 1. SSE Endpoint (MCP Session)

```
GET /sse
Headers:
  Authorization: Bearer YOUR_AUTH_TOKEN
```

**Purpose:** Establishes SSE connection for MCP communication

**Response:** Stream of SSE events

```
event: endpoint
data: /message

event: message
data: {"jsonrpc":"2.0","id":1,"result":{"protocolVersion":"0.1.0","capabilities":{"tools":{}},"serverInfo":{"name":"oura-mcp-server","version":"1.0.0"}}}
```

#### 2. Message Endpoint (MCP Tool Calls)

```
POST /message
Headers:
  Authorization: Bearer YOUR_AUTH_TOKEN
  Content-Type: application/json
Body: MCP JSON-RPC request
```

**Purpose:** Handle MCP tool invocations

**Request Format:**

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "get_sleep_data",
    "arguments": {
      "start_date": "2025-10-20",
      "end_date": "2025-10-26"
    }
  }
}
```

**Response Format:**

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "Sleep data from Oct 20-26..."
      }
    ]
  }
}
```

#### 3. OAuth Endpoints

```
GET /oauth/authorize
```

Redirects user to Oura OAuth page

```
GET /oauth/callback?code=...&state=...
```

Handles OAuth callback, exchanges code for tokens

```
GET /oauth/status
Headers:
  Authorization: Bearer YOUR_AUTH_TOKEN
```

Returns OAuth connection status

```
POST /oauth/disconnect
Headers:
  Authorization: Bearer YOUR_AUTH_TOKEN
```

Revokes tokens and clears stored credentials

-----

## Oura API Integration

### Base URL

```
https://api.ouraring.com/v2
```

### Authentication

All API requests require Bearer token:

```
Authorization: Bearer ACCESS_TOKEN
```

### Rate Limits

- **Default:** 5000 requests per day
- **Per User:** Varies by account type
- **Headers Returned:**
  - `X-RateLimit-Limit`: Total requests allowed
  - `X-RateLimit-Remaining`: Requests remaining
  - `X-RateLimit-Reset`: Unix timestamp when limit resets

### API Endpoints Used

#### Personal Info

```
GET /v2/usercollection/personal_info
```

#### Daily Sleep

```
GET /v2/usercollection/daily_sleep
Query Parameters:
  - start_date: YYYY-MM-DD (required)
  - end_date: YYYY-MM-DD (optional, defaults to today)
```

#### Daily Activity

```
GET /v2/usercollection/daily_activity
Query Parameters:
  - start_date: YYYY-MM-DD (required)
  - end_date: YYYY-MM-DD (optional)
```

#### Daily Readiness

```
GET /v2/usercollection/daily_readiness
Query Parameters:
  - start_date: YYYY-MM-DD (required)
  - end_date: YYYY-MM-DD (optional)
```

#### Heart Rate

```
GET /v2/usercollection/heartrate
Query Parameters:
  - start_datetime: ISO 8601 datetime (required)
  - end_datetime: ISO 8601 datetime (optional)
```

#### Workouts

```
GET /v2/usercollection/workout
Query Parameters:
  - start_date: YYYY-MM-DD (required)
  - end_date: YYYY-MM-DD (optional)
```

#### Sessions

```
GET /v2/usercollection/session
Query Parameters:
  - start_date: YYYY-MM-DD (required)
  - end_date: YYYY-MM-DD (optional)
```

#### Sleep Periods

```
GET /v2/usercollection/sleep
Query Parameters:
  - start_date: YYYY-MM-DD (required)
  - end_date: YYYY-MM-DD (optional)
```

#### Tags

```
GET /v2/usercollection/tag
Query Parameters:
  - start_date: YYYY-MM-DD (required)
  - end_date: YYYY-MM-DD (optional)
```

#### Ring Configuration

```
GET /v2/usercollection/ring_configuration
```

-----

## Data Models

### MCP Tools

The server exposes these tools to Poke:

#### 1. get_personal_info

**Description:** Get user’s personal information and ring details

**Parameters:** None

**Returns:**

```typescript
{
  age: number;
  weight: number; // kg
  height: number; // cm
  biological_sex: 'male' | 'female';
  email: string;
}
```

#### 2. get_sleep_summary

**Description:** Get sleep data for a date range

**Parameters:**

```typescript
{
  start_date: string; // YYYY-MM-DD
  end_date?: string;  // YYYY-MM-DD (optional, defaults to today)
  include_hrv?: boolean; // Include HRV data (default: false)
}
```

**Returns:**

```typescript
{
  data: Array<{
    date: string;
    score: number; // 0-100
    total_sleep_duration: number; // seconds
    efficiency: number; // percentage
    latency: number; // seconds to fall asleep
    deep_sleep_duration: number; // seconds
    light_sleep_duration: number; // seconds
    rem_sleep_duration: number; // seconds
    awake_time: number; // seconds
    restfulness: number; // 0-100
    timing: number; // 0-100, sleep timing score
    hrv_balance?: number; // if include_hrv=true
  }>;
  summary: {
    average_score: number;
    average_duration: number;
    average_efficiency: number;
    total_days: number;
  };
}
```

#### 3. get_readiness_score

**Description:** Get daily readiness scores

**Parameters:**

```typescript
{
  start_date: string; // YYYY-MM-DD
  end_date?: string;  // YYYY-MM-DD (optional)
}
```

**Returns:**

```typescript
{
  data: Array<{
    date: string;
    score: number; // 0-100
    temperature_deviation: number; // celsius
    temperature_trend_deviation: number;
    activity_balance: number; // 0-100
    body_temperature: number; // 0-100
    hrv_balance: number; // 0-100
    previous_day_activity: number; // 0-100
    previous_night: number; // 0-100
    recovery_index: number; // 0-100
    resting_heart_rate: number; // 0-100
    sleep_balance: number; // 0-100
  }>;
  summary: {
    average_score: number;
    trend: 'improving' | 'declining' | 'stable';
    total_days: number;
  };
}
```

#### 4. get_activity_summary

**Description:** Get activity data for a date range

**Parameters:**

```typescript
{
  start_date: string; // YYYY-MM-DD
  end_date?: string;  // YYYY-MM-DD (optional)
}
```

**Returns:**

```typescript
{
  data: Array<{
    date: string;
    score: number; // 0-100
    active_calories: number; // kcal
    total_calories: number; // kcal
    steps: number;
    equivalent_walking_distance: number; // meters
    high_activity_time: number; // seconds
    medium_activity_time: number; // seconds
    low_activity_time: number; // seconds
    sedentary_time: number; // seconds
    resting_time: number; // seconds
    average_met: number;
    inactivity_alerts: number;
    target_calories: number; // kcal
    target_meters: number;
    meet_daily_targets: number; // 0-100
  }>;
  summary: {
    average_score: number;
    total_steps: number;
    total_calories: number;
    average_steps_per_day: number;
    total_days: number;
  };
}
```

#### 5. get_heart_rate

**Description:** Get heart rate data (5-minute intervals)

**Parameters:**

```typescript
{
  start_datetime: string; // ISO 8601
  end_datetime?: string;   // ISO 8601 (optional, defaults to now)
}
```

**Returns:**

```typescript
{
  data: Array<{
    timestamp: string; // ISO 8601
    bpm: number;
    source: 'rest' | 'activity' | 'workout';
  }>;
  summary: {
    average_bpm: number;
    min_bpm: number;
    max_bpm: number;
    resting_hr: number;
    total_readings: number;
  };
}
```

#### 6. get_workouts

**Description:** Get workout sessions

**Parameters:**

```typescript
{
  start_date: string; // YYYY-MM-DD
  end_date?: string;  // YYYY-MM-DD (optional)
}
```

**Returns:**

```typescript
{
  data: Array<{
    date: string;
    activity: string; // e.g., "cycling", "running", "weights"
    intensity: 'easy' | 'moderate' | 'hard';
    start_datetime: string; // ISO 8601
    end_datetime: string; // ISO 8601
    calories: number; // kcal
    distance?: number; // meters (if applicable)
    average_heart_rate?: number; // bpm
    max_heart_rate?: number; // bpm
  }>;
  summary: {
    total_workouts: number;
    total_calories: number;
    total_duration: number; // seconds
    activities: string[]; // unique activities
  };
}
```

#### 7. get_sleep_detailed

**Description:** Get detailed sleep period data (multiple sleep sessions per day)

**Parameters:**

```typescript
{
  start_date: string; // YYYY-MM-DD
  end_date?: string;  // YYYY-MM-DD (optional)
}
```

**Returns:**

```typescript
{
  data: Array<{
    date: string;
    type: 'long_sleep' | 'short_sleep' | 'nap';
    bedtime_start: string; // ISO 8601
    bedtime_end: string; // ISO 8601
    breath_average: number; // breaths per minute
    heart_rate: {
      interval: number; // seconds
      samples: number[]; // bpm
      average: number;
    };
    hrv: {
      samples: number[]; // ms
      average: number;
    };
    movement_30_sec: string; // "1" = movement, "2" = no movement
    sleep_phase_5_min: string; // "1"=deep, "2"=light, "3"=REM, "4"=awake
  }>;
}
```

#### 8. get_tags

**Description:** Get user-created tags (notes/comments on specific days)

**Parameters:**

```typescript
{
  start_date: string; // YYYY-MM-DD
  end_date?: string;  // YYYY-MM-DD (optional)
}
```

**Returns:**

```typescript
{
  data: Array<{
    date: string;
    day: string; // YYYY-MM-DD
    text: string;
    timestamp: string; // ISO 8601
    tags: string[]; // predefined tag types
  }>;
}
```

#### 9. get_latest_ring_status

**Description:** Get current ring configuration and status

**Parameters:** None

**Returns:**

```typescript
{
  ring_id: string;
  hardware_type: string;
  firmware_version: string;
  battery_level?: number; // percentage (if available)
  last_sync: string; // ISO 8601
}
```

#### 10. get_health_insights

**Description:** Get AI-powered insights based on recent data (generated by Claude, not Oura)

**Parameters:**

```typescript
{
  days?: number; // Number of days to analyze (default: 7)
}
```

**Returns:**

```typescript
{
  period: {
    start_date: string;
    end_date: string;
  };
  insights: Array<{
    category: 'sleep' | 'activity' | 'readiness' | 'recovery';
    finding: string;
    recommendation?: string;
    priority: 'high' | 'medium' | 'low';
  }>;
  trends: {
    sleep: 'improving' | 'declining' | 'stable';
    activity: 'improving' | 'declining' | 'stable';
    readiness: 'improving' | 'declining' | 'stable';
  };
}
```

-----

## Security

### Secrets Management

**Environment Variables (`.env`):**

```
# MCP Server Authentication
AUTH_TOKEN=your-random-token-here

# Oura OAuth Credentials
OURA_CLIENT_ID=your-oura-client-id
OURA_CLIENT_SECRET=your-oura-client-secret
OURA_REDIRECT_URI=https://your-domain.ngrok.dev/oauth/callback

# Server Configuration
PORT=3001
NODE_ENV=production

# Optional: Encryption key for token storage
TOKEN_ENCRYPTION_KEY=your-encryption-key
```

**Token Storage (`tokens.json`):**

```json
{
  "access_token": "ENCRYPTED_ACCESS_TOKEN",
  "refresh_token": "ENCRYPTED_REFRESH_TOKEN",
  "expires_at": 1730000000,
  "token_type": "Bearer",
  "scope": "email personal daily heartrate workout..."
}
```

### Encryption

**Token Encryption:**

- Use AES-256-GCM for encrypting tokens at rest
- Encryption key stored in environment variable
- Never log or expose tokens in plaintext

**Example:**

```javascript
import crypto from 'crypto';

function encryptToken(token: string): string {
  const key = Buffer.from(process.env.TOKEN_ENCRYPTION_KEY, 'hex');
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  
  let encrypted = cipher.update(token, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag();
  
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}
```

### HTTPS

**ngrok Automatic HTTPS:**

- ngrok provides automatic HTTPS
- Valid SSL certificate
- TLS 1.2+ encryption

### CORS

**Strict CORS Policy:**

```javascript
app.use(cors({
  origin: 'https://poke.com',
  credentials: true,
  methods: ['GET', 'POST'],
  allowedHeaders: ['Authorization', 'Content-Type']
}));
```

### Rate Limiting

**Protect Against Abuse:**

```javascript
import rateLimit from 'express-rate-limit';

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests, please try again later'
});

app.use('/message', limiter);
```

### Input Validation

**Validate All Inputs:**

```javascript
import Joi from 'joi';

const dateRangeSchema = Joi.object({
  start_date: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).required(),
  end_date: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).optional()
});
```

-----

## Configuration

### Environment Variables

|Variable              |Required|Description                   |Example                               |
|----------------------|--------|------------------------------|--------------------------------------|
|`AUTH_TOKEN`          |Yes     |MCP server API key            |`your-secret-token-123`               |
|`OURA_CLIENT_ID`      |Yes     |Oura OAuth client ID          |`YOUR_CLIENT_ID`                      |
|`OURA_CLIENT_SECRET`  |Yes     |Oura OAuth client secret      |`YOUR_CLIENT_SECRET`                  |
|`OURA_REDIRECT_URI`   |Yes     |OAuth redirect URI            |`https://abc.ngrok.dev/oauth/callback`|
|`PORT`                |No      |Server port (default: 3001)   |`3001`                                |
|`TOKEN_ENCRYPTION_KEY`|Yes     |32-byte hex key for encryption|`64-char-hex-string`                  |
|`NODE_ENV`            |No      |Environment                   |`production` or `development`         |
|`LOG_LEVEL`           |No      |Logging verbosity             |`info`, `debug`, `error`              |
|`CACHE_TTL`           |No      |Cache time-to-live in seconds |`300` (5 minutes)                     |

### Directory Structure

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
├── .env.example              # Example environment file
├── .env                      # Actual secrets (gitignored)
├── tokens.json               # Encrypted tokens (gitignored)
├── package.json
├── tsconfig.json
├── README.md
└── .gitignore
```

-----

## API Reference

### Error Responses

**Standard Error Format:**

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "error": {
    "code": -32000,
    "message": "Authentication required",
    "data": {
      "details": "No valid OAuth token found. Please authenticate."
    }
  }
}
```

**Error Codes:**

|Code  |Meaning                               |
|------|--------------------------------------|
|-32700|Parse error                           |
|-32600|Invalid request                       |
|-32601|Method not found                      |
|-32602|Invalid params                        |
|-32603|Internal error                        |
|-32000|Server error (OAuth not authenticated)|
|-32001|Server error (Rate limit exceeded)    |
|-32002|Server error (Oura API error)         |

### HTTP Status Codes

|Code|Meaning              |When Used                    |
|----|---------------------|-----------------------------|
|200 |OK                   |Successful request           |
|400 |Bad Request          |Invalid JSON or parameters   |
|401 |Unauthorized         |Invalid or missing AUTH_TOKEN|
|403 |Forbidden            |OAuth not connected          |
|429 |Too Many Requests    |Rate limit exceeded          |
|500 |Internal Server Error|Server error                 |
|502 |Bad Gateway          |Oura API error               |
|503 |Service Unavailable  |Server overloaded            |

-----

## Setup Instructions

### Prerequisites

- Node.js 18+ installed
- ngrok installed and authenticated
- Oura Ring (Gen 2 or Gen 3)
- Oura account with API access

### Step 1: Clone and Install

```bash
git clone https://github.com/yourusername/oura-mcp-server.git
cd oura-mcp-server
npm install
```

### Step 2: Configure ngrok

```bash
# Get your persistent domain
ngrok config add-authtoken YOUR_NGROK_TOKEN
ngrok http 3001

# Note your domain (e.g., random-words.ngrok.dev)
```

### Step 3: Register Oura OAuth App

1. Go to https://cloud.ouraring.com/oauth/applications
1. Click “Create New Application”
1. Fill in:
- **Application Name:** “Personal MCP Server”
- **Redirect URI:** `https://your-domain.ngrok.dev/oauth/callback`
- **Scopes:** Select all scopes you need
1. Save **Client ID** and **Client Secret**

### Step 4: Configure Environment

```bash
cp .env.example .env
nano .env
```

Fill in your values:

```
AUTH_TOKEN=$(openssl rand -hex 32)
OURA_CLIENT_ID=your-client-id
OURA_CLIENT_SECRET=your-client-secret
OURA_REDIRECT_URI=https://your-domain.ngrok.dev/oauth/callback
TOKEN_ENCRYPTION_KEY=$(openssl rand -hex 32)
PORT=3001
```

### Step 5: Build and Start

```bash
# Build TypeScript
npm run build

# Start server
npm start

# In another terminal, start ngrok
ngrok http 3001 --domain=your-domain.ngrok.dev
```

### Step 6: Authenticate with Oura

1. Open browser to: `https://your-domain.ngrok.dev/oauth/authorize`
1. Login to Oura and approve permissions
1. You’ll be redirected back with success message
1. Tokens are now stored and ready to use

### Step 7: Connect to Poke

In Poke.com:

1. Go to Settings → Integrations → MCP Servers
1. Add new MCP server:
- **Name:** “Oura Ring”
- **URL:** `https://your-domain.ngrok.dev/sse`
- **API Key:** Your `AUTH_TOKEN` from `.env`
1. Save and test connection

### Step 8: Test

Ask Poke:

```
"What was my sleep score last night?"
"Show me my activity for the past week"
"How's my readiness today?"
```

-----

## Error Handling

### Common Issues

#### 1. OAuth Callback Failed

**Symptoms:**

- User redirected but no tokens saved
- “Invalid authorization code” error

**Solutions:**

- Verify redirect URI matches exactly in Oura app settings
- Check that CLIENT_ID and CLIENT_SECRET are correct
- Ensure ngrok is running before starting OAuth flow

#### 2. Token Refresh Failed

**Symptoms:**

- “Invalid token” errors after 24 hours
- User must re-authenticate frequently

**Solutions:**

- Verify refresh token is being saved
- Check encryption/decryption is working
- Ensure refresh logic triggers before expiration

#### 3. Rate Limit Exceeded

**Symptoms:**

- 429 HTTP errors
- “Rate limit exceeded” messages

**Solutions:**

- Implement caching (default 5 minutes)
- Reduce polling frequency
- Check rate limit headers in responses

#### 4. Connection Lost to ngrok

**Symptoms:**

- Poke can’t connect to MCP server
- ngrok tunnel shows as offline

**Solutions:**

- Restart ngrok tunnel
- Check ngrok authentication token
- Verify PORT matches between server and ngrok

### Logging

**Log Levels:**

- `ERROR`: Critical issues requiring attention
- `WARN`: Potential issues (rate limits, retries)
- `INFO`: Normal operations (OAuth success, API calls)
- `DEBUG`: Detailed debugging (token refresh, cache hits)

**Log Example:**

```
[2025-10-26 10:30:45] INFO: OAuth token refreshed successfully
[2025-10-26 10:31:12] DEBUG: Cache hit for sleep_data (2025-10-25)
[2025-10-26 10:31:15] WARN: Rate limit approaching (4800/5000 remaining)
[2025-10-26 10:32:00] ERROR: Failed to fetch heart rate data: Network timeout
```

### Health Check

```bash
# Check server status
curl -H "Authorization: Bearer YOUR_AUTH_TOKEN" \
  https://your-domain.ngrok.dev/health

# Expected response:
{
  "status": "ok",
  "oauth_connected": true,
  "oura_api_available": true,
  "uptime": 3600,
  "cache_size": 42
}
```

-----

## Development

### Running in Development Mode

```bash
npm run dev
```

This uses `nodemon` to watch for changes and auto-restart.

### Testing

```bash
# Unit tests
npm test

# Integration tests (requires OAuth connection)
npm run test:integration

# Test OAuth flow
npm run test:oauth
```

### Building for Production

```bash
npm run build
npm start
```

### Deployment Options

**Option 1: Keep Running Locally**

- Computer must be on
- Free (ngrok + local machine)
- Most private (tokens stay local)

**Option 2: Cloud VM (VPS)**

- Deploy to DigitalOcean, AWS EC2, etc.
- $5-20/month
- Always available
- Use static IP instead of ngrok

**Option 3: Serverless**

- Deploy to AWS Lambda + API Gateway
- Pay per request
- More complex OAuth flow (state management)
- Best for occasional use

-----

## License

MIT

-----

## Support

For issues or questions:

- GitHub Issues: https://github.com/yourusername/oura-mcp-server/issues
- Oura API Docs: https://cloud.ouraring.com/docs
- MCP Docs: https://docs.anthropic.com/claude/docs/mcp

-----

## Changelog

### v1.0.0 (2025-10-26)

- Initial release
- OAuth2 with PKCE support
- 10 MCP tools for Oura data
- Token encryption and refresh
- Data caching
- Rate limit handling
