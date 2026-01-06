/**
 * QloApps RabbitMQ Consumer Base Class
 *
 * Base class for consuming messages from QloApps queues.
 * Handles message consumption, acknowledgment, retry logic, and error handling.
 */

import type { Channel, ConsumeMessage } from 'amqplib';
import { createChannelWrapper } from '../../../config/rabbitmq.js';
import { setupQloAppsTopology } from './rabbitmq_topology.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Message context passed to processMessage
 */
export interface QloAppsMessageContext {
  channel: Channel;
  message: ConsumeMessage;
  content: unknown;
  retryCount: number;
}

/**
 * Consumer configuration options
 */
export interface QloAppsConsumerOptions {
  /** Maximum number of unacked messages (concurrency) */
  prefetch?: number;
  /** Maximum retry attempts before routing to DLQ */
  maxRetries?: number;
  /** Initial retry delay in milliseconds */
  retryDelayMs?: number;
  /** Whether to auto-acknowledge messages */
  noAck?: boolean;
}

// ============================================================================
// Base Consumer Class
// ============================================================================

/**
 * Abstract base class for QloApps RabbitMQ consumers
 */
export abstract class QloAppsBaseConsumer {
  protected channelWrapper: ReturnType<typeof createChannelWrapper>;
  protected queueName: string;
  protected prefetch: number;
  protected maxRetries: number;
  protected retryDelayMs: number;
  protected noAck: boolean;
  protected consumerTag: string | null = null;
  protected isRunning = false;

  constructor(queueName: string, options: QloAppsConsumerOptions = {}) {
    this.queueName = queueName;
    this.prefetch = options.prefetch ?? 1;
    this.maxRetries = options.maxRetries ?? 3;
    this.retryDelayMs = options.retryDelayMs ?? 1000;
    this.noAck = options.noAck ?? false;
    this.channelWrapper = createChannelWrapper(this.setupChannel.bind(this));
  }

  /**
   * Setup channel (assert topology, set prefetch)
   */
  protected async setupChannel(channel: Channel): Promise<void> {
    // Ensure QloApps topology is set up
    await setupQloAppsTopology(channel);

    // Set prefetch for concurrency control
    await channel.prefetch(this.prefetch);

    console.log(`[QloApps Consumer] Channel setup complete for queue: ${this.queueName}`);
  }

  /**
   * Process message (to be implemented by subclasses)
   * @throws Error to trigger retry/DLQ routing
   */
  protected abstract processMessage(context: QloAppsMessageContext): Promise<void>;

  /**
   * Handle message consumption with retry logic
   */
  protected async handleMessage(
    channel: Channel,
    message: ConsumeMessage | null
  ): Promise<void> {
    if (!message) {
      return;
    }

    const messageId = message.properties.messageId || 'unknown';
    let content: unknown;

    try {
      content = JSON.parse(message.content.toString());
    } catch (error) {
      console.error(`[QloApps Consumer] Failed to parse message ${messageId}:`, error);
      // Reject without requeue - invalid message format
      if (!this.noAck) {
        channel.nack(message, false, false);
      }
      return;
    }

    const retryCount = (message.properties.headers?.['x-retry-count'] as number) || 0;

    const context: QloAppsMessageContext = {
      channel,
      message,
      content,
      retryCount,
    };

    try {
      console.log(
        `[QloApps Consumer] Processing message ${messageId} (attempt ${retryCount + 1}/${this.maxRetries + 1})`
      );

      await this.processMessage(context);

      // Acknowledge message on success
      if (!this.noAck) {
        channel.ack(message);
      }

      console.log(`[QloApps Consumer] Successfully processed message ${messageId}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[QloApps Consumer] Error processing message ${messageId}:`, errorMessage);

      if (this.noAck) {
        // Auto-ack mode, can't retry
        return;
      }

      if (retryCount < this.maxRetries) {
        // Retry with exponential backoff
        const delay = this.retryDelayMs * Math.pow(2, retryCount);
        console.log(
          `[QloApps Consumer] Scheduling retry for message ${messageId} in ${delay}ms (attempt ${retryCount + 2}/${this.maxRetries + 1})`
        );

        // Requeue for retry
        // Note: In production, consider using a delay exchange for proper backoff
        channel.nack(message, false, true);
      } else {
        // Max retries reached - route to DLQ
        console.error(
          `[QloApps Consumer] Max retries (${this.maxRetries}) reached for message ${messageId}, routing to DLQ`
        );
        channel.nack(message, false, false);
      }
    }
  }

  /**
   * Start consuming messages
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.warn(`[QloApps Consumer] Already running for queue: ${this.queueName}`);
      return;
    }

    this.isRunning = true;

    await this.channelWrapper.addSetup(async (channel: Channel) => {
      await this.setupChannel(channel);

      const consumeResult = await channel.consume(
        this.queueName,
        (message) => {
          this.handleMessage(channel, message).catch((error) => {
            console.error(`[QloApps Consumer] Unhandled error in message handler:`, error);
          });
        },
        {
          noAck: this.noAck,
        }
      );

      this.consumerTag = consumeResult.consumerTag;
      console.log(`[QloApps Consumer] Started consuming from queue: ${this.queueName}`);
    });
  }

  /**
   * Stop consuming messages
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    if (this.consumerTag) {
      try {
        await this.channelWrapper.cancel(this.consumerTag);
      } catch (error) {
        console.error(`[QloApps Consumer] Error cancelling consumer:`, error);
      }
      this.consumerTag = null;
    }

    this.isRunning = false;
    console.log(`[QloApps Consumer] Stopped consuming from queue: ${this.queueName}`);
  }

  /**
   * Close consumer channel
   */
  async close(): Promise<void> {
    await this.stop();
    try {
      await this.channelWrapper.close();
    } catch (error) {
      console.error(`[QloApps Consumer] Error closing channel:`, error);
    }
  }

  /**
   * Check if consumer is running
   */
  isConsumerRunning(): boolean {
    return this.isRunning;
  }
}
