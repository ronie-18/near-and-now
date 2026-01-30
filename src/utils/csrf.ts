/**
 * CSRF (Cross-Site Request Forgery) Protection
 * Generates and validates CSRF tokens for state-changing operations
 */

const CSRF_TOKEN_KEY = 'csrfToken';
const CSRF_TOKEN_EXPIRY_KEY = 'csrfTokenExpiry';
const TOKEN_VALIDITY_MS = 60 * 60 * 1000; // 1 hour

/**
 * Generate a new CSRF token
 */
export function generateCSRFToken(): string {
  const token = crypto.randomUUID();
  const expiry = Date.now() + TOKEN_VALIDITY_MS;
  
  sessionStorage.setItem(CSRF_TOKEN_KEY, token);
  sessionStorage.setItem(CSRF_TOKEN_EXPIRY_KEY, expiry.toString());
  
  return token;
}

/**
 * Get the current CSRF token
 * Generates a new one if expired or missing
 */
export function getCSRFToken(): string {
  const token = sessionStorage.getItem(CSRF_TOKEN_KEY);
  const expiry = sessionStorage.getItem(CSRF_TOKEN_EXPIRY_KEY);
  
  if (!token || !expiry || Date.now() > parseInt(expiry)) {
    return generateCSRFToken();
  }
  
  return token;
}

/**
 * Validate CSRF token
 */
export function validateCSRFToken(token: string): boolean {
  const storedToken = sessionStorage.getItem(CSRF_TOKEN_KEY);
  const expiry = sessionStorage.getItem(CSRF_TOKEN_EXPIRY_KEY);
  
  if (!storedToken || !expiry) {
    return false;
  }
  
  if (Date.now() > parseInt(expiry)) {
    clearCSRFToken();
    return false;
  }
  
  return token === storedToken;
}

/**
 * Clear CSRF token
 */
export function clearCSRFToken(): void {
  sessionStorage.removeItem(CSRF_TOKEN_KEY);
  sessionStorage.removeItem(CSRF_TOKEN_EXPIRY_KEY);
}

/**
 * Add CSRF token to request headers
 */
export function addCSRFHeader(headers: HeadersInit = {}): HeadersInit {
  const token = getCSRFToken();
  
  return {
    ...headers,
    'X-CSRF-Token': token
  };
}

/**
 * Fetch wrapper with CSRF protection
 */
export async function secureFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const method = options.method?.toUpperCase() || 'GET';
  
  // Only add CSRF token for state-changing operations
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    options.headers = addCSRFHeader(options.headers);
  }
  
  return fetch(url, options);
}
