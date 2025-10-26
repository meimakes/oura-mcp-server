import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

/**
 * Encrypts a token using AES-256-GCM
 * @param token - The token to encrypt
 * @returns Encrypted token in format: iv:authTag:encrypted
 */
export function encryptToken(token: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(token, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

/**
 * Decrypts a token using AES-256-GCM
 * @param encryptedToken - The encrypted token in format: iv:authTag:encrypted
 * @returns Decrypted token
 */
export function decryptToken(encryptedToken: string): string {
  try {
    const key = getEncryptionKey();
    const parts = encryptedToken.split(':');

    if (parts.length !== 3) {
      throw new Error('Invalid encrypted token format');
    }

    const [ivHex, authTagHex, encrypted] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (error) {
    throw new Error(`Failed to decrypt token: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Gets the encryption key from environment variable
 * @returns Buffer containing the encryption key
 */
function getEncryptionKey(): Buffer {
  const keyHex = process.env.TOKEN_ENCRYPTION_KEY;

  if (!keyHex) {
    throw new Error('TOKEN_ENCRYPTION_KEY environment variable is not set');
  }

  const key = Buffer.from(keyHex, 'hex');

  if (key.length !== 32) {
    throw new Error('TOKEN_ENCRYPTION_KEY must be a 32-byte (64 character) hex string');
  }

  return key;
}

/**
 * Generates a random encryption key
 * @returns Hex string of a 32-byte key
 */
export function generateEncryptionKey(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Validates that an encryption key is properly formatted
 * @param keyHex - The hex string to validate
 * @returns True if valid, false otherwise
 */
export function isValidEncryptionKey(keyHex: string): boolean {
  try {
    const key = Buffer.from(keyHex, 'hex');
    return key.length === 32;
  } catch {
    return false;
  }
}
