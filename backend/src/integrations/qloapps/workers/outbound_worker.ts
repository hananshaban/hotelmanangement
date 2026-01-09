/**
 * QloApps Outbound Worker
 *
 * Consumes messages from the qloapps.outbound queue and pushes
 * data from PMS to QloApps (reservations, availability, rates).
 */

import crypto from 'crypto';
import {
  QloAppsBaseConsumer,
  type QloAppsMessageContext,
} from '../queue/rabbitmq_consumer_base.js';
import {
  QLOAPPS_QUEUE_NAMES,
  type QloAppsOutboundMessage,
  type QloAppsOutboundReservationMessage,
  type QloAppsOutboundAvailabilityMessage,
  type QloAppsOutboundRateMessage,
} from '../queue/rabbitmq_topology.js';
import { QloAppsPushSyncService } from '../services/push_sync_service.js';
import { QloAppsAvailabilitySyncService } from '../services/availability_sync_service.js';
import { QloAppsRateSyncService } from '../services/rate_sync_service.js';
import { QloAppsClient } from '../qloapps_client.js';
import db from '../../../config/database.js';
import { decrypt } from '../../../utils/encryption.js';

// ============================================================================
// Outbound Worker
// ============================================================================

/**
 * Worker that processes outbound sync messages to QloApps
 */
export class QloAppsOutboundWorker extends QloAppsBaseConsumer {
  constructor() {
    super(QLOAPPS_QUEUE_NAMES.OUTBOUND, {
      prefetch: 1,
      maxRetries: 3,
      retryDelayMs: 2000,
    });
  }

  /**
   * Get QloApps client for a specific config
   */
  private async getClient(configId: string): Promise<QloAppsClient> {
    const config = await db('qloapps_config')
      .where({ id: configId })
      .first();

    if (!config) {
      throw new Error(`QloApps config not found: ${configId}`);
    }

    if (!config.sync_enabled) {
      throw new Error(`QloApps sync is disabled for config: ${configId}`);
    }

    const apiKey = decrypt(config.api_key_encrypted);

    return new QloAppsClient({
      baseUrl: config.base_url,
      apiKey,
      hotelId: config.qloapps_hotel_id,
    });
  }

  /**
   * Process an outbound message
   */
  protected async processMessage(context: QloAppsMessageContext): Promise<void> {
    const message = context.content as QloAppsOutboundMessage;
    const { eventType, configId } = message;

    console.log(`[QloApps Outbound] Processing ${eventType} for config ${configId}`);

    // Get client
    const client = await this.getClient(configId);

    // Route based on event type
    switch (eventType) {
      case 'reservation.create':
      case 'reservation.update':
        await this.handleReservationSync(
          client,
          configId,
          message as QloAppsOutboundReservationMessage
        );
        break;

      case 'reservation.cancel':
        await this.handleReservationCancel(
          client,
          configId,
          message as QloAppsOutboundReservationMessage
        );
        break;

      case 'availability.update':
        await this.handleAvailabilitySync(
          client,
          configId,
          message as QloAppsOutboundAvailabilityMessage
        );
        break;

      case 'rate.update':
        await this.handleRateSync(
          client,
          configId,
          message as QloAppsOutboundRateMessage
        );
        break;

      default:
        console.warn(`[QloApps Outbound] Unknown event type: ${eventType}`);
    }
  }

  /**
   * Handle reservation create/update
   */
  private async handleReservationSync(
    client: QloAppsClient,
    configId: string,
    message: QloAppsOutboundReservationMessage
  ): Promise<void> {
    const { reservationId, eventType } = message;
    console.log(`[QloApps Outbound] Pushing reservation ${reservationId} (${eventType})`);

    const pushService = new QloAppsPushSyncService(client, configId);

    // Get reservations to sync (just this one)
    const reservations = await pushService.getReservationsToSync({
      reservationIds: [reservationId],
    });

    if (reservations.length === 0) {
      console.warn(`[QloApps Outbound] Reservation ${reservationId} not found or not eligible for sync`);
      return;
    }

    const results = await pushService.pushReservations(reservations);
    const result = results[0];

    if (!result || !result.success) {
      throw new Error(`Failed to push reservation ${reservationId}: ${result?.error || 'Unknown error'}`);
    }

    console.log(
      `[QloApps Outbound] Successfully pushed reservation ${reservationId} → QloApps booking ${result.qloAppsBookingId}`
    );

    // Log the sync (build object conditionally for exactOptionalPropertyTypes)
    const logData: Parameters<typeof this.logSync>[0] = {
      configId,
      syncType: 'reservation_push',
      direction: 'outbound',
      entityType: 'reservation',
      localEntityId: reservationId,
      operation: eventType === 'reservation.create' ? 'create' : 'update',
      success: true,
    };
    if (result.qloAppsBookingId !== undefined) {
      logData.qloAppsEntityId = result.qloAppsBookingId;
    }
    await this.logSync(logData);
  }

  /**
   * Handle reservation cancellation
   * Note: Uses the same push mechanism but with cancelled status
   */
  private async handleReservationCancel(
    client: QloAppsClient,
    configId: string,
    message: QloAppsOutboundReservationMessage
  ): Promise<void> {
    const { reservationId } = message;
    console.log(`[QloApps Outbound] Cancelling reservation ${reservationId} in QloApps`);

    // Check if reservation is already mapped
    const mapping = await db('qloapps_reservation_mappings')
      .where({ local_reservation_id: reservationId })
      .first();

    if (!mapping) {
      console.warn(`[QloApps Outbound] No QloApps mapping found for reservation ${reservationId}, skipping cancel`);
      return;
    }

    // Update booking status to cancelled in QloApps
    try {
      await client.cancelBooking(parseInt(mapping.qloapps_order_id, 10));

      console.log(
        `[QloApps Outbound] Successfully cancelled reservation ${reservationId} in QloApps`
      );

      // Update mapping
      await db('qloapps_reservation_mappings')
        .where({ id: mapping.id })
        .update({
          last_synced_at: new Date(),
          updated_at: new Date(),
        });

      // Log the sync
      await this.logSync({
        configId,
        syncType: 'reservation_push',
        direction: 'outbound',
        entityType: 'reservation',
        localEntityId: reservationId,
        qloAppsEntityId: parseInt(mapping.qloapps_order_id, 10),
        operation: 'cancel',
        success: true,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to cancel reservation ${reservationId}: ${errorMessage}`);
    }
  }

  /**
   * Handle availability update
   */
  private async handleAvailabilitySync(
    client: QloAppsClient,
    configId: string,
    message: QloAppsOutboundAvailabilityMessage
  ): Promise<void> {
    const { roomTypeId, dateFrom, dateTo } = message;
    console.log(
      `[QloApps Outbound] Pushing availability for room type ${roomTypeId} (${dateFrom} to ${dateTo})`
    );

    // Get room type mapping
    const mapping = await db('qloapps_room_type_mappings')
      .where({
        local_room_type_id: roomTypeId,
        is_active: true,
      })
      .first();

    if (!mapping) {
      console.warn(`[QloApps Outbound] No QloApps mapping found for room type ${roomTypeId}, skipping availability sync`);
      return;
    }

    const availabilityService = new QloAppsAvailabilitySyncService(client, configId);
    const result = await availabilityService.syncRoomTypeAvailability(
      roomTypeId,
      parseInt(mapping.qloapps_product_id, 10),
      {
        startDate: new Date(dateFrom),
        endDate: new Date(dateTo),
      }
    );

    if (!result.success) {
      throw new Error(
        `Failed to push availability for room type ${roomTypeId}: ${result.error || 'Unknown error'}`
      );
    }

    console.log(
      `[QloApps Outbound] Successfully pushed availability for room type ${roomTypeId}: ${result.updatesCount} dates updated`
    );

    // Log the sync
    await this.logSync({
      configId,
      syncType: 'availability_push',
      direction: 'outbound',
      entityType: 'availability',
      localEntityId: roomTypeId,
      operation: 'update',
      success: true,
      metadata: { dateFrom, dateTo, updatesCount: result.updatesCount },
    });
  }

  /**
   * Handle rate update
   */
  private async handleRateSync(
    client: QloAppsClient,
    configId: string,
    message: QloAppsOutboundRateMessage
  ): Promise<void> {
    const { roomTypeId, dateFrom, dateTo } = message;
    console.log(
      `[QloApps Outbound] Pushing rates for room type ${roomTypeId} (${dateFrom} to ${dateTo})`
    );

    // Get room type mapping
    const mapping = await db('qloapps_room_type_mappings')
      .where({
        local_room_type_id: roomTypeId,
        is_active: true,
      })
      .first();

    if (!mapping) {
      console.warn(`[QloApps Outbound] No QloApps mapping found for room type ${roomTypeId}, skipping rate sync`);
      return;
    }

    const rateService = new QloAppsRateSyncService(client, configId);
    const result = await rateService.syncRoomTypeRates(
      roomTypeId,
      parseInt(mapping.qloapps_product_id, 10),
      {
        startDate: new Date(dateFrom),
        endDate: new Date(dateTo),
      }
    );

    if (!result.success) {
      throw new Error(
        `Failed to push rates for room type ${roomTypeId}: ${result.error || 'Unknown error'}`
      );
    }

    console.log(
      `[QloApps Outbound] Successfully pushed rates for room type ${roomTypeId}: ${result.updatesCount} dates updated`
    );

    // Log the sync
    await this.logSync({
      configId,
      syncType: 'rate_push',
      direction: 'outbound',
      entityType: 'rate',
      localEntityId: roomTypeId,
      operation: 'update',
      success: true,
      metadata: { dateFrom, dateTo, updatesCount: result.updatesCount },
    });
  }

  /**
   * Log a sync operation
   */
  private async logSync(data: {
    configId: string;
    syncType: string;
    direction: 'inbound' | 'outbound';
    entityType: string;
    localEntityId?: string;
    qloAppsEntityId?: number;
    operation: string;
    success: boolean;
    errorMessage?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    try {
      await db('qloapps_sync_logs').insert({
        id: crypto.randomUUID(),
        sync_type: data.syncType,
        direction: data.direction,
        entity_type: data.entityType,
        local_entity_id: data.localEntityId,
        qloapps_entity_id: data.qloAppsEntityId,
        operation: data.operation,
        success: data.success,
        error_message: data.errorMessage,
        request_data: data.metadata ? JSON.stringify(data.metadata) : null,
        created_at: new Date(),
      });
    } catch (error) {
      console.error('[QloApps Outbound] Failed to log sync:', error);
    }
  }
}

// ============================================================================
// Worker Factory Functions
// ============================================================================

/**
 * Start the outbound worker
 */
export async function startQloAppsOutboundWorker(): Promise<QloAppsOutboundWorker> {
  const worker = new QloAppsOutboundWorker();
  await worker.start();
  console.log('[QloApps Outbound] Worker started');
  return worker;
}

/**
 * Stop the outbound worker
 */
export async function stopQloAppsOutboundWorker(worker: QloAppsOutboundWorker): Promise<void> {
  await worker.stop();
  console.log('[QloApps Outbound] Worker stopped');
}
