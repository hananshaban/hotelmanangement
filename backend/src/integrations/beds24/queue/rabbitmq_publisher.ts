import type { Options } from 'amqplib';
import { createChannelWrapper } from '../../../config/rabbitmq.js';
import {
  EXCHANGE_NAME,
  setupTopology,
} from './rabbitmq_topology.js';

/**
 * RabbitMQ Publisher Service
 * Handles publishing messages to RabbitMQ exchange
 */

export interface PublishOptions {
  priority?: number;
  persistent?: boolean;
  expiration?: string;
  messageId?: string;
}

/**
 * Generate routing key from event type
 */
function getRoutingKey(eventType: string, direction: 'inbound' | 'outbound'): string {
  // Convert event type to routing key format
  // e.g., "booking.created" -> "beds24.booking.created" or "pms.booking.created"
  const prefix = direction === 'inbound' ? 'beds24' : 'pms';
  return `${prefix}.${eventType}`;
}

/**
 * Create channel wrapper for publishing
 * Ensures topology is set up before publishing
 */
const publisherChannel = createChannelWrapper(async (channel) => {
  await setupTopology(channel);
});

/**
 * Publish inbound event (from Beds24 webhook)
 */
export async function publishInbound(
  eventType: string,
  payload: any,
  options: PublishOptions = {}
): Promise<void> {
  const routingKey = getRoutingKey(eventType, 'inbound');
  const message = Buffer.from(JSON.stringify(payload));
  
  const publishOptions: Options.Publish = {
    persistent: options.persistent !== false, // Default to persistent
    priority: options.priority || 0,
    expiration: options.expiration,
    messageId: options.messageId,
    contentType: 'application/json',
    timestamp: Date.now(),
  };

  const published = await publisherChannel.publish(
    EXCHANGE_NAME,
    routingKey,
    message,
    publishOptions
  );

  if (!published) {
    throw new Error(`Failed to publish inbound message: ${routingKey}`);
  }
}

/**
 * Publish outbound event (from PMS actions)
 */
export async function publishOutbound(
  eventType: string,
  payload: any,
  options: PublishOptions = {}
): Promise<void> {
  const routingKey = getRoutingKey(eventType, 'outbound');
  const message = Buffer.from(JSON.stringify(payload));
  
  const publishOptions: Options.Publish = {
    persistent: options.persistent !== false, // Default to persistent
    priority: options.priority || 0,
    expiration: options.expiration,
    messageId: options.messageId,
    contentType: 'application/json',
    timestamp: Date.now(),
  };

  const published = await publisherChannel.publish(
    EXCHANGE_NAME,
    routingKey,
    message,
    publishOptions
  );

  if (!published) {
    throw new Error(`Failed to publish outbound message: ${routingKey}`);
  }
}

/**
 * Close publisher channel
 */
export async function closePublisher(): Promise<void> {
  await publisherChannel.close();
}

