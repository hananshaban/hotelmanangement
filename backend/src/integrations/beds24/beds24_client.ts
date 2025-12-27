import type {
  AccessTokenResponse,
  RefreshTokenResponse,
  TokenDetails,
  Beds24ApiResponse,
  Beds24RequestOptions,
  Beds24RateLimitInfo,
  Beds24RateLimitHeaders,
} from './beds24_types.js';
import {
  Beds24Error,
  Beds24AuthenticationError,
  Beds24RateLimitError,
  Beds24NetworkError,
  Beds24ApiError,
  Beds24CircuitBreakerError,
  createBeds24Error,
} from './beds24_errors.js';
import { BEDS24_CONFIG } from './beds24_config.js';

/**
 * Circuit Breaker State
 */
enum CircuitState {
  CLOSED = 'CLOSED', // Normal operation
  OPEN = 'OPEN', // Too many failures, reject requests
  HALF_OPEN = 'HALF_OPEN', // Testing if service recovered
}

/**
 * Rate Limiter using Token Bucket algorithm
 */
class RateLimiter {
  private tokens: number;
  private lastRefill: number;
  private readonly maxTokens: number;
  private readonly refillRate: number; // tokens per millisecond

  constructor(maxRequests: number, windowMs: number) {
    this.maxTokens = maxRequests;
    this.tokens = maxRequests;
    this.lastRefill = Date.now();
    this.refillRate = maxRequests / windowMs;
  }

  /**
   * Try to consume a token
   * @returns true if token consumed, false if rate limited
   */
  tryConsume(): boolean {
    this.refill();
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return true;
    }
    return false;
  }

  /**
   * Get time until next token available (ms)
   */
  getTimeUntilNextToken(): number {
    this.refill();
    if (this.tokens >= 1) {
      return 0;
    }
    const tokensNeeded = 1 - this.tokens;
    return Math.ceil(tokensNeeded / this.refillRate);
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    const tokensToAdd = elapsed * this.refillRate;
    
    if (tokensToAdd > 0) {
      this.tokens = Math.min(this.maxTokens, this.tokens + tokensToAdd);
      this.lastRefill = now;
    }
  }
}

/**
 * Circuit Breaker implementation
 */
class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount: number = 0;
  private lastFailureTime: number = 0;
  private halfOpenSuccessCount: number = 0;

  /**
   * Check if request should be allowed
   */
  canProceed(): boolean {
    const now = Date.now();

    if (this.state === CircuitState.CLOSED) {
      return true;
    }

    if (this.state === CircuitState.OPEN) {
      // Check if reset timeout has passed
      if (now - this.lastFailureTime >= BEDS24_CONFIG.CIRCUIT_BREAKER.RESET_TIMEOUT_MS) {
        this.state = CircuitState.HALF_OPEN;
        this.halfOpenSuccessCount = 0;
        return true;
      }
      return false;
    }

    // HALF_OPEN state
    if (this.halfOpenSuccessCount >= BEDS24_CONFIG.CIRCUIT_BREAKER.HALF_OPEN_MAX_REQUESTS) {
      // Too many requests in half-open, go back to open
      this.state = CircuitState.OPEN;
      this.lastFailureTime = now;
      return false;
    }

    return true;
  }

  /**
   * Record a successful request
   */
  recordSuccess(): void {
    if (this.state === CircuitState.HALF_OPEN) {
      this.halfOpenSuccessCount++;
      if (this.halfOpenSuccessCount >= BEDS24_CONFIG.CIRCUIT_BREAKER.HALF_OPEN_MAX_REQUESTS) {
        // Successfully recovered
        this.state = CircuitState.CLOSED;
        this.failureCount = 0;
        this.halfOpenSuccessCount = 0;
      }
    } else {
      // Reset failure count on success
      this.failureCount = 0;
    }
  }

  /**
   * Record a failed request
   */
  recordFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.failureCount >= BEDS24_CONFIG.CIRCUIT_BREAKER.FAILURE_THRESHOLD) {
      this.state = CircuitState.OPEN;
    }

    if (this.state === CircuitState.HALF_OPEN) {
      // Failure in half-open, go back to open
      this.state = CircuitState.OPEN;
      this.halfOpenSuccessCount = 0;
    }
  }

  getState(): CircuitState {
    return this.state;
  }
}

/**
 * Beds24 API Client
 * Handles authentication, rate limiting, circuit breaking, and API requests
 */
export class Beds24Client {
  private refreshToken: string | undefined;
  private accessToken: string | undefined;
  private tokenExpiresAt: Date | undefined;
  private rateLimiter: RateLimiter;
  private circuitBreaker: CircuitBreaker;

  constructor(refreshToken?: string) {
    this.refreshToken = refreshToken;
    this.rateLimiter = new RateLimiter(
      BEDS24_CONFIG.RATE_LIMIT.MAX_REQUESTS,
      BEDS24_CONFIG.RATE_LIMIT.WINDOW_MS
    );
    this.circuitBreaker = new CircuitBreaker();
  }

  /**
   * Set refresh token (for token management)
   * Invalidates cached access token to force refresh on next request
   */
  setRefreshToken(refreshToken: string): void {
    this.refreshToken = refreshToken;
    this.accessToken = undefined;
    this.tokenExpiresAt = undefined;
  }

  /**
   * Get access token (refresh if needed)
   */
  async getAccessToken(): Promise<string> {
    // Check if we have a valid token
    if (this.accessToken && this.tokenExpiresAt) {
      const now = new Date();
      const bufferTime = new Date(now.getTime() + BEDS24_CONFIG.TOKEN_REFRESH_BUFFER_MS);
      
      if (this.tokenExpiresAt > bufferTime) {
        return this.accessToken;
      }
    }

    // Need to refresh token
    if (!this.refreshToken) {
      throw new Beds24AuthenticationError('No refresh token available');
    }

    const response = await this.refreshAccessToken(this.refreshToken);
    this.accessToken = response.token;
    this.tokenExpiresAt = new Date(Date.now() + response.expiresIn * 1000);
    
    return this.accessToken;
  }

  /**
   * Exchange invite code for refresh token
   * This endpoint does NOT require authentication
   */
  async authenticate(inviteCode: string, deviceName?: string): Promise<RefreshTokenResponse> {
    if (!inviteCode || inviteCode.trim() === '') {
      throw new Beds24AuthenticationError('Invite code is required');
    }

    const headers: Record<string, string> = {
      code: inviteCode.trim(),
    };

    if (deviceName) {
      headers.deviceName = deviceName;
    }

      try {
      // Don't require auth for authentication endpoint
      const response = await this.makeRequest<any>(
        '/authentication/setup',
        {
          method: 'GET',
          headers,
        },
        false // requireAuth = false
      );

      // Handle different response formats
      // Beds24 may return: { refreshToken: "..." } or { token: "...", refreshToken: "..." }
      const refreshToken = response.refreshToken || response.token;
      
      if (!refreshToken) {
        console.error('Beds24 authentication response:', JSON.stringify(response, null, 2));
        throw new Beds24AuthenticationError(
          'Invalid response from Beds24: missing refresh token. Response: ' + JSON.stringify(response)
        );
      }

      this.refreshToken = refreshToken;
      return {
        refreshToken,
        expiresIn: response.expiresIn,
      };
    } catch (error) {
      // Provide more helpful error message for authentication failures
      if (error instanceof Beds24AuthenticationError) {
        throw new Beds24AuthenticationError(
          `Failed to authenticate with Beds24. Please check that your invite code is valid and not expired. ${error.message}`,
          error.originalError
        );
      }
      throw error;
    }
  }

  /**
   * Get access token from refresh token
   */
  async refreshAccessToken(refreshToken: string): Promise<AccessTokenResponse> {
    const response = await this.makeRequest<AccessTokenResponse>(
      '/authentication/token',
      {
        method: 'GET',
        headers: {
          refreshToken,
        },
      },
      false // Don't use access token for auth endpoint
    );

    return response;
  }

  /**
   * Get token details and diagnostics
   */
  async getTokenDetails(token?: string): Promise<TokenDetails> {
    const accessToken = token || await this.getAccessToken();
    
    return this.makeRequest<TokenDetails>(
      '/authentication/details',
      {
        method: 'GET',
        headers: {
          token: accessToken,
        },
      }
    );
  }

  /**
   * Make HTTP request to Beds24 API
   */
  async makeRequest<T>(
    endpoint: string,
    options: Beds24RequestOptions = {},
    requireAuth: boolean = true
  ): Promise<T> {
    // Check circuit breaker
    if (!this.circuitBreaker.canProceed()) {
      throw new Beds24CircuitBreakerError();
    }

    // Check rate limit
    if (!this.rateLimiter.tryConsume()) {
      const waitTime = this.rateLimiter.getTimeUntilNextToken();
      throw new Beds24RateLimitError(
        `Rate limit exceeded. Try again in ${Math.ceil(waitTime / 1000)} seconds.`,
        waitTime
      );
    }

    const url = `${BEDS24_CONFIG.BASE_URL}${endpoint}`;
    const method = options.method || 'GET';
    
    // Build headers - don't set Content-Type for GET requests without body
    const headers: Record<string, string> = {
      ...options.headers,
    };
    
    // Only set Content-Type if there's a body or it's a POST/PUT/PATCH
    if (options.body || (method !== 'GET' && method !== 'DELETE')) {
      headers['Content-Type'] = 'application/json';
    }

    // Add idempotency key header if provided
    if (options.idempotencyKey) {
      headers['X-Idempotency-Key'] = options.idempotencyKey;
    }

    // Add authentication header if required
    if (requireAuth) {
      const accessToken = await this.getAccessToken();
      headers.token = accessToken;
    }

    // Build query string
    let queryString = '';
    if (options.query) {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(options.query)) {
        if (value !== undefined && value !== null) {
          if (Array.isArray(value)) {
            value.forEach((v) => params.append(key, String(v)));
          } else {
            params.append(key, String(value));
          }
        }
      }
      queryString = params.toString();
    }

    const fullUrl = queryString ? `${url}?${queryString}` : url;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), BEDS24_CONFIG.REQUEST_TIMEOUT_MS);

      const response = await fetch(fullUrl, {
        method,
        headers,
        body: options.body ? JSON.stringify(options.body) : null,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Parse rate limit headers
      const rateLimitInfo = this.parseRateLimitHeaders(response.headers);

      // Handle non-2xx responses
      if (!response.ok) {
        let errorData: any;
        let errorText: string | undefined;
        try {
          const text = await response.text();
          errorText = text;
          if (text) {
            try {
              errorData = JSON.parse(text);
            } catch {
              // Not JSON, use text as message
              errorData = { message: text };
            }
          }
        } catch {
          // Failed to read response body
          errorText = response.statusText;
        }

        // Extract error message from various possible formats
        const errorMessage = 
          errorData?.error?.message || 
          errorData?.message || 
          errorData?.error || 
          errorText ||
          `HTTP ${response.status}: ${response.statusText}`;

        // Log full error details for debugging (especially for 400 validation errors)
        if (response.status === 400) {
          console.error('[Beds24Client] Validation error details:', {
            status: response.status,
            statusText: response.statusText,
            errorData,
            errorText,
            url: fullUrl,
            method,
            requestBody: options.body ? JSON.stringify(options.body, null, 2).substring(0, 1000) : undefined,
          });
        }

        const error = createBeds24Error(
          response.status,
          errorData?.error || { message: errorMessage },
          new Error(`HTTP ${response.status}: ${response.statusText}`)
        );

        // Record failure in circuit breaker
        if (response.status >= 500 || response.status === 429) {
          this.circuitBreaker.recordFailure();
        }

        throw error;
      }

      // Record success
      this.circuitBreaker.recordSuccess();

      // Parse response
      const data: Beds24ApiResponse<T> = await response.json();

      // Check for error in response (Beds24 returns success: false for errors)
      if (data.success === false || data.error) {
        const errorMessage = typeof data.error === 'string' 
          ? data.error 
          : (data.error as any)?.message || 'Unknown error';
        throw createBeds24Error(
          response.status,
          typeof data.error === 'object' ? data.error : { message: errorMessage },
          new Error(errorMessage)
        );
      }

      // Return data (could be T or Beds24ApiResponse<T>)
      // Handle both direct response and wrapped response
      if (data.data !== undefined) {
        return data.data as T;
      }
      return data as T;
    } catch (error) {
      // Handle network errors
      if (error instanceof Beds24Error) {
        throw error;
      }

      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new Beds24NetworkError('Request timeout', error);
        }
        throw new Beds24NetworkError(`Network error: ${error.message}`, error);
      }

      throw new Beds24NetworkError('Unknown network error');
    }
  }

  /**
   * Parse rate limit headers from response
   */
  private parseRateLimitHeaders(headers: Headers): Beds24RateLimitInfo | undefined {
    const limit = headers.get('X-FiveMinCreditLimit');
    const remaining = headers.get('X-FiveMinCreditLimit-Remaining');
    const resetsIn = headers.get('X-FiveMinCreditLimit-ResetsIn');
    const requestCost = headers.get('X-RequestCost');

    if (!limit || !remaining || !resetsIn) {
      return undefined;
    }

    return {
      limit: parseInt(limit, 10),
      remaining: parseInt(remaining, 10),
      resetsIn: parseInt(resetsIn, 10),
      requestCost: requestCost ? parseInt(requestCost, 10) : 1,
    };
  }

  /**
   * Get circuit breaker state (for monitoring)
   */
  getCircuitBreakerState(): CircuitState {
    return this.circuitBreaker.getState();
  }
}

