/**
 * QloApps RabbitMQ Topology Configuration
 *
 * Defines the exchange, queues, and bindings for QloApps integration.
 *
 * Exchange: qloapps.events (topic, durable)
 * Queues:
 *   - qloapps.inbound (durable) - for inbound sync from QloApps
 *   - qloapps.outbound (durable) - for outbound sync to QloApps
 * DLQs:
 *   - qloapps.inbound.dlq (durable)
 *   - qloapps.outbound.dlq (durable)
 */

import type { Channel } from 'amqplib';
import { createChannelWrapper } from '../../../config/rabbitmq.js';

// ============================================================================
// Constants
// ============================================================================

export const QLOAPPS_EXCHANGE_NAME = 'qloapps.events';
export const QLOAPPS_EXCHANGE_TYPE = 'topic' as const;

export const QLOAPPS_QUEUE_NAMES = {
  INBOUND: 'qloapps.inbound',
  OUTBOUND: 'qloapps.outbound',
  INBOUND_DLQ: 'qloapps.inbound.dlq',
  OUTBOUND_DLQ: 'qloapps.outbound.dlq',
} as const;

export const QLOAPPS_ROUTING_KEYS = {
  // Inbound (from QloApps to PMS)
  BOOKING_CREATED: 'qloapps.booking.created',
  BOOKING_UPDATED: 'qloapps.booking.updated',
  BOOKING_CANCELLED: 'qloapps.booking.cancelled',
  INBOUND_PATTERN: 'qloapps.booking.#',

  // Outbound (from PMS to QloApps)
  RESERVATION_CREATE: 'pms.qloapps.reservation.create',
  RESERVATION_UPDATE: 'pms.qloapps.reservation.update',
  RESERVATION_CANCEL: 'pms.qloapps.reservation.cancel',
  AVAILABILITY_UPDATE: 'pms.qloapps.availability.update',
  RATE_UPDATE: 'pms.qloapps.rate.update',
  OUTBOUND_PATTERN: 'pms.qloapps.#',
} as const;

// ============================================================================
// Message Types
// ============================================================================

/**
 * Base message structure for QloApps queue messages
 */
export interface QloAppsQueueMessage {
  messageId: string;
  timestamp: string;
  eventType: string;
  retryCount: number;
}

/**
 * Inbound sync message (from scheduled pull or webhook)
 */
export interface QloAppsInboundMessage extends QloAppsQueueMessage {
  eventType: 'booking.sync' | 'booking.created' | 'booking.updated' | 'booking.cancelled';
  qloAppsBookingId?: number;
  syncType: 'full' | 'incremental';
  configId: string;
}

/**
 * Outbound reservation sync message
 */
export interface QloAppsOutboundReservationMessage extends QloAppsQueueMessage {
  eventType: 'reservation.create' | 'reservation.update' | 'reservation.cancel';
  reservationId: string;
  configId: string;
}

/**
 * Outbound availability sync message
 */
export interface QloAppsOutboundAvailabilityMessage extends QloAppsQueueMessage {
  eventType: 'availability.update';
  roomTypeId: string;
  dateFrom: string;
  dateTo: string;
  configId: string;
}

/**
 * Outbound rate sync message
 */
export interface QloAppsOutboundRateMessage extends QloAppsQueueMessage {
  eventType: 'rate.update';
  roomTypeId: string;
  dateFrom: string;
  dateTo: string;
  configId: string;
}

export type QloAppsOutboundMessage =
  | QloAppsOutboundReservationMessage
  | QloAppsOutboundAvailabilityMessage
  | QloAppsOutboundRateMessage;

// ============================================================================
// Topology Setup
// ============================================================================

/**
 * Setup QloApps RabbitMQ topology (exchange, queues, bindings, DLQs)
 */
export async function setupQloAppsTopology(channel: Channel): Promise<void> {
  console.log('[QloApps RabbitMQ] Setting up topology...');

  // Create dead-letter exchange
  const dlxName = `${QLOAPPS_EXCHANGE_NAME}.dlx`;
  await channel.assertExchange(dlxName, 'topic', {
    durable: true,
  });

  // Create main exchange
  await channel.assertExchange(QLOAPPS_EXCHANGE_NAME, QLOAPPS_EXCHANGE_TYPE, {
    durable: true,
  });

  // Create DLQ queues
  await channel.assertQueue(QLOAPPS_QUEUE_NAMES.INBOUND_DLQ, {
    durable: true,
    arguments: {
      'x-message-ttl': 604800000, // 7 days retention for DLQ messages
    },
  });

  await channel.assertQueue(QLOAPPS_QUEUE_NAMES.OUTBOUND_DLQ, {
    durable: true,
    arguments: {
      'x-message-ttl': 604800000, // 7 days retention for DLQ messages
    },
  });

  // Bind DLQs to dead-letter exchange
  await channel.bindQueue(
    QLOAPPS_QUEUE_NAMES.INBOUND_DLQ,
    dlxName,
    QLOAPPS_QUEUE_NAMES.INBOUND
  );
  await channel.bindQueue(
    QLOAPPS_QUEUE_NAMES.OUTBOUND_DLQ,
    dlxName,
    QLOAPPS_QUEUE_NAMES.OUTBOUND
  );

  // Create inbound queue with DLQ configuration
  await channel.assertQueue(QLOAPPS_QUEUE_NAMES.INBOUND, {
    durable: true,
    arguments: {
      'x-dead-letter-exchange': dlxName,
      'x-dead-letter-routing-key': QLOAPPS_QUEUE_NAMES.INBOUND,
      'x-message-ttl': 86400000, // 24 hours message TTL
      'x-max-priority': 10, // Priority queue support
    },
  });

  // Create outbound queue with DLQ configuration
  await channel.assertQueue(QLOAPPS_QUEUE_NAMES.OUTBOUND, {
    durable: true,
    arguments: {
      'x-dead-letter-exchange': dlxName,
      'x-dead-letter-routing-key': QLOAPPS_QUEUE_NAMES.OUTBOUND,
      'x-message-ttl': 86400000, // 24 hours message TTL
      'x-max-priority': 10, // Priority queue support
    },
  });

  // Bind inbound queue to exchange
  await channel.bindQueue(
    QLOAPPS_QUEUE_NAMES.INBOUND,
    QLOAPPS_EXCHANGE_NAME,
    QLOAPPS_ROUTING_KEYS.INBOUND_PATTERN
  );

  // Bind outbound queue to exchange
  await channel.bindQueue(
    QLOAPPS_QUEUE_NAMES.OUTBOUND,
    QLOAPPS_EXCHANGE_NAME,
    QLOAPPS_ROUTING_KEYS.OUTBOUND_PATTERN
  );

  console.log('[QloApps RabbitMQ] Topology setup complete');
  console.log(`  Exchange: ${QLOAPPS_EXCHANGE_NAME} (${QLOAPPS_EXCHANGE_TYPE})`);
  console.log(`  Queues: ${Object.values(QLOAPPS_QUEUE_NAMES).join(', ')}`);
}

/**
 * Initialize QloApps RabbitMQ topology
 * Call this once at application/worker startup
 */
export async function initQloAppsTopology(): Promise<void> {
  const channelWrapper = createChannelWrapper(setupQloAppsTopology);

  // Wait for setup to complete
  await new Promise<void>((resolve, reject) => {
    channelWrapper.on('connect', () => {
      console.log('[QloApps RabbitMQ] Topology initialized');
      resolve();
    });

    channelWrapper.on('error', (err) => {
      console.error('[QloApps RabbitMQ] Topology setup error:', err);
      reject(err);
    });

    // Timeout after 30 seconds
    setTimeout(() => {
      reject(new Error('QloApps topology initialization timed out'));
    }, 30000);
  });
}

/**
 * Get channel wrapper for QloApps topology operations
 */
export function getQloAppsTopologyChannel(): ReturnType<typeof createChannelWrapper> {
  return createChannelWrapper(setupQloAppsTopology);
}
