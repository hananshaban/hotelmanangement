#!/usr/bin/env node

/**
 * QloApps Sync Scheduler
 *
 * Runs scheduled pull syncs from QloApps channel manager.
 *
 * Features:
 * - Configurable sync interval (default: 5 minutes)
 * - Database-based lock to prevent overlapping syncs
 * - Exponential backoff on errors (1min → 2min → 4min → max 15min)
 * - Tracks last successful sync for incremental syncs
 * - Graceful shutdown on SIGTERM/SIGINT
 * - Comprehensive logging
 * - Per-config sync support (multi-property)
 */

import 'dotenv/config';
import crypto from 'crypto';
import db from '../../../config/database.js';
import { QloAppsPullSyncService } from '../services/pull_sync_service.js';
import { QloAppsClient } from '../qloapps_client.js';
import { decrypt } from '../../../utils/encryption.js';

// ============================================================================
// Configuration
// ============================================================================

const SYNC_INTERVAL_MS = parseInt(process.env.QLOAPPS_SYNC_INTERVAL_MS || '300000', 10); // Default: 5 minutes
const MAX_BACKOFF_MS = 15 * 60 * 1000; // 15 minutes max backoff
const LOCK_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes - release stale locks
const SYNC_TYPE = 'qloapps_reservations_pull';

// ============================================================================
// Types
// ============================================================================

interface SyncResult {
  success: boolean;
  itemsProcessed: number;
  itemsCreated: number;
  itemsUpdated: number;
  itemsFailed: number;
  error?: string;
}

// ============================================================================
// State
// ============================================================================

let isShuttingDown = false;
let currentSyncId: string | null = null;
let syncTimer: NodeJS.Timeout | null = null;
let currentBackoffMs = SYNC_INTERVAL_MS;

// ============================================================================
// Lock Management
// ============================================================================

/**
 * Acquire a database lock for the sync operation
 * Returns the sync ID if lock acquired, null if another sync is running
 */
async function acquireSyncLock(configId: string, propertyId: string): Promise<string | null> {
  try {
    // Check for any running syncs of this type that haven't timed out
    const runningSync = await db('qloapps_sync_state')
      .where('sync_type', SYNC_TYPE)
      .where('status', 'running')
      .where('started_at', '>', new Date(Date.now() - LOCK_TIMEOUT_MS))
      .first();

    if (runningSync) {
      console.log(`[QloApps Sync] ⏸️  Sync already running (ID: ${runningSync.id})`);
      return null;
    }

    // Mark stale running syncs as failed
    const staleCount = await db('qloapps_sync_state')
      .where('sync_type', SYNC_TYPE)
      .where('status', 'running')
      .where('started_at', '<=', new Date(Date.now() - LOCK_TIMEOUT_MS))
      .update({
        status: 'failed',
        completed_at: new Date(),
        error_message: 'Sync timed out (stale lock released)',
      });

    if (staleCount > 0) {
      console.log(`[QloApps Sync] 🧹 Released ${staleCount} stale sync lock(s)`);
    }

    // Create new sync record
    const syncId = crypto.randomUUID();
    await db('qloapps_sync_state').insert({
      id: syncId,
      property_id: propertyId,
      sync_type: SYNC_TYPE,
      status: 'running',
      started_at: new Date(),
    });

    return syncId;
  } catch (error) {
    console.error(`[QloApps Sync] ❌ Error acquiring sync lock for config ${configId}:`, error);
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
    itemsProcessed?: number;
    itemsCreated?: number;
    itemsUpdated?: number;
    itemsFailed?: number;
    durationMs?: number;
    errorMessage?: string;
  }
): Promise<void> {
  try {
    const updateData: Record<string, unknown> = {
      status: success ? 'completed' : 'failed',
      completed_at: new Date(),
      reservations_processed: stats.itemsProcessed || 0,
      reservations_created: stats.itemsCreated || 0,
      reservations_updated: stats.itemsUpdated || 0,
      reservations_failed: stats.itemsFailed || 0,
      duration_ms: stats.durationMs || 0,
      error_message: stats.errorMessage,
    };

    if (success) {
      updateData.last_successful_sync = new Date();
    }

    await db('qloapps_sync_state')
      .where('id', syncId)
      .update(updateData);
  } catch (error) {
    console.error('[QloApps Sync] ❌ Error releasing sync lock:', error);
  }
}

// ============================================================================
// Sync Execution
// ============================================================================

/**
 * Get all enabled QloApps configurations
 */
async function getEnabledConfigs(): Promise<Array<{
  id: string;
  property_id: string;
  base_url: string;
  api_key_encrypted: string;
  qloapps_hotel_id: number;
  sync_interval_minutes: number;
  last_successful_sync: Date | null;
}>> {
  return db('qloapps_config')
    .where({ sync_enabled: true })
    .whereNotNull('api_key_encrypted')
    .select('id', 'property_id', 'base_url', 'api_key_encrypted', 'qloapps_hotel_id', 'sync_interval_minutes', 'last_successful_sync');
}

/**
 * Run sync for a single config
 */
async function runSyncForConfig(config: {
  id: string;
  property_id: string;
  base_url: string;
  api_key_encrypted: string;
  qloapps_hotel_id: number;
  last_successful_sync: Date | null;
}): Promise<{
  success: boolean;
  itemsProcessed: number;
  itemsCreated: number;
  itemsUpdated: number;
  itemsFailed: number;
  error?: string;
}> {
  const startTime = Date.now();
  console.log(`[QloApps Sync] ▶️  Starting sync for config ${config.id}...`);

  // Acquire lock
  const syncId = await acquireSyncLock(config.id, config.property_id);
  if (!syncId) {
    return {
      success: false,
      itemsProcessed: 0,
      itemsCreated: 0,
      itemsUpdated: 0,
      itemsFailed: 0,
      error: 'Could not acquire sync lock',
    };
  }

  currentSyncId = syncId;

  try {
    // Create client
    const apiKey = decrypt(config.api_key_encrypted);
    const client = new QloAppsClient({
      baseUrl: config.base_url,
      apiKey,
      hotelId: config.qloapps_hotel_id,
    });

    // Create sync service
    const syncService = new QloAppsPullSyncService(client, config.id, config.property_id, config.qloapps_hotel_id);

    // Determine sync type and run appropriate sync method
    let result;
    if (!config.last_successful_sync) {
      // First sync - do full 3-phase sync
      console.log(`[QloApps Sync] 🆕 First sync for config ${config.id}, running full 3-phase sync...`);
      result = await syncService.pullFullSync({ fullSync: true });
      
      const durationMs = Date.now() - startTime;
      
      console.log(
        `[QloApps Sync] ✅ Full sync complete for config ${config.id}: ` +
        `${result.reservations.created} created, ${result.reservations.updated} updated, ${result.reservations.failed} failed in ${durationMs}ms`
      );

      // Release lock
      await releaseSyncLock(syncId, result.success, {
        itemsProcessed: result.reservations.processed,
        itemsCreated: result.reservations.created,
        itemsUpdated: result.reservations.updated,
        itemsFailed: result.reservations.failed,
        durationMs,
      });

      // Update config
      if (result.success) {
        await db('qloapps_config')
          .where({ id: config.id })
          .update({
            last_successful_sync: new Date(),
            last_sync_error: null,
          });
      } else {
        await db('qloapps_config')
          .where({ id: config.id })
          .update({
            last_sync_error: result.error || 'Full sync failed',
          });
      }

      return {
        success: result.success,
        itemsProcessed: result.reservations.processed,
        itemsCreated: result.reservations.created,
        itemsUpdated: result.reservations.updated,
        itemsFailed: result.reservations.failed,
        error: result.error,
      };
    } else {
      // Incremental sync - still do 3-phase (room types, customers, bookings) to ensure mappings exist
      console.log(`[QloApps Sync] 🔄 Incremental sync for config ${config.id}...`);
      
      // Phase 1: Sync room types (to catch any new ones)
      console.log(`[QloApps Sync] 🏨 Phase 1: Syncing room types...`);
      const roomTypeResults = await syncService.roomTypeSyncService.pullRoomTypes();
      const roomTypesSynced = roomTypeResults.filter(r => r.success && (r.action === 'created' || r.action === 'mapped')).length;
      if (roomTypesSynced > 0) {
        console.log(`[QloApps Sync] ✓ Synced ${roomTypesSynced} new room types`);
      }

      // Phase 2: Sync customers (to catch any new ones)
      console.log(`[QloApps Sync] 👥 Phase 2: Syncing customers...`);
      const customerResults = await syncService.customerSyncService.pullCustomers({ updateExisting: false });
      const customersSynced = customerResults.filter(r => r.success && (r.action === 'created' || r.action === 'matched')).length;
      if (customersSynced > 0) {
        console.log(`[QloApps Sync] ✓ Synced ${customersSynced} new customers`);
      }

      // Phase 3: Sync bookings
      console.log(`[QloApps Sync] 📅 Phase 3: Syncing bookings...`);
      const syncOptions: Parameters<typeof syncService.pullBookings>[0] = {
        modifiedSince: config.last_successful_sync,
      };

      const bookings = await syncService.pullBookings(syncOptions);

      if (bookings.length === 0) {
        console.log(`[QloApps Sync] ℹ️  No new bookings to sync for config ${config.id}`);
        const durationMs = Date.now() - startTime;

        await releaseSyncLock(syncId, true, {
          itemsProcessed: 0,
          durationMs,
        });

        // Update last successful sync even if no bookings
        await db('qloapps_config')
          .where({ id: config.id })
          .update({
            last_successful_sync: new Date(),
            last_sync_error: null,
          });

        return {
          success: true,
          itemsProcessed: 0,
          itemsCreated: 0,
          itemsUpdated: 0,
          itemsFailed: 0,
        };
      }

      // Sync bookings to PMS
      const results = await syncService.syncBookingsToPms(bookings);

      const created = results.filter(r => r.action === 'created').length;
      const updated = results.filter(r => r.action === 'updated').length;
      const skipped = results.filter(r => r.action === 'skipped').length;
      const failed = results.filter(r => r.action === 'failed').length;
      const durationMs = Date.now() - startTime;

      console.log(
        `[QloApps Sync] ✅ Incremental sync complete for config ${config.id}: ` +
        `${created} created, ${updated} updated, ${skipped} skipped, ${failed} failed in ${durationMs}ms`
      );

      // Release lock
      await releaseSyncLock(syncId, failed === 0 || (created + updated) > 0, {
        itemsProcessed: bookings.length,
        itemsCreated: created,
        itemsUpdated: updated,
        itemsFailed: failed,
        durationMs,
      });

      // Update config
      if (failed === 0 || (created + updated) > 0) {
        await db('qloapps_config')
          .where({ id: config.id })
          .update({
            last_successful_sync: new Date(),
            last_sync_error: null,
          });
      }

      return {
        success: failed < bookings.length,
        itemsProcessed: bookings.length,
        itemsCreated: created,
        itemsUpdated: updated,
        itemsFailed: failed,
        error: failed > 0 ? `${failed} bookings failed to sync` : undefined,
      };
    }

  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    console.error(`[QloApps Sync] ❌ Sync failed for config ${config.id}:`, errorMessage);

    await releaseSyncLock(syncId, false, {
      durationMs,
      errorMessage,
    });

    // Update config with error
    await db('qloapps_config')
      .where({ id: config.id })
      .update({
        last_sync_error: errorMessage,
      });

    return {
      success: false,
      itemsProcessed: 0,
      itemsCreated: 0,
      itemsUpdated: 0,
      itemsFailed: 0,
      error: errorMessage,
    };
  } finally {
    currentSyncId = null;
  }
}

/**
 * Run sync for all enabled configs
 */
async function runSync(): Promise<void> {
  if (isShuttingDown) {
    console.log('[QloApps Sync] 🛑 Shutdown in progress, skipping sync');
    return;
  }

  console.log('[QloApps Sync] 🔄 Starting scheduled sync cycle...');

  try {
    // Get all enabled configs
    const configs = await getEnabledConfigs();

    if (configs.length === 0) {
      console.log('[QloApps Sync] ℹ️  No enabled QloApps configurations found');
      scheduleNextSync(SYNC_INTERVAL_MS);
      return;
    }

    console.log(`[QloApps Sync] Found ${configs.length} enabled configuration(s)`);

    let hasAnyFailure = false;

    // Sync each config
    for (const config of configs) {
      if (isShuttingDown) break;

      const result = await runSyncForConfig(config);
      if (!result.success) {
        hasAnyFailure = true;
      }
    }

    // Adjust backoff based on results
    if (hasAnyFailure) {
      currentBackoffMs = Math.min(currentBackoffMs * 2, MAX_BACKOFF_MS);
      console.log(`[QloApps Sync] ⏰ Some syncs failed, next retry in ${currentBackoffMs / 1000}s`);
    } else {
      currentBackoffMs = SYNC_INTERVAL_MS;
    }

    scheduleNextSync(currentBackoffMs);
  } catch (error) {
    console.error('[QloApps Sync] ❌ Error in sync cycle:', error);
    currentBackoffMs = Math.min(currentBackoffMs * 2, MAX_BACKOFF_MS);
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

// ============================================================================
// Cleanup
// ============================================================================

/**
 * Cleanup old sync state records (older than 7 days)
 */
async function cleanupOldRecords(): Promise<void> {
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    // Cleanup sync state
    const deletedStateCount = await db('qloapps_sync_state')
      .where('started_at', '<', sevenDaysAgo)
      .where('status', '!=', 'running')
      .delete();

    // Cleanup sync logs
    const deletedLogCount = await db('qloapps_sync_logs')
      .where('created_at', '<', sevenDaysAgo)
      .delete();

    if (deletedStateCount > 0 || deletedLogCount > 0) {
      console.log(
        `[QloApps Sync] 🧹 Cleaned up ${deletedStateCount} sync state records and ${deletedLogCount} sync logs`
      );
    }
  } catch (error) {
    console.error('[QloApps Sync] ❌ Error cleaning up old records:', error);
  }
}

// ============================================================================
// Shutdown
// ============================================================================

/**
 * Graceful shutdown handler
 */
async function shutdown(signal: string): Promise<void> {
  console.log(`\n[QloApps Sync] 📴 Received ${signal}, shutting down gracefully...`);
  isShuttingDown = true;

  // Clear scheduled timer
  if (syncTimer) {
    clearTimeout(syncTimer);
    syncTimer = null;
  }

  // If a sync is running, mark it as interrupted
  if (currentSyncId) {
    console.log('[QloApps Sync] ⏸️  Marking current sync as interrupted...');
    await releaseSyncLock(currentSyncId, false, {
      errorMessage: `Interrupted by ${signal}`,
    });
  }

  // Close database connection
  try {
    await db.destroy();
    console.log('[QloApps Sync] 🔌 Database connection closed');
  } catch (error) {
    console.error('[QloApps Sync] ❌ Error closing database:', error);
  }

  console.log('[QloApps Sync] 👋 Sync scheduler stopped');
  process.exit(0);
}

// ============================================================================
// Main Entry Point
// ============================================================================

/**
 * Main entry point
 */
async function main(): Promise<void> {
  console.log('[QloApps Sync] 🔄 Starting QloApps sync scheduler...');
  console.log(`[QloApps Sync] ⏰ Default sync interval: ${SYNC_INTERVAL_MS / 1000}s`);

  // Register shutdown handlers
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Cleanup old records on startup
  await cleanupOldRecords();

  // Check for enabled configs
  const configs = await getEnabledConfigs();
  console.log(`[QloApps Sync] 📋 Found ${configs.length} enabled QloApps configuration(s)`);

  for (const config of configs) {
    if (config.last_successful_sync) {
      console.log(`[QloApps Sync] 📅 Config ${config.id}: Last sync at ${config.last_successful_sync.toISOString()}`);
    } else {
      console.log(`[QloApps Sync] 📅 Config ${config.id}: No previous sync, will do full sync`);
    }
  }

  // Start the first sync after a short delay
  console.log('[QloApps Sync] ⏳ Starting first sync in 5 seconds...');
  scheduleNextSync(5000);
}

// ============================================================================
// Run Scheduler
// ============================================================================

main().catch((error) => {
  console.error('[QloApps Sync] ❌ Fatal error:', error);
  process.exit(1);
});
