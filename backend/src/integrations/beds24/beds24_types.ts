/**
 * Type definitions for Beds24 API V2 integration
 */

// ============================================================================
// Authentication Types
// ============================================================================

export interface RefreshTokenResponse {
  refreshToken: string;
  expiresIn?: number;
}

export interface AccessTokenResponse {
  token: string;
  expiresIn: number; // seconds
  tokenType?: string;
}

export interface TokenDetails {
  token: string;
  scopes: string[];
  expiresIn: number;
  accountId?: number;
  propertyIds?: number[];
}

// ============================================================================
// Booking Types
// ============================================================================

export interface Beds24Guest {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  country?: string;
  address?: string;
  city?: string;
  zip?: string;
}

export interface Beds24Booking {
  id?: number;
  masterId?: number;
  propertyId: number;
  roomId: number;
  arrivalDate: string; // YYYY-MM-DD
  departureDate: string; // YYYY-MM-DD
  status: 'confirmed' | 'cancelled' | 'checkedin' | 'checkedout' | 'request' | 'new' | 'inquiry';
  price: number;
  currency?: string;
  source?: string;
  externalId?: string; // PMS reservation ID
  guest?: Beds24Guest;
  numberOfGuests?: number;
  specialRequests?: string;
  bookingTime?: string; // ISO 8601
  modified?: string; // ISO 8601
  channel?: string;
  apiReference?: string;
}

export interface Beds24BookingCreateRequest extends Omit<Beds24Booking, 'id' | 'masterId' | 'modified'> {
  // Same as Beds24Booking but without auto-generated fields
}

export interface Beds24BookingUpdateRequest extends Partial<Beds24BookingCreateRequest> {
  id: number;
}

// ============================================================================
// Calendar/Inventory Types
// ============================================================================

export interface Beds24CalendarDay {
  date: string; // YYYY-MM-DD
  numAvail?: number;
  minStay?: number;
  maxStay?: number;
  multiplier?: number;
  prices?: {
    [key: string]: number; // Channel-specific prices
  };
  override?: {
    numAvail?: number;
    minStay?: number;
    maxStay?: number;
  };
}

export interface Beds24CalendarRequest {
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  roomId?: number[];
  propertyId?: number[];
  includeNumAvail?: boolean;
  includeMinStay?: boolean;
  includeMaxStay?: boolean;
  includeMultiplier?: boolean;
  includeOverride?: boolean;
  includePrices?: boolean;
  includeLinkedPrices?: boolean;
  includeChannels?: boolean;
}

export interface Beds24CalendarResponse {
  type: 'calendar';
  data: {
    [roomId: string]: {
      [date: string]: Beds24CalendarDay;
    };
  };
  pages?: {
    current: number;
    total: number;
  };
}

export interface Beds24CalendarUpdate {
  roomId: number;
  startDate: string;
  endDate: string;
  data: {
    [date: string]: Partial<Beds24CalendarDay>;
  };
}

// ============================================================================
// Property & Room Types
// ============================================================================

export interface Beds24Property {
  id: number;
  name: string;
  address?: string;
  city?: string;
  country?: string;
  timezone?: string;
}

export interface Beds24Room {
  id: number;
  propertyId: number;
  name: string;
  type?: string;
  maxGuests?: number;
  numUnits?: number;
}

// ============================================================================
// API Request/Response Types
// ============================================================================

export interface Beds24ApiResponse<T = any> {
  success: boolean;
  type?: string;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
  pages?: {
    current: number;
    total: number;
  };
}

export interface Beds24RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  headers?: Record<string, string>;
  body?: any;
  query?: Record<string, string | number | boolean | (string | number)[] | undefined>;
  idempotencyKey?: string; // Idempotency key for deduplication
}

// ============================================================================
// Rate Limiting Types
// ============================================================================

export interface Beds24RateLimitHeaders {
  'X-FiveMinCreditLimit'?: string;
  'X-FiveMinCreditLimit-ResetsIn'?: string;
  'X-FiveMinCreditLimit-Remaining'?: string;
  'X-RequestCost'?: string;
}

export interface Beds24RateLimitInfo {
  limit: number;
  remaining: number;
  resetsIn: number; // seconds
  requestCost: number;
}

// ============================================================================
// Configuration Types
// ============================================================================

export interface Beds24Config {
  id: string;
  propertyId: string;
  refreshToken: string; // Decrypted
  accessToken?: string; // Decrypted
  tokenExpiresAt?: Date;
  beds24PropertyId: string;
  webhookSecret?: string;
  syncEnabled: boolean;
  pushSyncEnabled: boolean;
  pullSyncEnabled: boolean;
  webhookEnabled: boolean;
  lastSuccessfulSync?: Date;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// Error Types
// ============================================================================

export enum Beds24ErrorCode {
  AUTHENTICATION_ERROR = 'AUTHENTICATION_ERROR',
  RATE_LIMIT_ERROR = 'RATE_LIMIT_ERROR',
  NETWORK_ERROR = 'NETWORK_ERROR',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  API_ERROR = 'API_ERROR',
  CIRCUIT_BREAKER_OPEN = 'CIRCUIT_BREAKER_OPEN',
}

