import crypto from 'crypto';
import axios from 'axios';
import { Request, Response } from 'express';
import { OAuthTokens } from '../oura/types.js';
import { logger } from '../utils/logger.js';
import {
  saveTokens,
  loadTokens,
  clearTokens,
  isAccessTokenValid,
  isExpiringSoon,
  hasRefreshToken,
} from './tokens.js';

// OAuth endpoints
const OURA_AUTH_URL = 'https://cloud.ouraring.com/oauth/authorize';
const OURA_TOKEN_URL = 'https://api.ouraring.com/oauth/token';

// PKCE state storage (in-memory for simplicity)
// Generous 1 hour timeout for AI agents that may take time to complete OAuth flow
const STATE_EXPIRATION_MS = 60 * 60 * 1000; // 1 hour
const pkceState = new Map<string, { codeVerifier: string; state: string; expiresAt: number }>();

// Cleanup expired PKCE states periodically
setInterval(() => {
  const now = Date.now();
  for (const [state, data] of pkceState.entries()) {
    if (now > data.expiresAt) {
      pkceState.delete(state);
    }
  }
}, 5 * 60 * 1000); // Cleanup every 5 minutes

/**
 * Generates PKCE code verifier and challenge
 */
function generatePKCE(): { codeVerifier: string; codeChallenge: string } {
  const codeVerifier = crypto.randomBytes(32).toString('base64url');
  const codeChallenge = crypto
    .createHash('sha256')
    .update(codeVerifier)
    .digest('base64url');

  return { codeVerifier, codeChallenge };
}

/**
 * Generates a random state string for CSRF protection
 */
function generateState(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Initiates OAuth2 authorization flow
 */
export function handleAuthorize(_req: Request, res: Response): void {
  const { codeVerifier, codeChallenge } = generatePKCE();
  const state = generateState();

  // Store PKCE state with expiration
  pkceState.set(state, {
    codeVerifier,
    state,
    expiresAt: Date.now() + STATE_EXPIRATION_MS
  });

  const clientId = process.env.OURA_CLIENT_ID;
  const redirectUri = process.env.OURA_REDIRECT_URI;

  if (!clientId || !redirectUri) {
    res.status(500).send('Server configuration error: Missing OAuth credentials');
    return;
  }

  const scopes = [
    'email',
    'personal',
    'daily',
    'heartrate',
    'workout',
    'tag',
    'session',
    'spo2',
  ].join(' ');

  const authUrl = new URL(OURA_AUTH_URL);
  authUrl.searchParams.append('client_id', clientId);
  authUrl.searchParams.append('redirect_uri', redirectUri);
  authUrl.searchParams.append('response_type', 'code');
  authUrl.searchParams.append('scope', scopes);
  authUrl.searchParams.append('state', state);
  authUrl.searchParams.append('code_challenge', codeChallenge);
  authUrl.searchParams.append('code_challenge_method', 'S256');

  logger.info('Redirecting to Oura authorization page');
  res.redirect(authUrl.toString());
}

/**
 * Handles OAuth2 callback after user authorization
 */
export async function handleCallback(req: Request, res: Response): Promise<void> {
  const { code, state, error } = req.query;

  if (error) {
    logger.error('Authorization error:', error);
    res.status(400).send(`Authorization failed: ${error}`);
    return;
  }

  if (!code || !state || typeof code !== 'string' || typeof state !== 'string') {
    res.status(400).send('Invalid callback parameters');
    return;
  }

  // Verify state and retrieve PKCE verifier
  const storedPKCE = pkceState.get(state);
  if (!storedPKCE) {
    res.status(400).send('Invalid state parameter (CSRF protection)');
    return;
  }

  // Check if state has expired
  if (Date.now() > storedPKCE.expiresAt) {
    pkceState.delete(state);
    res.status(400).send('OAuth state expired. Please restart the authorization flow.');
    return;
  }

  pkceState.delete(state); // Clean up

  try {
    const tokens = await exchangeCodeForTokens(code, storedPKCE.codeVerifier);
    await saveTokens(tokens);

    logger.info('Authorization successful, tokens saved');
    res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Oura Authorization Success</title>
          <style>
            body { font-family: system-ui; max-width: 600px; margin: 50px auto; padding: 20px; }
            .success { color: #10b981; font-size: 24px; margin-bottom: 20px; }
            .info { background: #f3f4f6; padding: 15px; border-radius: 8px; }
          </style>
        </head>
        <body>
          <div class="success">✓ Authorization Successful!</div>
          <div class="info">
            <p>Your Oura Ring has been connected successfully.</p>
            <p>You can now close this window and use the MCP server.</p>
          </div>
        </body>
      </html>
    `);
  } catch (error) {
    logger.error('Token exchange failed:', error);
    res.status(500).send(`Token exchange failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Exchanges authorization code for access and refresh tokens
 */
async function exchangeCodeForTokens(
  code: string,
  codeVerifier: string
): Promise<OAuthTokens> {
  const clientId = process.env.OURA_CLIENT_ID;
  const clientSecret = process.env.OURA_CLIENT_SECRET;
  const redirectUri = process.env.OURA_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('Missing OAuth credentials in environment');
  }

  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    client_secret: clientSecret,
    code_verifier: codeVerifier,
  });

  try {
    const response = await axios.post(OURA_TOKEN_URL, params.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    const { access_token, refresh_token, expires_in, token_type, scope } = response.data;

    return {
      access_token,
      refresh_token,
      expires_at: Date.now() + expires_in * 1000,
      token_type,
      scope,
    };
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new Error(`OAuth token exchange failed: ${error.response?.data?.error || error.message}`);
    }
    throw error;
  }
}

/**
 * Refreshes the access token using refresh token
 */
export async function refreshAccessToken(refreshToken: string): Promise<OAuthTokens> {
  const clientId = process.env.OURA_CLIENT_ID;
  const clientSecret = process.env.OURA_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('Missing OAuth credentials in environment');
  }

  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
  });

  try {
    logger.info('Refreshing access token');
    const response = await axios.post(OURA_TOKEN_URL, params.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    const { access_token, refresh_token, expires_in, token_type, scope } = response.data;

    const tokens: OAuthTokens = {
      access_token,
      refresh_token: refresh_token || refreshToken, // Use new refresh token if provided
      expires_at: Date.now() + expires_in * 1000,
      token_type,
      scope,
    };

    await saveTokens(tokens);
    logger.info('Access token refreshed successfully');

    return tokens;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      logger.error('Token refresh failed:', error.response?.data);
      throw new Error(`Token refresh failed: ${error.response?.data?.error || error.message}`);
    }
    throw error;
  }
}

/**
 * Gets a valid access token, refreshing if necessary
 */
export async function getValidAccessToken(): Promise<string> {
  let tokens = await loadTokens();

  if (!tokens) {
    throw new Error('No OAuth tokens found. Please authenticate first.');
  }

  // Check if token is valid and not expiring soon
  if (isAccessTokenValid(tokens) && !isExpiringSoon(tokens)) {
    return tokens.access_token;
  }

  // Try to refresh the token
  if (hasRefreshToken(tokens)) {
    try {
      tokens = await refreshAccessToken(tokens.refresh_token);
      return tokens.access_token;
    } catch (error) {
      logger.error('Failed to refresh token:', error);
      throw new Error('Failed to refresh access token. Please re-authenticate.');
    }
  }

  throw new Error('Access token expired and no refresh token available. Please re-authenticate.');
}

/**
 * Gets OAuth connection status
 */
export async function getOAuthStatus(): Promise<{
  connected: boolean;
  expiresAt?: number;
  scope?: string;
}> {
  const tokens = await loadTokens();

  if (!tokens) {
    return { connected: false };
  }

  return {
    connected: isAccessTokenValid(tokens),
    expiresAt: tokens.expires_at,
    scope: tokens.scope,
  };
}

/**
 * Disconnects OAuth (clears tokens)
 */
export async function disconnectOAuth(): Promise<void> {
  await clearTokens();
  logger.info('Disconnected successfully');
}
