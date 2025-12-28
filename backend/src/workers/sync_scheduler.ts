import 'dotenv/config';
import crypto from 'crypto';
import db from '../config/database.js';
import { runPullSyncJob } from '../integrations/beds24/jobs/pull_sync_job.js';

/**
 * Sync Scheduler Worker
 * 
 * Runs scheduled pull syncs from Beds24 channel manager.
 * 
 * Features:
 * - Configurable sync interval (default: 1 minute)
 * - Database-based lock to prevent overlapping syncs
 * - Exponential backoff on errors (1min → 2min → 4min → max 15min)
 * - Tracks last successful sync for incremental syncs
 * - Graceful shutdown on SIGTERM/SIGINT
 * - Comprehensive logging
 */

// Configuration
const SYNC_INTERVAL_MS = parseInt(process.env.SYNC_INTERVAL_MS || '60000', 10); // Default: 1 minute
const MAX_BACKOFF_MS = 15 * 60 * 1000; // 15 minutes max backoff
const LOCK_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes - release stale locks
const SYNC_TYPE = 'beds24_pull';

let isShuttingDown = false;
let currentSyncId: string | null = null;
let syncTimer: NodeJS.Timeout | null = null;
let currentBackoffMs = SYNC_INTERVAL_MS;

/**
 * Generate a UUID using Node's crypto module
 */
function generateUuid(): string {
  return crypto.randomUUID();
}

/**
 * Acquire a database lock for the sync operation
 * Returns the sync ID if lock acquired, null if another sync is running
 */
async function acquireSyncLock(): Promise<string | null> {
  try {
    // Check for any running syncs that haven't timed out
    const runningSync = await db('sync_state')
      .where('sync_type', SYNC_TYPE)
      .where('status', 'running')
      .where('started_at', '>', new Date(Date.now() - LOCK_TIMEOUT_MS))
      .first();

    if (runningSync) {
      console.log(`[SYNC] ⏸️  Sync already running (ID: ${runningSync.id}, started: ${runningSync.started_at})`);
      return null;
    }

    // Mark stale running syncs as failed
    const staleCount = await db('sync_state')
      .where('sync_type', SYNC_TYPE)
      .where('status', 'running')
      .where('started_at', '<=', new Date(Date.now() - LOCK_TIMEOUT_MS))
      .update({
        status: 'failed',
        completed_at: new Date(),
        error_message: 'Sync timed out (stale lock released)',
      });

    if (staleCount > 0) {
      console.log(`[SYNC] 🧹 Released ${staleCount} stale sync lock(s)`);
    }

    // Create new sync record
    const syncId = generateUuid();
    await db('sync_state').insert({
      id: syncId,
      sync_type: SYNC_TYPE,
      status: 'running',
      started_at: new Date(),
    });

    return syncId;
  } catch (error) {
    console.error('[SYNC] ❌ Error acquiring sync lock:', error);
    return null;
  }
}

/**
 * Release the sync lock and record results
 */
async function releaseSyncLock(
  syncId: string,
  success: boolean,
  stats: {
    bookingsProcessed?: number;
    bookingsCreated?: number;
    bookingsUpdated?: number;
    bookingsFailed?: number;
    durationMs?: number;
    errorMessage?: string;
  }
): Promise<void> {
  try {
    const lastSuccessfulSync = success ? new Date() : undefined;

    await db('sync_state')
      .where('id', syncId)
      .update({
        status: success ? 'completed' : 'failed',
        completed_at: new Date(),
        last_successful_sync: lastSuccessfulSync,
        bookings_processed: stats.bookingsProcessed || 0,
        bookings_created: stats.bookingsCreated || 0,
        bookings_updated: stats.bookingsUpdated || 0,
        bookings_failed: stats.bookingsFailed || 0,
        duration_ms: stats.durationMs || 0,
        error_message: stats.errorMessage,
      });
  } catch (error) {
    console.error('[SYNC] ❌ Error releasing sync lock:', error);
  }
}

/**
 * Get the timestamp of the last successful sync
 */
async function getLastSuccessfulSync(): Promise<Date | null> {
  try {
    const lastSync = await db('sync_state')
      .where('sync_type', SYNC_TYPE)
      .where('status', 'completed')
      .orderBy('completed_at', 'desc')
      .first();

    return lastSync?.last_successful_sync || lastSync?.completed_at || null;
  } catch (error) {
    console.error('[SYNC] ❌ Error getting last sync:', error);
    return null;
  }
}

/**
 * Run a single sync operation
 */
async function runSync(): Promise<void> {
  if (isShuttingDown) {
    console.log('[SYNC] 🛑 Shutdown in progress, skipping sync');
    return;
  }

  const startTime = Date.now();
  console.log('[SYNC] ▶️  Starting scheduled sync...');

  // Acquire lock
  const syncId = await acquireSyncLock();
  if (!syncId) {
    scheduleNextSync(currentBackoffMs);
    return;
  }

  currentSyncId = syncId;

  try {
    // Run the actual sync job
    const result = await runPullSyncJob();
    const durationMs = Date.now() - startTime;

    if (result.success) {
      console.log(
        `[SYNC] ✅ Sync completed: ${result.bookingsSynced} bookings processed in ${durationMs}ms`
      );

      // Release lock with success
      await releaseSyncLock(syncId, true, {
        bookingsProcessed: result.bookingsPulled,
        bookingsUpdated: result.bookingsSynced,
        bookingsFailed: result.errors,
        durationMs,
      });

      // Reset backoff on success
      currentBackoffMs = SYNC_INTERVAL_MS;
    } else {
      console.error(`[SYNC] ❌ Sync failed: ${result.error}`);

      // Release lock with failure
      await releaseSyncLock(syncId, false, {
        bookingsProcessed: result.bookingsPulled,
        bookingsUpdated: result.bookingsSynced,
        bookingsFailed: result.errors,
        durationMs,
        errorMessage: result.error || 'Unknown error',
      });

      // Apply exponential backoff
      currentBackoffMs = Math.min(currentBackoffMs * 2, MAX_BACKOFF_MS);
      console.log(`[SYNC] ⏰ Next retry in ${currentBackoffMs / 1000}s (backoff)`);
    }
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[SYNC] ❌ Sync error:', errorMessage);

    // Release lock with failure
    await releaseSyncLock(syncId, false, {
      durationMs,
      errorMessage,
    });

    // Apply exponential backoff
    currentBackoffMs = Math.min(currentBackoffMs * 2, MAX_BACKOFF_MS);
    console.log(`[SYNC] ⏰ Next retry in ${currentBackoffMs / 1000}s (backoff)`);
  } finally {
    currentSyncId = null;
    scheduleNextSync(currentBackoffMs);
  }
}

/**
 * Schedule the next sync
 */
function scheduleNextSync(delayMs: number): void {
  if (isShuttingDown) {
    return;
  }

  syncTimer = setTimeout(() => {
    runSync();
  }, delayMs);
}

/**
 * Graceful shutdown handler
 */
async function shutdown(signal: string): Promise<void> {
  console.log(`\n[SYNC] 📴 Received ${signal}, shutting down gracefully...`);
  isShuttingDown = true;

  // Clear scheduled timer
  if (syncTimer) {
    clearTimeout(syncTimer);
    syncTimer = null;
  }

  // If a sync is running, mark it as interrupted
  if (currentSyncId) {
    console.log('[SYNC] ⏸️  Marking current sync as interrupted...');
    await releaseSyncLock(currentSyncId, false, {
      errorMessage: `Interrupted by ${signal}`,
    });
  }

  // Close database connection
  try {
    await db.destroy();
    console.log('[SYNC] 🔌 Database connection closed');
  } catch (error) {
    console.error('[SYNC] ❌ Error closing database:', error);
  }

  console.log('[SYNC] 👋 Sync scheduler stopped');
  process.exit(0);
}

/**
 * Cleanup old sync records (older than 7 days)
 */
async function cleanupOldRecords(): Promise<void> {
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const deletedCount = await db('sync_state')
      .where('created_at', '<', sevenDaysAgo)
      .where('status', '!=', 'running')
      .delete();

    if (deletedCount > 0) {
      console.log(`[SYNC] 🧹 Cleaned up ${deletedCount} old sync records`);
    }
  } catch (error) {
    console.error('[SYNC] ❌ Error cleaning up old records:', error);
  }
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  console.log('[SYNC] 🔄 Starting Beds24 sync scheduler...');
  console.log(`[SYNC] ⏰ Sync interval: ${SYNC_INTERVAL_MS}ms`);

  // Register shutdown handlers
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Cleanup old records on startup
  await cleanupOldRecords();

  // Get last successful sync info
  const lastSync = await getLastSuccessfulSync();
  if (lastSync) {
    console.log(`[SYNC] 📅 Last successful sync: ${lastSync.toISOString()}`);
  } else {
    console.log('[SYNC] 📅 No previous sync found, will do full sync');
  }

  // Start the first sync after a short delay
  console.log('[SYNC] ⏳ Starting first sync in 5 seconds...');
  scheduleNextSync(5000);
}

// Run the scheduler
main().catch((error) => {
  console.error('[SYNC] ❌ Fatal error:', error);
  process.exit(1);
});
