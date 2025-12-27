import type { MessageContext } from '../queue/rabbitmq_consumer_base.js';
import { BaseRabbitMQConsumer } from '../queue/rabbitmq_consumer_base.js';
import { QUEUE_NAMES } from '../queue/rabbitmq_topology.js';
import {
  findChannelEventByIdempotencyKey,
  updateChannelEventStatus,
  markChannelEventProcessed,
  markChannelEventFailed,
  incrementChannelEventAttempts,
} from '../repositories/channel_event_repository.js';
import { handleBookingCreated } from '../webhooks/handlers/booking_created_handler.js';
import { handleBookingModified } from '../webhooks/handlers/booking_modified_handler.js';
import { handleBookingCancelled } from '../webhooks/handlers/booking_cancelled_handler.js';
import { handleBookingDeleted } from '../webhooks/handlers/booking_deleted_handler.js';
import dotenv from 'dotenv';
dotenv.config();

/**
 * Inbound Worker
 * Consumes messages from beds24.inbound queue and processes them
 */
export class InboundWorker extends BaseRabbitMQConsumer {
  constructor() {
    super(QUEUE_NAMES.INBOUND, 1, false); // Prefetch: 1, noAck: false
  }

  /**
   * Process message from queue
   */
  protected async processMessage(context: MessageContext): Promise<void> {
    const { content, message } = context;
    const { channelEventId, booking, eventId } = content;

    if (!channelEventId || !booking || !eventId) {
      throw new Error('Invalid message format: missing required fields');
    }

    // Load channel event
    const channelEvent = await findChannelEventByIdempotencyKey(eventId);
    if (!channelEvent) {
      throw new Error(`Channel event not found: ${eventId}`);
    }

    // Check if already processed (idempotency check)
    if (channelEvent.status === 'done') {
      console.log(`[InboundWorker] Event already processed: ${eventId}`);
      return; // Already processed, skip
    }

    // Update status to 'processing'
    await updateChannelEventStatus(channelEvent.id, {
      status: 'processing',
    });

    try {
      // Route to appropriate handler based on event_type
      let result: { success: boolean; reservationId?: string; error?: string };

      switch (channelEvent.event_type) {
        case 'booking.created':
          result = await handleBookingCreated(booking);
          break;
        case 'booking.modified':
          result = await handleBookingModified(booking);
          break;
        case 'booking.cancelled':
          result = await handleBookingCancelled(booking);
          break;
        case 'booking.deleted':
          result = await handleBookingDeleted(booking);
          break;
        default:
          throw new Error(`Unknown event type: ${channelEvent.event_type}`);
      }

      if (result.success) {
        // Mark as processed successfully
        await markChannelEventProcessed(channelEvent.id);
        console.log(`[InboundWorker] Successfully processed event: ${eventId}`);
      } else {
        // Mark as failed
        await markChannelEventFailed(
          channelEvent.id,
          result.error || 'Handler returned success=false'
        );
        throw new Error(result.error || 'Handler processing failed');
      }
    } catch (error) {
      // Increment attempts
      await incrementChannelEventAttempts(channelEvent.id);

      // Check if max attempts reached
      const updatedEvent = await findChannelEventByIdempotencyKey(eventId);
      if (updatedEvent && updatedEvent.attempts >= updatedEvent.max_attempts) {
        // Max attempts reached, mark as failed (will go to DLQ)
        await markChannelEventFailed(
          channelEvent.id,
          error instanceof Error ? error.message : 'Unknown error'
        );
        console.error(
          `[InboundWorker] Max attempts reached for event: ${eventId}`,
          error
        );
      }

      // Re-throw to trigger nack and retry/DLQ routing
      throw error;
    }
  }
}

/**
 * Start inbound worker
 */
export async function startInboundWorker(): Promise<InboundWorker> {
  const worker = new InboundWorker();
  await worker.start();
  console.log('[InboundWorker] Started consuming from beds24.inbound queue');
  return worker;
}

/**
 * Stop inbound worker
 */
export async function stopInboundWorker(worker: InboundWorker): Promise<void> {
  await worker.stop();
  console.log('[InboundWorker] Stopped');
}

