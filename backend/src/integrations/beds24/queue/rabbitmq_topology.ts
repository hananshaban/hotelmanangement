import type { Channel } from 'amqplib';
import { createChannelWrapper } from '../../../config/rabbitmq.js';

/**
 * RabbitMQ Topology Configuration
 * 
 * Exchange: pms.events (topic, durable)
 * Queues:
 *   - beds24.inbound (durable) - routing: beds24.#
 *   - pms.outbound (durable) - routing: pms.#
 * DLQs:
 *   - beds24.dlq (durable)
 *   - pms.dlq (durable)
 */

export const EXCHANGE_NAME = 'pms.events';
export const EXCHANGE_TYPE = 'topic';

export const QUEUE_NAMES = {
  INBOUND: 'beds24.inbound',
  OUTBOUND: 'pms.outbound',
  INBOUND_DLQ: 'beds24.dlq',
  OUTBOUND_DLQ: 'pms.dlq',
} as const;

export const ROUTING_KEYS = {
  INBOUND_PATTERN: 'beds24.#',
  OUTBOUND_PATTERN: 'pms.#',
} as const;

/**
 * Setup RabbitMQ topology (exchange, queues, bindings, DLQs)
 */
export async function setupTopology(channel: Channel): Promise<void> {
  // Create dead-letter exchange
  const dlxName = `${EXCHANGE_NAME}.dlx`;
  await channel.assertExchange(dlxName, 'topic', {
    durable: true,
  });

  // Create main exchange
  await channel.assertExchange(EXCHANGE_NAME, EXCHANGE_TYPE, {
    durable: true,
  });

  // Create DLQ queues
  await channel.assertQueue(QUEUE_NAMES.INBOUND_DLQ, {
    durable: true,
  });

  await channel.assertQueue(QUEUE_NAMES.OUTBOUND_DLQ, {
    durable: true,
  });

  // Bind DLQs to dead-letter exchange
  await channel.bindQueue(
    QUEUE_NAMES.INBOUND_DLQ,
    dlxName,
    QUEUE_NAMES.INBOUND
  );
  await channel.bindQueue(
    QUEUE_NAMES.OUTBOUND_DLQ,
    dlxName,
    QUEUE_NAMES.OUTBOUND
  );

  // Create inbound queue with DLQ configuration
  await channel.assertQueue(QUEUE_NAMES.INBOUND, {
    durable: true,
    arguments: {
      'x-dead-letter-exchange': dlxName,
      'x-dead-letter-routing-key': QUEUE_NAMES.INBOUND,
      'x-message-ttl': 86400000, // 24 hours
      'x-max-priority': 10,
    },
  });

  // Create outbound queue with DLQ configuration
  await channel.assertQueue(QUEUE_NAMES.OUTBOUND, {
    durable: true,
    arguments: {
      'x-dead-letter-exchange': dlxName,
      'x-dead-letter-routing-key': QUEUE_NAMES.OUTBOUND,
      'x-message-ttl': 86400000, // 24 hours
      'x-max-priority': 10,
    },
  });

  // Bind queues to exchange
  await channel.bindQueue(
    QUEUE_NAMES.INBOUND,
    EXCHANGE_NAME,
    ROUTING_KEYS.INBOUND_PATTERN
  );

  await channel.bindQueue(
    QUEUE_NAMES.OUTBOUND,
    EXCHANGE_NAME,
    ROUTING_KEYS.OUTBOUND_PATTERN
  );

  console.log('[RabbitMQ] Topology setup complete');
}

/**
 * Initialize RabbitMQ topology
 * Call this once at application startup
 */
export async function initTopology(): Promise<void> {
  const channelWrapper = createChannelWrapper(setupTopology);
  
  // Wait for setup to complete
  await new Promise<void>((resolve, reject) => {
    channelWrapper.on('connect', () => {
      console.log('[RabbitMQ] Topology initialized');
      resolve();
    });
    
    channelWrapper.on('error', (err) => {
      console.error('[RabbitMQ] Topology setup error:', err);
      reject(err);
    });
  });
}

/**
 * Get channel wrapper for topology operations
 */
export function getTopologyChannel(): ReturnType<typeof createChannelWrapper> {
  return createChannelWrapper(setupTopology);
}

