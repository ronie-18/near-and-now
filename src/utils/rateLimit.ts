/**
 * Client-side rate limiting utility
 * Prevents abuse by limiting the number of requests in a time window
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

class RateLimiter {
  private limits: Map<string, RateLimitEntry> = new Map();

  /**
   * Check if action is allowed under rate limit
   * @param key - Unique identifier for the action (e.g., 'login', 'create-order')
   * @param maxRequests - Maximum number of requests allowed
   * @param windowMs - Time window in milliseconds
   */
  checkLimit(key: string, maxRequests: number, windowMs: number): boolean {
    const now = Date.now();
    const entry = this.limits.get(key);

    // No previous entry or window expired
    if (!entry || now > entry.resetAt) {
      this.limits.set(key, {
        count: 1,
        resetAt: now + windowMs
      });
      return true;
    }

    // Within window, check count
    if (entry.count >= maxRequests) {
      return false; // Rate limit exceeded
    }

    // Increment count
    entry.count++;
    return true;
  }

  /**
   * Get remaining requests for a key
   */
  getRemaining(key: string, maxRequests: number): number {
    const entry = this.limits.get(key);
    
    if (!entry || Date.now() > entry.resetAt) {
      return maxRequests;
    }
    
    return Math.max(0, maxRequests - entry.count);
  }

  /**
   * Get time until reset (in milliseconds)
   */
  getResetTime(key: string): number {
    const entry = this.limits.get(key);
    
    if (!entry || Date.now() > entry.resetAt) {
      return 0;
    }
    
    return entry.resetAt - Date.now();
  }

  /**
   * Clear rate limit for a key
   */
  clear(key: string): void {
    this.limits.delete(key);
  }

  /**
   * Clear all rate limits
   */
  clearAll(): void {
    this.limits.clear();
  }
}

// Singleton instance
export const rateLimiter = new RateLimiter();

/**
 * Rate limit configurations for different actions
 */
export const RATE_LIMITS = {
  LOGIN: { maxRequests: 5, windowMs: 15 * 60 * 1000 }, // 5 attempts per 15 minutes
  CREATE_ORDER: { maxRequests: 3, windowMs: 60 * 60 * 1000 }, // 3 orders per hour
  API_CALL: { maxRequests: 100, windowMs: 60 * 1000 }, // 100 calls per minute
  PASSWORD_RESET: { maxRequests: 3, windowMs: 60 * 60 * 1000 }, // 3 resets per hour
  ADMIN_LOGIN: { maxRequests: 3, windowMs: 15 * 60 * 1000 }, // 3 attempts per 15 minutes
  CREATE_PRODUCT: { maxRequests: 20, windowMs: 60 * 1000 }, // 20 products per minute
  SEARCH: { maxRequests: 30, windowMs: 60 * 1000 } // 30 searches per minute
};

/**
 * Check rate limit for an action
 */
export function checkRateLimit(action: keyof typeof RATE_LIMITS, identifier: string = ''): boolean {
  const config = RATE_LIMITS[action];
  const key = `${action}:${identifier}`;
  
  return rateLimiter.checkLimit(key, config.maxRequests, config.windowMs);
}

/**
 * Get rate limit info for an action
 */
export function getRateLimitInfo(action: keyof typeof RATE_LIMITS, identifier: string = '') {
  const config = RATE_LIMITS[action];
  const key = `${action}:${identifier}`;
  
  return {
    remaining: rateLimiter.getRemaining(key, config.maxRequests),
    resetIn: rateLimiter.getResetTime(key),
    maxRequests: config.maxRequests
  };
}
