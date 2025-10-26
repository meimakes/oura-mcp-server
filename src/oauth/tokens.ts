import fs from 'fs/promises';
import path from 'path';
import { encryptToken, decryptToken } from '../utils/encryption.js';
import { OAuthTokens } from '../oura/types.js';

const TOKENS_FILE = path.join(process.cwd(), 'tokens.json');
const TOKEN_REFRESH_BUFFER = 5 * 60 * 1000; // Refresh 5 minutes before expiration

// In-memory cache
let cachedTokens: OAuthTokens | null = null;

/**
 * Saves OAuth tokens to disk (encrypted)
 * @param tokens - The OAuth tokens to save
 */
export async function saveTokens(tokens: OAuthTokens): Promise<void> {
  try {
    const encryptedTokens = {
      access_token: encryptToken(tokens.access_token),
      refresh_token: encryptToken(tokens.refresh_token),
      expires_at: tokens.expires_at,
      token_type: tokens.token_type,
      scope: tokens.scope,
    };

    await fs.writeFile(TOKENS_FILE, JSON.stringify(encryptedTokens, null, 2), 'utf8');
    cachedTokens = tokens;
    console.log('[TokenManager] Tokens saved successfully');
  } catch (error) {
    console.error('[TokenManager] Failed to save tokens:', error);
    throw new Error(`Failed to save tokens: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Loads OAuth tokens from disk (decrypted)
 * @returns The OAuth tokens or null if not found
 */
export async function loadTokens(): Promise<OAuthTokens | null> {
  // Return cached tokens if available
  if (cachedTokens) {
    return cachedTokens;
  }

  try {
    const fileContent = await fs.readFile(TOKENS_FILE, 'utf8');
    const encryptedTokens = JSON.parse(fileContent);

    const tokens: OAuthTokens = {
      access_token: decryptToken(encryptedTokens.access_token),
      refresh_token: decryptToken(encryptedTokens.refresh_token),
      expires_at: encryptedTokens.expires_at,
      token_type: encryptedTokens.token_type,
      scope: encryptedTokens.scope,
    };

    cachedTokens = tokens;
    console.log('[TokenManager] Tokens loaded successfully');
    return tokens;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      console.log('[TokenManager] No tokens file found');
      return null;
    }
    console.error('[TokenManager] Failed to load tokens:', error);
    return null;
  }
}

/**
 * Clears stored tokens (for logout/disconnect)
 */
export async function clearTokens(): Promise<void> {
  try {
    await fs.unlink(TOKENS_FILE);
    cachedTokens = null;
    console.log('[TokenManager] Tokens cleared successfully');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.error('[TokenManager] Failed to clear tokens:', error);
      throw new Error(`Failed to clear tokens: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

/**
 * Checks if the access token is valid and not expired
 * @param tokens - The OAuth tokens to check
 * @returns True if valid, false otherwise
 */
export function isAccessTokenValid(tokens: OAuthTokens | null): boolean {
  if (!tokens) {
    return false;
  }

  const now = Date.now();
  return now < tokens.expires_at;
}

/**
 * Checks if the access token is expiring soon (within buffer time)
 * @param tokens - The OAuth tokens to check
 * @returns True if expiring soon, false otherwise
 */
export function isExpiringSoon(tokens: OAuthTokens | null): boolean {
  if (!tokens) {
    return true;
  }

  const now = Date.now();
  return now >= tokens.expires_at - TOKEN_REFRESH_BUFFER;
}

/**
 * Checks if there is a valid refresh token
 * @param tokens - The OAuth tokens to check
 * @returns True if refresh token exists, false otherwise
 */
export function hasRefreshToken(tokens: OAuthTokens | null): boolean {
  return Boolean(tokens?.refresh_token);
}

/**
 * Updates the cached tokens (useful when refreshing)
 * @param tokens - The new tokens to cache
 */
export function updateCachedTokens(tokens: OAuthTokens): void {
  cachedTokens = tokens;
}

/**
 * Gets the current cached tokens
 * @returns The cached tokens or null
 */
export function getCachedTokens(): OAuthTokens | null {
  return cachedTokens;
}

/**
 * Checks if tokens file exists
 * @returns True if file exists, false otherwise
 */
export async function tokensFileExists(): Promise<boolean> {
  try {
    await fs.access(TOKENS_FILE);
    return true;
  } catch {
    return false;
  }
}
