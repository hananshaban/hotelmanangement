/**
 * QloApps RabbitMQ Publisher
 *
 * Publishes messages to QloApps queues for async processing.
 */

import type { Channel } from 'amqplib';
import crypto from 'crypto';
import { createChannelWrapper } from '../../../config/rabbitmq.js';
import {
  QLOAPPS_EXCHANGE_NAME,
  QLOAPPS_ROUTING_KEYS,
  setupQloAppsTopology,
  type QloAppsInboundMessage,
  type QloAppsOutboundReservationMessage,
  type QloAppsOutboundAvailabilityMessage,
  type QloAppsOutboundRateMessage,
} from './rabbitmq_topology.js';

// ============================================================================
// Publisher Class
// ============================================================================

/**
 * Publisher for QloApps queue messages
 */
class QloAppsPublisher {
  private channelWrapper: ReturnType<typeof createChannelWrapper> | null = null;
  private isInitialized = false;

  /**
   * Initialize the publisher (lazy initialization)
   */
  private async ensureInitialized(): Promise<ReturnType<typeof createChannelWrapper>> {
    if (!this.channelWrapper) {
      this.channelWrapper = createChannelWrapper(async (channel: Channel) => {
        await setupQloAppsTopology(channel);
      });
      this.isInitialized = true;
    }
    return this.channelWrapper;
  }

  /**
   * Generate a unique message ID
   */
  private generateMessageId(): string {
    return crypto.randomUUID();
  }

  /**
   * Publish a message to the QloApps exchange
   */
  private async publish(
    routingKey: string,
    message: object,
    options: { priority?: number; persistent?: boolean } = {}
  ): Promise<string> {
    const channelWrapper = await this.ensureInitialized();
    const messageId = this.generateMessageId();

    const messageWithMeta = {
      ...message,
      messageId,
      timestamp: new Date().toISOString(),
      retryCount: 0,
    };

    await channelWrapper.publish(
      QLOAPPS_EXCHANGE_NAME,
      routingKey,
      Buffer.from(JSON.stringify(messageWithMeta)),
      {
        persistent: options.persistent ?? true,
        priority: options.priority ?? 5,
        messageId,
        contentType: 'application/json',
        headers: {
          'x-retry-count': 0,
        },
      }
    );

    console.log(
      `[QloApps Publisher] Published message ${messageId} to ${routingKey}`
    );

    return messageId;
  }

  // ==========================================================================
  // Inbound Messages (from QloApps sync)
  // ==========================================================================

  /**
   * Queue an inbound sync job
   */
  async queueInboundSync(
    configId: string,
    options: {
      syncType?: 'full' | 'incremental';
      qloAppsBookingId?: number;
      priority?: number;
    } = {}
  ): Promise<string> {
    const message: Omit<QloAppsInboundMessage, 'messageId' | 'timestamp' | 'retryCount'> = {
      eventType: 'booking.sync',
      configId,
      syncType: options.syncType ?? 'incremental',
    };

    if (options.qloAppsBookingId !== undefined) {
      message.qloAppsBookingId = options.qloAppsBookingId;
    }

    return this.publish(QLOAPPS_ROUTING_KEYS.BOOKING_UPDATED, message, {
      priority: options.priority ?? 5,
    });
  }

  /**
   * Queue processing of a specific booking from QloApps
   */
  async queueBookingCreated(configId: string, bookingId: number): Promise<string> {
    const message: Omit<QloAppsInboundMessage, 'messageId' | 'timestamp' | 'retryCount'> = {
      eventType: 'booking.created',
      configId,
      syncType: 'incremental',
      qloAppsBookingId: bookingId,
    };

    return this.publish(QLOAPPS_ROUTING_KEYS.BOOKING_CREATED, message, {
      priority: 8, // High priority for new bookings
    });
  }

  /**
   * Queue processing of an updated booking from QloApps
   */
  async queueBookingUpdated(configId: string, bookingId: number): Promise<string> {
    const message: Omit<QloAppsInboundMessage, 'messageId' | 'timestamp' | 'retryCount'> = {
      eventType: 'booking.updated',
      configId,
      syncType: 'incremental',
      qloAppsBookingId: bookingId,
    };

    return this.publish(QLOAPPS_ROUTING_KEYS.BOOKING_UPDATED, message, {
      priority: 7,
    });
  }

  /**
   * Queue processing of a cancelled booking from QloApps
   */
  async queueBookingCancelled(configId: string, bookingId: number): Promise<string> {
    const message: Omit<QloAppsInboundMessage, 'messageId' | 'timestamp' | 'retryCount'> = {
      eventType: 'booking.cancelled',
      configId,
      syncType: 'incremental',
      qloAppsBookingId: bookingId,
    };

    return this.publish(QLOAPPS_ROUTING_KEYS.BOOKING_CANCELLED, message, {
      priority: 9, // Highest priority for cancellations
    });
  }

  // ==========================================================================
  // Outbound Messages (to QloApps)
  // ==========================================================================

  /**
   * Queue a reservation to be created in QloApps
   */
  async queueReservationCreate(
    configId: string,
    reservationId: string,
    options: { priority?: number } = {}
  ): Promise<string> {
    const message: Omit<QloAppsOutboundReservationMessage, 'messageId' | 'timestamp' | 'retryCount'> = {
      eventType: 'reservation.create',
      configId,
      reservationId,
    };

    return this.publish(QLOAPPS_ROUTING_KEYS.RESERVATION_CREATE, message, {
      priority: options.priority ?? 7,
    });
  }

  /**
   * Queue a reservation update to be pushed to QloApps
   */
  async queueReservationUpdate(
    configId: string,
    reservationId: string,
    options: { priority?: number } = {}
  ): Promise<string> {
    const message: Omit<QloAppsOutboundReservationMessage, 'messageId' | 'timestamp' | 'retryCount'> = {
      eventType: 'reservation.update',
      configId,
      reservationId,
    };

    return this.publish(QLOAPPS_ROUTING_KEYS.RESERVATION_UPDATE, message, {
      priority: options.priority ?? 6,
    });
  }

  /**
   * Queue a reservation cancellation to be pushed to QloApps
   */
  async queueReservationCancel(
    configId: string,
    reservationId: string,
    options: { priority?: number } = {}
  ): Promise<string> {
    const message: Omit<QloAppsOutboundReservationMessage, 'messageId' | 'timestamp' | 'retryCount'> = {
      eventType: 'reservation.cancel',
      configId,
      reservationId,
    };

    return this.publish(QLOAPPS_ROUTING_KEYS.RESERVATION_CANCEL, message, {
      priority: options.priority ?? 9, // High priority for cancellations
    });
  }

  /**
   * Queue an availability update to be pushed to QloApps
   */
  async queueAvailabilityUpdate(
    configId: string,
    roomTypeId: string,
    dateFrom: string,
    dateTo: string,
    options: { priority?: number } = {}
  ): Promise<string> {
    const message: Omit<QloAppsOutboundAvailabilityMessage, 'messageId' | 'timestamp' | 'retryCount'> = {
      eventType: 'availability.update',
      configId,
      roomTypeId,
      dateFrom,
      dateTo,
    };

    return this.publish(QLOAPPS_ROUTING_KEYS.AVAILABILITY_UPDATE, message, {
      priority: options.priority ?? 5,
    });
  }

  /**
   * Queue a rate update to be pushed to QloApps
   */
  async queueRateUpdate(
    configId: string,
    roomTypeId: string,
    dateFrom: string,
    dateTo: string,
    options: { priority?: number } = {}
  ): Promise<string> {
    const message: Omit<QloAppsOutboundRateMessage, 'messageId' | 'timestamp' | 'retryCount'> = {
      eventType: 'rate.update',
      configId,
      roomTypeId,
      dateFrom,
      dateTo,
    };

    return this.publish(QLOAPPS_ROUTING_KEYS.RATE_UPDATE, message, {
      priority: options.priority ?? 5,
    });
  }

  /**
   * Close the publisher connection
   */
  async close(): Promise<void> {
    if (this.channelWrapper) {
      try {
        await this.channelWrapper.close();
      } catch (error) {
        console.error('[QloApps Publisher] Error closing channel:', error);
      }
      this.channelWrapper = null;
      this.isInitialized = false;
    }
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

/**
 * Singleton publisher instance
 */
export const qloAppsPublisher = new QloAppsPublisher();

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Queue an inbound sync job
 */
export function queueQloAppsInboundSync(
  configId: string,
  options?: { syncType?: 'full' | 'incremental'; qloAppsBookingId?: number }
): Promise<string> {
  return qloAppsPublisher.queueInboundSync(configId, options);
}

/**
 * Queue a reservation to be pushed to QloApps
 */
export function queueQloAppsReservationSync(
  configId: string,
  reservationId: string,
  action: 'create' | 'update' | 'cancel'
): Promise<string> {
  switch (action) {
    case 'create':
      return qloAppsPublisher.queueReservationCreate(configId, reservationId);
    case 'update':
      return qloAppsPublisher.queueReservationUpdate(configId, reservationId);
    case 'cancel':
      return qloAppsPublisher.queueReservationCancel(configId, reservationId);
  }
}

/**
 * Queue an availability update to QloApps
 */
export function queueQloAppsAvailabilitySync(
  configId: string,
  roomTypeId: string,
  dateFrom: string,
  dateTo: string
): Promise<string> {
  return qloAppsPublisher.queueAvailabilityUpdate(configId, roomTypeId, dateFrom, dateTo);
}

/**
 * Queue a rate update to QloApps
 */
export function queueQloAppsRateSync(
  configId: string,
  roomTypeId: string,
  dateFrom: string,
  dateTo: string
): Promise<string> {
  return qloAppsPublisher.queueRateUpdate(configId, roomTypeId, dateFrom, dateTo);
}
