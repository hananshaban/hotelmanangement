import type { Channel, ConsumeMessage } from 'amqplib';
import { createChannelWrapper } from '../../../config/rabbitmq.js';
import { QUEUE_NAMES, setupTopology } from './rabbitmq_topology.js';

/**
 * Base RabbitMQ Consumer Class
 * Handles message consumption, acknowledgment, and error handling
 */

export interface ConsumerOptions {
  queueName: string;
  prefetch?: number;
  noAck?: boolean;
}

export interface MessageContext {
  channel: Channel;
  message: ConsumeMessage;
  content: any;
}

/**
 * Abstract base class for RabbitMQ consumers
 */
export abstract class BaseRabbitMQConsumer {
  protected channelWrapper: ReturnType<typeof createChannelWrapper>;
  protected queueName: string;
  protected prefetch: number;
  protected noAck: boolean;
  protected consumerTag: string | null = null;
  protected isRunning = false;

  constructor(queueName: string, prefetch: number = 1, noAck: boolean = false) {
    this.queueName = queueName;
    this.prefetch = prefetch;
    this.noAck = noAck;
    this.channelWrapper = createChannelWrapper(this.setupChannel.bind(this));
  }

  /**
   * Setup channel (assert queue, set prefetch)
   */
  protected async setupChannel(channel: Channel): Promise<void> {
    // Ensure topology is set up (this already asserts queues with correct arguments)
    await setupTopology(channel);
    
    // Set prefetch (concurrency control)
    await channel.prefetch(this.prefetch);
    
    // Note: Queue is already asserted by setupTopology with correct arguments
    // No need to assert again to avoid PRECONDITION_FAILED errors
  }

  /**
   * Process message (to be implemented by subclasses)
   */
  protected abstract processMessage(context: MessageContext): Promise<void>;

  /**
   * Handle message consumption
   */
  protected async handleMessage(
    channel: Channel,
    message: ConsumeMessage | null
  ): Promise<void> {
    if (!message) {
      return;
    }

    let content: any;
    try {
      // Parse message content
      content = JSON.parse(message.content.toString());
    } catch (error) {
      console.error(`[Consumer] Failed to parse message:`, error);
      channel.nack(message, false, false); // Reject without requeue
      return;
    }

    const context: MessageContext = {
      channel,
      message,
      content,
    };

    try {
      // Process message
      await this.processMessage(context);

      // Acknowledge message on success
      if (!this.noAck) {
        channel.ack(message);
      }
    } catch (error) {
      console.error(`[Consumer] Error processing message:`, error);
      
      // Check retry count from message properties
      const retryCount = (message.properties.headers?.['x-retry-count'] as number) || 0;
      const maxRetries = 3;

      if (retryCount < maxRetries) {
        // Retry: requeue with incremented retry count
        const retryHeaders = {
          ...message.properties.headers,
          'x-retry-count': retryCount + 1,
        };

        channel.nack(message, false, true); // Requeue
      } else {
        // Max retries reached: route to DLQ
        console.error(`[Consumer] Max retries reached for message, routing to DLQ`);
        channel.nack(message, false, false); // Reject without requeue (goes to DLQ)
      }
    }
  }

  /**
   * Start consuming messages
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.warn(`[Consumer] Already running for queue: ${this.queueName}`);
      return;
    }

    this.isRunning = true;

    await this.channelWrapper.addSetup(async (channel: Channel) => {
      await this.setupChannel(channel);

      const consumeResult = await channel.consume(
        this.queueName,
        (message) => {
          this.handleMessage(channel, message).catch((error) => {
            console.error(`[Consumer] Unhandled error in message handler:`, error);
          });
        },
        {
          noAck: this.noAck,
        }
      );

      this.consumerTag = consumeResult.consumerTag;
      console.log(`[Consumer] Started consuming from queue: ${this.queueName}`);
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
      await this.channelWrapper.cancel(this.consumerTag);
      this.consumerTag = null;
    }

    this.isRunning = false;
    console.log(`[Consumer] Stopped consuming from queue: ${this.queueName}`);
  }

  /**
   * Close consumer channel
   */
  async close(): Promise<void> {
    await this.stop();
    await this.channelWrapper.close();
  }
}

