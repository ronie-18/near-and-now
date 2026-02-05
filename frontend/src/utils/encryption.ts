import CryptoJS from 'crypto-js';

// Use environment variable for encryption key
// In production, this should be a strong, randomly generated key
const ENCRYPTION_KEY = import.meta.env.VITE_ENCRYPTION_KEY || 'default-key-change-in-production';

/**
 * Encrypt sensitive data using AES-256
 */
export function encryptData(data: string): string {
  if (!data) return '';
  
  try {
    return CryptoJS.AES.encrypt(data, ENCRYPTION_KEY).toString();
  } catch (error) {
    console.error('Encryption error:', error);
    throw new Error('Failed to encrypt data');
  }
}

/**
 * Decrypt encrypted data
 */
export function decryptData(encryptedData: string): string {
  if (!encryptedData) return '';
  
  try {
    const bytes = CryptoJS.AES.decrypt(encryptedData, ENCRYPTION_KEY);
    const decrypted = bytes.toString(CryptoJS.enc.Utf8);
    
    if (!decrypted) {
      throw new Error('Decryption failed - invalid key or corrupted data');
    }
    
    return decrypted;
  } catch (error) {
    console.error('Decryption error:', error);
    throw new Error('Failed to decrypt data');
  }
}

/**
 * Hash data using SHA-256 (one-way, cannot be decrypted)
 */
export function hashData(data: string): string {
  return CryptoJS.SHA256(data).toString();
}

/**
 * Generate a random encryption key
 */
export function generateEncryptionKey(length: number = 32): string {
  return CryptoJS.lib.WordArray.random(length).toString();
}

/**
 * Encrypt an object's sensitive fields
 */
export function encryptObjectFields<T extends Record<string, any>>(
  obj: T,
  fieldsToEncrypt: (keyof T)[]
): T {
  const encrypted = { ...obj };
  
  fieldsToEncrypt.forEach(field => {
    if (encrypted[field] && typeof encrypted[field] === 'string') {
      encrypted[field] = encryptData(encrypted[field] as string) as any;
    }
  });
  
  return encrypted;
}

/**
 * Decrypt an object's encrypted fields
 */
export function decryptObjectFields<T extends Record<string, any>>(
  obj: T,
  fieldsToDecrypt: (keyof T)[]
): T {
  const decrypted = { ...obj };
  
  fieldsToDecrypt.forEach(field => {
    if (decrypted[field] && typeof decrypted[field] === 'string') {
      try {
        decrypted[field] = decryptData(decrypted[field] as string) as any;
      } catch (error) {
        console.error(`Failed to decrypt field ${String(field)}:`, error);
      }
    }
  });
  
  return decrypted;
}
