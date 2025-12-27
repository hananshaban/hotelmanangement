/**
 * Types for sync operations and results
 */

export interface SyncResult {
  success: boolean;
  syncType: 'PUSH' | 'PULL' | 'WEBHOOK';
  entityType: 'reservation' | 'availability' | 'rate';
  entityId: string;
  beds24Id?: string; // Beds24 booking ID, room ID, etc.
  error?: string;
  errorCode?: string;
  retryCount?: number;
  syncedAt: Date;
}

export interface SyncOptions {
  retryOnFailure?: boolean;
  maxRetries?: number;
  priority?: number; // For queue priority
  idempotencyKey?: string; // Idempotency key for API calls
}

export interface BatchSyncResult {
  total: number;
  successful: number;
  failed: number;
  results: SyncResult[];
}

