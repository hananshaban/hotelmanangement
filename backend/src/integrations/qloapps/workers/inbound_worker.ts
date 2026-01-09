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
import { syncStateRepository } from '../../../services/qloapps/qloapps_repository.js';

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
    const { eventType, configId, syncType, qloAppsBookingId, syncStateId } = message as any;

    // Log comprehensive request details
    console.log(`[QloApps Inbound] ========================================`);
    console.log(`[QloApps Inbound] 🔄 NEW REQUEST RECEIVED`);
    console.log(`[QloApps Inbound] ========================================`);

    // Log message metadata
    console.log(`[QloApps Inbound] 📋 Message Details:`);
    console.log(`[QloApps Inbound]   Message ID: ${(message as any).messageId || 'N/A'}`);
    console.log(`[QloApps Inbound]   Timestamp: ${(message as any).timestamp || new Date().toISOString()}`);
    console.log(`[QloApps Inbound]   Retry Count: ${(message as any).retryCount || 0}`);

    // Log RabbitMQ context
    console.log(`[QloApps Inbound] 📨 RabbitMQ Context:`);
    console.log(`[QloApps Inbound]   Delivery Tag: ${context.deliveryTag || 'N/A'}`);
    console.log(`[QloApps Inbound]   Redelivered: ${context.redelivered || false}`);
    console.log(`[QloApps Inbound]   Exchange: ${context.exchange || 'N/A'}`);
    console.log(`[QloApps Inbound]   Routing Key: ${context.routingKey || 'N/A'}`);
    console.log(`[QloApps Inbound]   Consumer Tag: ${context.consumerTag || 'N/A'}`);

    // Log message content
    console.log(`[QloApps Inbound] 📝 Message Content:`);
    console.log(`[QloApps Inbound]   Event Type: ${eventType}`);
    console.log(`[QloApps Inbound]   Config ID: ${configId}`);
    console.log(`[QloApps Inbound]   Sync Type: ${syncType}`);
    if (syncStateId) {
      console.log(`[QloApps Inbound]   Sync State ID: ${syncStateId}`);
    }
    if (qloAppsBookingId) {
      console.log(`[QloApps Inbound]   QloApps Booking ID: ${qloAppsBookingId}`);
    }

    console.log(`[QloApps Inbound] 🚀 Starting Processing...`);
    const startTime = Date.now();

    try {
      // Get QloApps configuration
      console.log(`[QloApps Inbound] 🔍 Fetching configuration from database...`);
      console.log(`[QloApps Inbound]   Query: SELECT * FROM qloapps_config WHERE id = '${configId}'`);

      const configStart = Date.now();
      const config = await db('qloapps_config')
        .where({ id: configId })
        .first();
      const configDuration = Date.now() - configStart;

      if (!config) {
        console.error(`[QloApps Inbound] ❌ Configuration not found: ${configId}`);
        console.log(`[QloApps Inbound] 📊 Database query completed in ${configDuration}ms`);
        throw new Error(`QloApps config not found: ${configId}`);
      }

      console.log(`[QloApps Inbound] ✓ Configuration found (${configDuration}ms)`);
      console.log(`[QloApps Inbound]   Base URL: ${config.base_url}`);
      console.log(`[QloApps Inbound]   Property ID: ${config.property_id}`);
      console.log(`[QloApps Inbound]   Hotel ID: ${config.qloapps_hotel_id}`);
      console.log(`[QloApps Inbound]   Sync Enabled: ${config.sync_enabled}`);
      console.log(`[QloApps Inbound]   Last Sync: ${config.last_successful_sync || 'Never'}`);

      if (!config.sync_enabled) {
        console.log(`[QloApps Inbound] ⚠️  Sync disabled for config ${configId}, skipping request`);
        return;
      }

      // Create client
      console.log(`[QloApps Inbound] 🔧 Creating QloApps API client...`);
      const apiKey = decrypt(config.api_key_encrypted);
      const client = new QloAppsClient({
        baseUrl: config.base_url,
        apiKey,
        hotelId: config.qloapps_hotel_id,
      });
      console.log(`[QloApps Inbound] ✓ API client created`);

      // Create sync service
      console.log(`[QloApps Inbound] 🔧 Creating pull sync service...`);
      const syncService = new QloAppsPullSyncService(client, configId, config.property_id, config.qloapps_hotel_id);
      console.log(`[QloApps Inbound] ✓ Pull sync service created`);

      // Process based on event type
      console.log(`[QloApps Inbound] 🎯 Processing event: ${eventType}`);
      console.log(`[QloApps Inbound] 📊 Processing Details:`);

      let syncResult;
      const processingStart = Date.now();

      switch (eventType) {
        case 'booking.sync':
          console.log(`[QloApps Inbound]   Operation: Full/Incremental Sync`);
          console.log(`[QloApps Inbound]   Sync Type: ${syncType}`);
          console.log(`[QloApps Inbound]   Has Sync State: ${!!syncStateId}`);
          syncResult = await this.handleFullOrIncrementalSync(syncService, syncType, config, syncStateId);
          break;

        case 'booking.created':
        case 'booking.updated':
          console.log(`[QloApps Inbound]   Operation: Single Booking Update`);
          console.log(`[QloApps Inbound]   Booking ID: ${qloAppsBookingId || 'N/A (will fallback to incremental)'}`);
          console.log(`[QloApps Inbound]   Action: update`);
          if (qloAppsBookingId) {
            syncResult = await this.handleSingleBookingSync(syncService, qloAppsBookingId, 'update');
          } else {
            console.log(`[QloApps Inbound]   ⚠️  No booking ID provided, falling back to incremental sync`);
            syncResult = await this.handleFullOrIncrementalSync(syncService, 'incremental', config, syncStateId);
          }
          break;

        case 'booking.cancelled':
          console.log(`[QloApps Inbound]   Operation: Single Booking Cancellation`);
          console.log(`[QloApps Inbound]   Booking ID: ${qloAppsBookingId || 'N/A'}`);
          console.log(`[QloApps Inbound]   Action: cancel`);
          if (qloAppsBookingId) {
            syncResult = await this.handleSingleBookingSync(syncService, qloAppsBookingId, 'cancel');
          } else {
            console.log(`[QloApps Inbound]   ❌ No booking ID provided for cancellation, skipping`);
          }
          break;

        default:
          console.warn(`[QloApps Inbound] ⚠️  Unknown event type: ${eventType}`);
          console.log(`[QloApps Inbound] 📋 Supported event types: booking.sync, booking.created, booking.updated, booking.cancelled`);
          return;
      }

      const processingDuration = Date.now() - processingStart;
      console.log(`[QloApps Inbound] ✓ Event processing completed in ${processingDuration}ms`);

      const duration = Date.now() - startTime;
      console.log(`[QloApps Inbound] ========================================`);
      console.log(`[QloApps Inbound] ✅ REQUEST COMPLETED SUCCESSFULLY`);
      console.log(`[QloApps Inbound] ========================================`);
      console.log(`[QloApps Inbound] 📈 Final Results:`);
      console.log(`[QloApps Inbound]   Total Duration: ${duration}ms`);
      console.log(`[QloApps Inbound]   Created: ${syncResult?.created || 0}`);
      console.log(`[QloApps Inbound]   Updated: ${syncResult?.updated || 0}`);
      console.log(`[QloApps Inbound]   Skipped: ${syncResult?.skipped || 0}`);
      console.log(`[QloApps Inbound]   Failed: ${syncResult?.failed || 0}`);
      console.log(`[QloApps Inbound]   Total Processed: ${syncResult?.total || 0}`);

      // Update sync state to completed if we have a syncStateId
      if (syncStateId) {
        console.log(`[QloApps Inbound] 💾 Updating sync state...`);
        console.log(`[QloApps Inbound]   Sync State ID: ${syncStateId}`);
        console.log(`[QloApps Inbound]   Status: completed`);

        const syncStateStart = Date.now();

        // For full sync, we need to get the full sync result to update all 3 phases
        // For now, just update with booking results (full sync already updates state internally)
        if (syncType !== 'full') {
          console.log(`[QloApps Inbound]   Updating repository with booking results...`);
          await syncStateRepository.completeSync(syncStateId, {
            itemsProcessed: syncResult?.total || 0,
            itemsCreated: syncResult?.created || 0,
            itemsUpdated: syncResult?.updated || 0,
            itemsFailed: syncResult?.failed || 0,
          });
        } else {
          console.log(`[QloApps Inbound]   Full sync - state already updated internally`);
        }

        const syncStateDuration = Date.now() - syncStateStart;
        console.log(`[QloApps Inbound] ✓ Sync state updated (${syncStateDuration}ms)`);
      } else {
        console.log(`[QloApps Inbound] ⚠️  No sync state ID provided - sync state not updated`);
      }

      console.log(`[QloApps Inbound] 🎉 Request processing complete`);
      console.log(`[QloApps Inbound] ========================================\n`);
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      console.log(`[QloApps Inbound] ========================================`);
      console.log(`[QloApps Inbound] ❌ REQUEST FAILED`);
      console.log(`[QloApps Inbound] ========================================`);
      console.log(`[QloApps Inbound] 📈 Failure Summary:`);
      console.log(`[QloApps Inbound]   Duration: ${duration}ms`);
      console.log(`[QloApps Inbound]   Event Type: ${eventType}`);
      console.log(`[QloApps Inbound]   Config ID: ${configId}`);
      console.log(`[QloApps Inbound]   Message ID: ${(message as any).messageId || 'N/A'}`);
      console.log(`[QloApps Inbound]   Error Type: ${error instanceof Error ? error.constructor.name : typeof error}`);
      console.log(`[QloApps Inbound]   Error Message: ${errorMessage}`);

      // Log error stack if available
      if (error instanceof Error && error.stack) {
        console.log(`[QloApps Inbound] 📋 Error Stack:`);
        console.log(error.stack);
      }

      // Update sync state to failed if we have a syncStateId
      if (syncStateId) {
        console.log(`[QloApps Inbound] 💾 Updating sync state to failed...`);
        console.log(`[QloApps Inbound]   Sync State ID: ${syncStateId}`);
        console.log(`[QloApps Inbound]   Error Message: ${errorMessage}`);

        const syncStateStart = Date.now();
        try {
          await syncStateRepository.failSync(syncStateId, errorMessage);
          const syncStateDuration = Date.now() - syncStateStart;
          console.log(`[QloApps Inbound] ✓ Sync state updated to failed (${syncStateDuration}ms)`);
        } catch (updateError) {
          console.error(`[QloApps Inbound] ❌ Failed to update sync state:`, updateError);
          console.log(`[QloApps Inbound]   Update Error: ${updateError instanceof Error ? updateError.message : 'Unknown'}`);
        }
      } else {
        console.log(`[QloApps Inbound] ⚠️  No sync state ID provided - sync state not updated`);
      }

      console.log(`[QloApps Inbound] 💥 Request processing failed - throwing error`);
      console.log(`[QloApps Inbound] ========================================\n`);
      throw error;
    }
  }

  /**
   * Handle full or incremental sync
   */
  private async handleFullOrIncrementalSync(
    syncService: QloAppsPullSyncService,
    syncType: 'full' | 'incremental',
    config: { id: string; last_successful_sync: Date | null },
    syncStateId?: string
  ): Promise<{ created: number; updated: number; skipped: number; failed: number; total: number }> {
    console.log(`[QloApps Inbound] 🔄 Starting ${syncType} sync operation`);
    console.log(`[QloApps Inbound] 📋 Sync Configuration:`);
    console.log(`[QloApps Inbound]   Config ID: ${config.id}`);
    console.log(`[QloApps Inbound]   Last Successful Sync: ${config.last_successful_sync || 'Never'}`);
    console.log(`[QloApps Inbound]   Sync State ID: ${syncStateId || 'None'}`);

    const syncOperationStart = Date.now();

    // For full sync, use the new 3-phase sync
    if (syncType === 'full') {
      console.log(`[QloApps Inbound] 🎯 Mode: FULL SYNC`);
      console.log(`[QloApps Inbound] 📋 3-Phase Process: Room Types → Customers → Reservations`);

      console.log(`[QloApps Inbound] 🚀 Phase 1: Executing full sync...`);
      const fullSyncStart = Date.now();
      const fullSyncResult = await syncService.pullFullSync({ fullSync: true });
      const fullSyncDuration = Date.now() - fullSyncStart;

      console.log(`[QloApps Inbound] ✓ Full sync completed in ${fullSyncDuration}ms`);
      console.log(`[QloApps Inbound] 📊 Full Sync Results:`);
      console.log(`[QloApps Inbound]   Room Types - Processed: ${fullSyncResult.roomTypes.processed}, Synced: ${fullSyncResult.roomTypes.synced}, Failed: ${fullSyncResult.roomTypes.failed}`);
      console.log(`[QloApps Inbound]   Customers - Processed: ${fullSyncResult.customers.processed}, Synced: ${fullSyncResult.customers.synced}, Failed: ${fullSyncResult.customers.failed}`);
      console.log(`[QloApps Inbound]   Reservations - Processed: ${fullSyncResult.reservations.processed}, Created: ${fullSyncResult.reservations.created}, Updated: ${fullSyncResult.reservations.updated}, Failed: ${fullSyncResult.reservations.failed}`);
      console.log(`[QloApps Inbound]   Overall Success: ${fullSyncResult.success}`);

      // Update sync state with all 3 phases
      if (syncStateId) {
        await syncStateRepository.completeFullSync(syncStateId, {
          roomTypes: fullSyncResult.roomTypes,
          customers: fullSyncResult.customers,
          reservations: fullSyncResult.reservations,
        });
        console.log(`[QloApps Inbound] ✓ Sync state ${syncStateId} updated with 3-phase results.`);
      }

      // Update config last successful sync
      if (fullSyncResult.success) {
        await db('qloapps_config')
          .where({ id: config.id })
          .update({
            last_successful_sync: new Date(),
            last_sync_error: null,
          });
        console.log(`[QloApps Inbound] ✓ QloApps config ${config.id} last successful sync updated.`);
      } else {
        await db('qloapps_config')
          .where({ id: config.id })
          .update({
            last_sync_error: fullSyncResult.error || 'Full sync failed',
          });
        console.log(`[QloApps Inbound] ✗ QloApps config ${config.id} last sync error updated.`);
      }

      if (!fullSyncResult.success) {
        throw new Error(fullSyncResult.error || 'Full sync failed');
      }

      // Return aggregated results in the expected format
      return {
        created: fullSyncResult.reservations.created,
        updated: fullSyncResult.reservations.updated,
        skipped: 0,
        failed: fullSyncResult.reservations.failed,
        total: fullSyncResult.reservations.processed,
      };
    }

    // For incremental sync, sync room types, customers, then bookings
    console.log(`[QloApps Inbound] 🎯 Mode: INCREMENTAL SYNC`);
    console.log(`[QloApps Inbound] 📋 3-Phase Process: Room Types → Customers → Bookings`);

    // Step 1: Sync room types first to ensure mappings exist
    console.log(`[QloApps Inbound] 🏨 Step 1: Syncing room types...`);
    const roomTypeStart = Date.now();
    const roomTypeResults = await syncService.roomTypeSyncService.pullRoomTypes();
    const roomTypeDuration = Date.now() - roomTypeStart;
    const roomTypesProcessed = roomTypeResults.length;
    const roomTypesSynced = roomTypeResults.filter(r => r.success && (r.action === 'created' || r.action === 'mapped')).length;
    const roomTypesFailed = roomTypeResults.filter(r => !r.success).length;

    console.log(`[QloApps Inbound] ✓ Room types synced in ${roomTypeDuration}ms`);
    console.log(`[QloApps Inbound]   Processed: ${roomTypesProcessed}, Synced: ${roomTypesSynced}, Failed: ${roomTypesFailed}`);

    // Step 2: Sync customers to ensure guest mappings exist
    console.log(`[QloApps Inbound] 👥 Step 2: Syncing customers...`);
    const customerStart = Date.now();
    const customerResults = await syncService.customerSyncService.pullCustomers({
      updateExisting: false,
    });
    const customerDuration = Date.now() - customerStart;
    const customersProcessed = customerResults.length;
    const customersSynced = customerResults.filter(r => r.success && (r.action === 'created' || r.action === 'matched')).length;
    const customersFailed = customerResults.filter(r => !r.success).length;

    console.log(`[QloApps Inbound] ✓ Customers synced in ${customerDuration}ms`);
    console.log(`[QloApps Inbound]   Processed: ${customersProcessed}, Synced: ${customersSynced}, Failed: ${customersFailed}`);

    // Step 3: Sync bookings
    const options: Parameters<typeof syncService.pullBookings>[0] = {};

    // Calculate date range: from last month to coming year
    const now = new Date();
    const lastMonth = new Date(now);
    lastMonth.setMonth(now.getMonth() - 1);
    const comingYear = new Date(now);
    comingYear.setFullYear(now.getFullYear() + 1);

    options.dateFrom = lastMonth.toISOString().split('T')[0]; // YYYY-MM-DD format (last month)
    options.dateTo = comingYear.toISOString().split('T')[0]; // YYYY-MM-DD format

    console.log(`[QloApps Inbound] 📅 Date Range: ${options.dateFrom} to ${options.dateTo}`);
    console.log(`[QloApps Inbound] 📋 Syncing bookings from last month (${lastMonth.toISOString().split('T')[0]}) to coming year (${comingYear.toISOString().split('T')[0]})`);

    // Also set modifiedSince for backward compatibility if needed
    if (config.last_successful_sync) {
      options.modifiedSince = config.last_successful_sync;
      console.log(`[QloApps Inbound] ⏰ Modified Since (fallback): ${config.last_successful_sync.toISOString()}`);
    }

    // Pull bookings from QloApps
    console.log(`[QloApps Inbound] 🔄 Step 3: Fetching bookings from QloApps API...`);
    console.log(`[QloApps Inbound]   Date Range: ${options.dateFrom || 'All'} to ${options.dateTo || 'All'}`);
    if (options.modifiedSince) {
      console.log(`[QloApps Inbound]   Modified Since: ${options.modifiedSince.toISOString()}`);
    }
    const fetchStart = Date.now();
    const bookings = await syncService.pullBookings(options);
    const fetchDuration = Date.now() - fetchStart;

    console.log(`[QloApps Inbound] ✓ Bookings fetched in ${fetchDuration}ms`);
    console.log(`[QloApps Inbound]   Count: ${bookings.length}`);

    if (bookings.length === 0) {
      console.log(`[QloApps Inbound] ℹ️  No new bookings to sync`);
      return { created: 0, updated: 0, skipped: 0, failed: 0, total: 0 };
    }

    // Sync bookings to PMS
    console.log(`[QloApps Inbound] Syncing ${bookings.length} booking(s) to PMS...`);
    const results = await syncService.syncBookingsToPms(bookings);

    // Log results
    const created = results.filter(r => r.action === 'created').length;
    const updated = results.filter(r => r.action === 'updated').length;
    const skipped = results.filter(r => r.action === 'skipped').length;
    const failed = results.filter(r => r.action === 'failed').length;

    console.log(`[QloApps Inbound] 📊 Sync results:`);
    console.log(`[QloApps Inbound]   ✓ Created: ${created}`);
    console.log(`[QloApps Inbound]   ✓ Updated: ${updated}`);
    console.log(`[QloApps Inbound]   ⊘ Skipped: ${skipped}`);
    console.log(`[QloApps Inbound]   ✗ Failed: ${failed}`);

    // Log details of failed bookings
    if (failed > 0) {
      console.log(`[QloApps Inbound] ⚠️  Failed booking details:`);
      results
        .filter(r => r.action === 'failed')
        .forEach(r => {
          console.log(`[QloApps Inbound]   - Booking ${r.qloAppsBookingId}: ${r.error}`);
        });
    }

    // Log details of skipped bookings
    if (skipped > 0) {
      console.log(`[QloApps Inbound] ℹ️  Skipped booking details:`);
      results
        .filter(r => r.action === 'skipped')
        .slice(0, 5) // Limit to first 5
        .forEach(r => {
          console.log(`[QloApps Inbound]   - Booking ${r.qloAppsBookingId}: ${r.error}`);
        });
      if (skipped > 5) {
        console.log(`[QloApps Inbound]   ... and ${skipped - 5} more`);
      }
    }

    // Update last successful sync timestamp
    const shouldUpdateTimestamp = failed === 0 || (created + updated) > 0;
    console.log(`[QloApps Inbound] 💾 Database Update Check:`);
    console.log(`[QloApps Inbound]   Should Update Timestamp: ${shouldUpdateTimestamp}`);
    console.log(`[QloApps Inbound]   Reason: ${failed === 0 ? 'No failures' : `${created + updated} items created/updated`}`);

    if (shouldUpdateTimestamp) {
      console.log(`[QloApps Inbound] 🔄 Updating configuration last successful sync...`);
      console.log(`[QloApps Inbound]   Config ID: ${config.id}`);
      console.log(`[QloApps Inbound]   New Timestamp: ${new Date().toISOString()}`);
      console.log(`[QloApps Inbound]   Clearing last sync error`);

      const dbUpdateStart = Date.now();
      await db('qloapps_config')
        .where({ id: config.id })
        .update({
          last_successful_sync: new Date(),
          last_sync_error: null,
        });
      const dbUpdateDuration = Date.now() - dbUpdateStart;

      console.log(`[QloApps Inbound] ✓ Configuration updated in ${dbUpdateDuration}ms`);
    } else {
      console.log(`[QloApps Inbound] ⏭️  Skipping timestamp update due to failures`);
    }

    // If any failures, throw to trigger retry for those
    if (failed > 0 && failed === results.length) {
      const errors = results
        .filter(r => r.error)
        .map(r => r.error)
        .slice(0, 3);
      throw new Error(`All bookings failed to sync: ${errors.join('; ')}`);
    }

    return { created, updated, skipped, failed, total: bookings.length };
  }

  /**
   * Handle sync of a single booking
   */
  private async handleSingleBookingSync(
    syncService: QloAppsPullSyncService,
    bookingId: number,
    action: 'update' | 'cancel'
  ): Promise<{ created: number; updated: number; skipped: number; failed: number; total: number }> {
    console.log(`[QloApps Inbound] 🔄 Single Booking Operation`);
    console.log(`[QloApps Inbound] 📋 Operation Details:`);
    console.log(`[QloApps Inbound]   Booking ID: ${bookingId}`);
    console.log(`[QloApps Inbound]   Action: ${action}`);

    const singleBookingStart = Date.now();

    // Sync room types first to ensure mappings exist (in case new room types were added)
    console.log(`[QloApps Inbound] 🏨 Pre-check: Syncing room types...`);
    const roomTypeResults = await syncService.roomTypeSyncService.pullRoomTypes();
    const roomTypesSynced = roomTypeResults.filter(r => r.success && (r.action === 'created' || r.action === 'mapped')).length;
    if (roomTypesSynced > 0) {
      console.log(`[QloApps Inbound] ✓ Synced ${roomTypesSynced} new room types`);
    }

    // Pull specific booking
    console.log(`[QloApps Inbound] 🔍 Step 1: Fetching booking ${bookingId} from QloApps API...`);
    const fetchStart = Date.now();
    const bookings = await syncService.pullBookings({
      limit: 1,
    });
    const fetchDuration = Date.now() - fetchStart;

    console.log(`[QloApps Inbound] ✓ Booking fetch completed in ${fetchDuration}ms`);
    console.log(`[QloApps Inbound]   Returned bookings: ${bookings.length}`);

    // Find the specific booking
    const booking = bookings.find(b => b.id === bookingId);

    if (!booking) {
      console.warn(`[QloApps Inbound] ⚠️  Target booking ${bookingId} not found in QloApps response`);
      console.log(`[QloApps Inbound] 📊 Available booking IDs: ${bookings.map(b => b.id).join(', ')}`);
      return { created: 0, updated: 0, skipped: 1, failed: 0, total: 1 };
    }

    console.log(`[QloApps Inbound] ✓ Target booking found`);
    console.log(`[QloApps Inbound]   Booking Status: ${booking.booking_status}`);
    console.log(`[QloApps Inbound]   Customer: ${booking.customer_detail?.firstname} ${booking.customer_detail?.lastname}`);
    console.log(`[QloApps Inbound]   Room Types: ${booking.room_types?.length || 0}`);

    // Sync to PMS
    console.log(`[QloApps Inbound] 🔄 Step 2: Syncing booking to PMS...`);
    const syncStart = Date.now();
    const results = await syncService.syncBookingsToPms([booking]);
    const syncDuration = Date.now() - syncStart;
    const result = results[0];

    console.log(`[QloApps Inbound] ✓ PMS sync completed in ${syncDuration}ms`);

    if (result && !result.success) {
      console.error(`[QloApps Inbound] ❌ PMS sync failed for booking ${bookingId}`);
      console.error(`[QloApps Inbound]   Error: ${result.error}`);
      console.error(`[QloApps Inbound]   Action Taken: ${result.action}`);
      throw new Error(`Failed to sync booking ${bookingId}: ${result.error}`);
    }

    const totalDuration = Date.now() - singleBookingStart;
    console.log(`[QloApps Inbound] ✅ Single booking operation completed in ${totalDuration}ms`);
    console.log(`[QloApps Inbound]   Final Action: ${result?.action}`);
    console.log(`[QloApps Inbound]   Success: ${result?.success}`);

    return {
      created: result?.action === 'created' ? 1 : 0,
      updated: result?.action === 'updated' ? 1 : 0,
      skipped: result?.action === 'skipped' ? 1 : 0,
      failed: result?.action === 'failed' ? 1 : 0,
      total: 1,
    };
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
