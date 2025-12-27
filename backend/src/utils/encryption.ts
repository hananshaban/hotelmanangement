import crypto from 'crypto';

/**
 * Encryption utility for sensitive data (tokens, secrets)
 * Uses AES-256-GCM for authenticated encryption
 */

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16; // 16 bytes for AES
const SALT_LENGTH = 64; // 64 bytes for key derivation
const TAG_LENGTH = 16; // 16 bytes for GCM authentication tag
const KEY_LENGTH = 32; // 32 bytes for AES-256

/**
 * Get encryption key from environment variable
 * Falls back to a default key in development (NOT for production!)
 */
function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;
  
  if (!key) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('ENCRYPTION_KEY environment variable is required in production');
    }
    // Development fallback - DO NOT USE IN PRODUCTION
    console.warn('⚠️  WARNING: Using default encryption key. Set ENCRYPTION_KEY in production!');
    return crypto.scryptSync('default-dev-key-change-in-production', 'salt', KEY_LENGTH);
  }
  
  // If key is provided as hex string, convert it
  if (key.length === 64) {
    return Buffer.from(key, 'hex');
  }
  
  // Otherwise, derive key from the provided string
  return crypto.scryptSync(key, 'beds24-encryption-salt', KEY_LENGTH);
}

/**
 * Encrypt sensitive data (tokens, secrets)
 * @param text - Plain text to encrypt
 * @returns Encrypted string (hex encoded: salt + iv + tag + encrypted data)
 */
export function encrypt(text: string): string {
  if (!text) {
    return '';
  }
  
  const key = getEncryptionKey();
  const salt = crypto.randomBytes(SALT_LENGTH);
  const iv = crypto.randomBytes(IV_LENGTH);
  
  // Derive key from master key and salt
  const derivedKey = crypto.scryptSync(key, salt, KEY_LENGTH);
  
  const cipher = crypto.createCipheriv(ALGORITHM, derivedKey, iv);
  
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const tag = cipher.getAuthTag();
  
  // Combine: salt + iv + tag + encrypted data
  return salt.toString('hex') + ':' + iv.toString('hex') + ':' + tag.toString('hex') + ':' + encrypted;
}

/**
 * Decrypt encrypted data
 * @param encryptedText - Encrypted string from encrypt()
 * @returns Decrypted plain text
 */
export function decrypt(encryptedText: string): string {
  if (!encryptedText) {
    return '';
  }
  
  try {
    const key = getEncryptionKey();
    const parts = encryptedText.split(':');
    
    if (parts.length !== 4) {
      throw new Error('Invalid encrypted data format');
    }
    
    const [saltHex, ivHex, tagHex, encrypted] = parts;
    
    if (!saltHex || !ivHex || !tagHex || !encrypted) {
      throw new Error('Invalid encrypted data format: missing parts');
    }
    
    const salt = Buffer.from(saltHex, 'hex');
    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');
    
    // Derive key from master key and salt
    const derivedKey = crypto.scryptSync(key, salt, KEY_LENGTH);
    
    const decipher = crypto.createDecipheriv(ALGORITHM, derivedKey, iv);
    decipher.setAuthTag(tag);
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    throw new Error(`Decryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Hash data (one-way, for verification purposes)
 * @param text - Text to hash
 * @returns SHA-256 hash (hex)
 */
export function hash(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex');
}

