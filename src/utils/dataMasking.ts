/**
 * Data masking utilities for displaying sensitive information
 * Used in admin panels to show partial data while protecting privacy
 */

/**
 * Mask phone number
 * Example: +91 98765 43210 → +91 98*** ***10
 */
export function maskPhone(phone: string): string {
  if (!phone) return '';
  
  const cleaned = phone.replace(/\D/g, '');
  
  if (cleaned.length < 4) return '***';
  
  const start = cleaned.slice(0, 2);
  const end = cleaned.slice(-2);
  const middle = '*'.repeat(Math.min(cleaned.length - 4, 6));
  
  return `${start}${middle}${end}`;
}

/**
 * Mask email address
 * Example: user@example.com → u***r@example.com
 */
export function maskEmail(email: string): string {
  if (!email || !email.includes('@')) return '***';
  
  const [local, domain] = email.split('@');
  
  if (local.length <= 2) {
    return `***@${domain}`;
  }
  
  const masked = local[0] + '***' + local[local.length - 1];
  return `${masked}@${domain}`;
}

/**
 * Mask address
 * Shows only first 10 characters
 */
export function maskAddress(address: string): string {
  if (!address) return '';
  
  if (address.length <= 10) {
    return address.slice(0, 3) + '***';
  }
  
  return address.slice(0, 10) + '***';
}

/**
 * Mask credit card number
 * Example: 1234567890123456 → **** **** **** 3456
 */
export function maskCardNumber(cardNumber: string): string {
  if (!cardNumber) return '';
  
  const cleaned = cardNumber.replace(/\D/g, '');
  
  if (cleaned.length < 4) return '****';
  
  const last4 = cleaned.slice(-4);
  return `**** **** **** ${last4}`;
}

/**
 * Mask name
 * Shows first name and first letter of last name
 * Example: John Doe → John D***
 */
export function maskName(name: string): string {
  if (!name) return '';
  
  const parts = name.trim().split(/\s+/);
  
  if (parts.length === 1) {
    return parts[0].slice(0, 3) + '***';
  }
  
  const firstName = parts[0];
  const lastInitial = parts[parts.length - 1][0];
  
  return `${firstName} ${lastInitial}***`;
}

/**
 * Mask any string by showing only first and last characters
 */
export function maskString(str: string, visibleChars: number = 2): string {
  if (!str) return '';
  
  if (str.length <= visibleChars * 2) {
    return '*'.repeat(str.length);
  }
  
  const start = str.slice(0, visibleChars);
  const end = str.slice(-visibleChars);
  const middle = '*'.repeat(Math.min(str.length - visibleChars * 2, 10));
  
  return `${start}${middle}${end}`;
}

/**
 * Partially mask sensitive data based on type
 */
export function maskSensitiveData(data: string, type: 'phone' | 'email' | 'address' | 'card' | 'name'): string {
  switch (type) {
    case 'phone':
      return maskPhone(data);
    case 'email':
      return maskEmail(data);
    case 'address':
      return maskAddress(data);
    case 'card':
      return maskCardNumber(data);
    case 'name':
      return maskName(data);
    default:
      return maskString(data);
  }
}
