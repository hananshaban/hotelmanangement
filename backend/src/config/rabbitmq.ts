import amqp, { Connection, Channel } from 'amqplib';
import { connect, AmqpConnectionManager, ChannelWrapper } from 'amqp-connection-manager';
import dotenv from 'dotenv';

/**
 * RabbitMQ Configuration
 * 
 * Environment variables:
 * - RABBITMQ_URL: Connection string (default: amqp://localhost:5672)
 * - RABBITMQ_USERNAME: Username (optional)
 * - RABBITMQ_PASSWORD: Password (optional)
 */

export interface RabbitMQConfig {
  url: string;
  reconnectDelay: number;
  maxReconnectAttempts: number;
}

dotenv.config();

/**
 * Get RabbitMQ connection URL from environment
 */
function getConnectionUrl(): string {
  const url = process.env.RABBITMQ_URL || 'amqp://localhost:5672';
  
  // If username/password provided separately, construct URL
  if (process.env.RABBITMQ_USERNAME && process.env.RABBITMQ_PASSWORD) {
    const urlObj = new URL(url);
    urlObj.username = process.env.RABBITMQ_USERNAME;
    urlObj.password = process.env.RABBITMQ_PASSWORD;
    return urlObj.toString();
  }
  
  return url;
}

/**
 * Default RabbitMQ configuration
 */
export const rabbitMQConfig: RabbitMQConfig = {
  url: getConnectionUrl(),
  reconnectDelay: 5000, // 5 seconds
  maxReconnectAttempts: 10,
};

/**
 * RabbitMQ connection manager instance
 * Handles automatic reconnection and connection pooling
 */
let connectionManager: AmqpConnectionManager | null = null;

/**
 * Initialize RabbitMQ connection manager
 */
export function initRabbitMQ(): AmqpConnectionManager {
  if (connectionManager) {
    return connectionManager;
  }

  connectionManager = connect([rabbitMQConfig.url], {
    reconnectTimeInSeconds: rabbitMQConfig.reconnectDelay / 1000,
    heartbeatIntervalInSeconds: 60,
  });

  connectionManager.on('connect', () => {
    console.log('[RabbitMQ] Connected');
  });

  connectionManager.on('disconnect', (err) => {
    const errorMessage = err?.err?.message || (err as any)?.message || 'Unknown error';
    console.error('[RabbitMQ] Disconnected:', errorMessage);
  });

  connectionManager.on('connectFailed', (err) => {
    const errorMessage = err?.err?.message || (err as any)?.message || 'Unknown error';
    console.error('[RabbitMQ] Connection failed:', errorMessage);
  });

  return connectionManager;
}

/**
 * Get or create RabbitMQ connection manager
 */
export function getConnectionManager(): AmqpConnectionManager {
  if (!connectionManager) {
    return initRabbitMQ();
  }
  return connectionManager;
}

/**
 * Create a channel wrapper for a specific queue/exchange
 */
export function createChannelWrapper(
  setup: (channel: Channel) => Promise<void>
): ChannelWrapper {
  const manager = getConnectionManager();
  return manager.createChannel({
    setup,
  });
}

/**
 * Close RabbitMQ connection
 */
export async function closeRabbitMQ(): Promise<void> {
  if (connectionManager) {
    await connectionManager.close();
    connectionManager = null;
  }
}

/**
 * Health check: Test RabbitMQ connection
 */
export async function checkRabbitMQHealth(): Promise<boolean> {
  try {
    const manager = getConnectionManager();
    const channel = await manager.createChannel();
    await channel.close();
    return true;
  } catch (error) {
    console.error('[RabbitMQ] Health check failed:', error);
    return false;
  }
}

