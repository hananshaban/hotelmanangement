/**
 * QloApps Inbound Worker
 *
 * Consumes messages from the qloapps.inbound queue and processes
 * bookings from QloApps into the PMS.
 */

import {
  QloAppsBaseConsumer,
  type QloAppsMessageContext,
} from '../queue/rabbitmq_consumer_base.js';
import { QLOAPPS_QUEUE_NAMES, type QloAppsInboundMessage } from '../queue/rabbitmq_topology.js';
import { QloAppsPullSyncService } from '../services/pull_sync_service.js';
import { QloAppsClient } from '../qloapps_client.js';
import db from '../../../config/database.js';
import { decrypt } from '../../../utils/encryption.js';

// ============================================================================
// Inbound Worker
// ============================================================================

/**
 * Worker that processes inbound sync messages from QloApps
 */
export class QloAppsInboundWorker extends QloAppsBaseConsumer {
  constructor() {
    super(QLOAPPS_QUEUE_NAMES.INBOUND, {
      prefetch: 1,
      maxRetries: 3,
      retryDelayMs: 2000,
    });
  }

  /**
   * Process an inbound message
   */
  protected async processMessage(context: QloAppsMessageContext): Promise<void> {
    const message = context.content as QloAppsInboundMessage;
    const { eventType, configId, syncType, qloAppsBookingId } = message;

    console.log(`[QloApps Inbound] Processing ${eventType} for config ${configId}`);

    // Get QloApps configuration
    const config = await db('qloapps_config')
      .where({ id: configId })
      .first();

    if (!config) {
      throw new Error(`QloApps config not found: ${configId}`);
    }

    if (!config.sync_enabled) {
      console.log(`[QloApps Inbound] Sync disabled for config ${configId}, skipping`);
      return;
    }

    // Create client
    const apiKey = decrypt(config.api_key_encrypted);
    const client = new QloAppsClient({
      baseUrl: config.base_url,
      apiKey,
      hotelId: config.qloapps_hotel_id,
    });

    // Create sync service
    const syncService = new QloAppsPullSyncService(client, configId);

    // Process based on event type
    switch (eventType) {
      case 'booking.sync':
        await this.handleFullOrIncrementalSync(syncService, syncType, config);
        break;

      case 'booking.created':
      case 'booking.updated':
        if (qloAppsBookingId) {
          await this.handleSingleBookingSync(syncService, qloAppsBookingId, 'update');
        } else {
          // Fallback to incremental sync if no booking ID
          await this.handleFullOrIncrementalSync(syncService, 'incremental', config);
        }
        break;

      case 'booking.cancelled':
        if (qloAppsBookingId) {
          await this.handleSingleBookingSync(syncService, qloAppsBookingId, 'cancel');
        }
        break;

      default:
        console.warn(`[QloApps Inbound] Unknown event type: ${eventType}`);
    }
  }

  /**
   * Handle full or incremental sync
   */
  private async handleFullOrIncrementalSync(
    syncService: QloAppsPullSyncService,
    syncType: 'full' | 'incremental',
    config: { id: string; last_successful_sync: Date | null }
  ): Promise<void> {
    console.log(`[QloApps Inbound] Running ${syncType} sync...`);

    // Build options object conditionally for exactOptionalPropertyTypes
    const options: Parameters<typeof syncService.pullBookings>[0] = {};
    if (syncType === 'full') {
      options.fullSync = true;
    } else if (config.last_successful_sync) {
      options.modifiedSince = config.last_successful_sync;
    }

    // Pull bookings from QloApps
    const bookings = await syncService.pullBookings(options);

    if (bookings.length === 0) {
      console.log(`[QloApps Inbound] No new bookings to sync`);
      return;
    }

    // Sync bookings to PMS
    const results = await syncService.syncBookingsToPms(bookings);

    // Log results
    const created = results.filter(r => r.action === 'created').length;
    const updated = results.filter(r => r.action === 'updated').length;
    const skipped = results.filter(r => r.action === 'skipped').length;
    const failed = results.filter(r => r.action === 'failed').length;

    console.log(
      `[QloApps Inbound] Sync complete: ${created} created, ${updated} updated, ${skipped} skipped, ${failed} failed`
    );

    // Update last successful sync timestamp
    if (failed === 0 || (created + updated) > 0) {
      await db('qloapps_config')
        .where({ id: config.id })
        .update({
          last_successful_sync: new Date(),
          consecutive_failures: 0,
          last_sync_error: null,
        });
    }

    // If any failures, throw to trigger retry for those
    if (failed > 0 && failed === results.length) {
      const errors = results
        .filter(r => r.error)
        .map(r => r.error)
        .slice(0, 3);
      throw new Error(`All bookings failed to sync: ${errors.join('; ')}`);
    }
  }

  /**
   * Handle sync of a single booking
   */
  private async handleSingleBookingSync(
    syncService: QloAppsPullSyncService,
    bookingId: number,
    action: 'update' | 'cancel'
  ): Promise<void> {
    console.log(`[QloApps Inbound] Syncing single booking ${bookingId} (${action})`);

    // Pull specific booking
    const bookings = await syncService.pullBookings({
      limit: 1,
    });

    // Find the specific booking
    const booking = bookings.find(b => b.id === bookingId);

    if (!booking) {
      console.warn(`[QloApps Inbound] Booking ${bookingId} not found in QloApps`);
      return;
    }

    // Sync to PMS
    const results = await syncService.syncBookingsToPms([booking]);
    const result = results[0];

    if (result && !result.success) {
      throw new Error(`Failed to sync booking ${bookingId}: ${result.error}`);
    }

    console.log(`[QloApps Inbound] Successfully synced booking ${bookingId}`);
  }
}

// ============================================================================
// Worker Factory Functions
// ============================================================================

/**
 * Start the inbound worker
 */
export async function startQloAppsInboundWorker(): Promise<QloAppsInboundWorker> {
  const worker = new QloAppsInboundWorker();
  await worker.start();
  console.log('[QloApps Inbound] Worker started');
  return worker;
}

/**
 * Stop the inbound worker
 */
export async function stopQloAppsInboundWorker(worker: QloAppsInboundWorker): Promise<void> {
  await worker.stop();
  console.log('[QloApps Inbound] Worker stopped');
}
