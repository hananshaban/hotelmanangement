import type { MessageContext } from '../queue/rabbitmq_consumer_base.js';
import { BaseRabbitMQConsumer } from '../queue/rabbitmq_consumer_base.js';
import { QUEUE_NAMES } from '../queue/rabbitmq_topology.js';
import {
  findChannelEventByIdempotencyKey,
  updateChannelEventStatus,
  markChannelEventProcessed,
  markChannelEventFailed,
  incrementChannelEventAttempts,
  getChannelEventById,
} from '../repositories/channel_event_repository.js';
import { Beds24Client } from '../beds24_client.js';
import { ReservationPushService } from '../services/reservation_push_service.js';
import { AvailabilityPushService } from '../services/availability_push_service.js';
import db from '../../../config/database.js';
import { decrypt } from '../../../utils/encryption.js';
import dotenv from 'dotenv';

const PROPERTY_ID = '00000000-0000-0000-0000-000000000001';

dotenv.config();

/**
 * Outbound Worker
 * Consumes messages from pms.outbound queue and calls Beds24 API
 */
export class OutboundWorker extends BaseRabbitMQConsumer {
  constructor() {
    super(QUEUE_NAMES.OUTBOUND, 1, false); // Prefetch: 1, noAck: false
  }

  /**
   * Get Beds24 client with refresh token
   */
  private async getBeds24Client(): Promise<Beds24Client> {
    const config = await db('beds24_config')
      .where({ property_id: PROPERTY_ID })
      .first();

    if (!config) {
      throw new Error('Beds24 configuration not found. Please configure Beds24 integration in settings.');
    }

    if (!config.refresh_token) {
      throw new Error(
        'Beds24 refresh token is missing. Please re-authenticate with Beds24 in settings.'
      );
    }

    let refreshToken: string;
    try {
      refreshToken = decrypt(config.refresh_token);
    } catch (error) {
      // Enhanced error message for decryption failures
      const errorMessage = error instanceof Error ? error.message : 'Unknown decryption error';
      
      // Check if it's a format issue
      if (!config.refresh_token.includes(':')) {
        throw new Error(
          'Beds24 refresh token appears to be in invalid format. ' +
          'This may indicate the token was not properly encrypted. ' +
          'Please re-authenticate with Beds24 in settings. ' +
          `Original error: ${errorMessage}`
        );
      }

      // Check if encryption key might have changed
      const encryptionKeySet = !!process.env.ENCRYPTION_KEY;
      throw new Error(
        `Failed to decrypt Beds24 refresh token. ` +
        `This usually means the ENCRYPTION_KEY environment variable has changed ` +
        `or the token was encrypted with a different key. ` +
        `Please re-authenticate with Beds24 in settings to generate a new encrypted token. ` +
        `ENCRYPTION_KEY is ${encryptionKeySet ? 'set' : 'not set'}. ` +
        `Original error: ${errorMessage}`
      );
    }

    if (!refreshToken || refreshToken.trim() === '') {
      throw new Error(
        'Decrypted Beds24 refresh token is empty. Please re-authenticate with Beds24 in settings.'
      );
    }

    return new Beds24Client(refreshToken);
  }

  /**
   * Process message from queue
   */
  protected async processMessage(context: MessageContext): Promise<void> {
    const { content, message } = context;
    const { channelEventId, eventType, ...payload } = content;

    if (!channelEventId) {
      throw new Error('Invalid message format: missing channelEventId');
    }

    // Load channel event
    const channelEvent = await getChannelEventById(channelEventId);
    if (!channelEvent) {
      throw new Error(`Channel event not found: ${channelEventId}`);
    }

    // Check if already processed (idempotency check)
    if (channelEvent.status === 'done') {
      console.log(`[OutboundWorker] Event already processed: ${channelEventId}`);
      return; // Already processed, skip
    }

    // Update status to 'processing'
    await updateChannelEventStatus(channelEvent.id, {
      status: 'processing',
    });

    try {
      const client = await this.getBeds24Client();
      const idempotencyKey = channelEvent.idempotency_key;

      // Route to appropriate handler based on event_type
      switch (channelEvent.event_type) {
        case 'booking.create':
        case 'booking.update': {
          const reservationId = payload.reservationId || channelEvent.entity_internal_id;
          if (!reservationId) {
            throw new Error('Reservation ID not found in payload');
          }

          const service = new ReservationPushService(client);
          const result = await service.pushReservation(reservationId, {
            idempotencyKey,
          });

          if (!result.success) {
            throw new Error(result.error || 'Failed to push reservation');
          }
          break;
        }

        case 'booking.cancel': {
          const reservationId = payload.reservationId || channelEvent.entity_internal_id;
          if (!reservationId) {
            throw new Error('Reservation ID not found in payload');
          }

          const service = new ReservationPushService(client);
          const result = await service.cancelReservation(reservationId, {
            idempotencyKey,
          });

          if (!result.success) {
            throw new Error(result.error || 'Failed to cancel reservation');
          }
          break;
        }

        case 'availability.update': {
          const roomId = payload.roomId || channelEvent.entity_internal_id;
          if (!roomId) {
            throw new Error('Room ID not found in payload');
          }

          const service = new AvailabilityPushService(client);
          const result = await service.pushRoomAvailability(roomId, undefined, {
            idempotencyKey,
          });

          if (!result.success) {
            throw new Error(result.error || 'Failed to push availability');
          }
          break;
        }

        case 'rate.update': {
          const roomId = payload.roomId || channelEvent.entity_internal_id;
          if (!roomId) {
            throw new Error('Room ID not found in payload');
          }

          const service = new AvailabilityPushService(client);
          const result = await service.pushRates(roomId, idempotencyKey);

          if (!result.success) {
            throw new Error(result.error || 'Failed to push rates');
          }
          break;
        }

        default:
          throw new Error(`Unknown event type: ${channelEvent.event_type}`);
      }

      // Mark as processed successfully
      await markChannelEventProcessed(channelEvent.id);
      console.log(`[OutboundWorker] Successfully processed event: ${channelEventId}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const isDecryptionError = errorMessage.includes('Decryption failed') || 
                                 errorMessage.includes('decrypt') ||
                                 errorMessage.includes('ENCRYPTION_KEY');

      // Enhanced error logging with context
      console.error(`[OutboundWorker] Error processing event ${channelEventId}:`, {
        channelEventId,
        eventType: channelEvent.event_type,
        entityId: channelEvent.entity_internal_id,
        error: errorMessage,
        isDecryptionError,
        stack: error instanceof Error ? error.stack : undefined,
      });

      // Increment attempts
      await incrementChannelEventAttempts(channelEvent.id);

      // Check if max attempts reached
      const updatedEvent = await getChannelEventById(channelEventId);
      if (updatedEvent && updatedEvent.attempts >= updatedEvent.max_attempts) {
        // Max attempts reached, mark as failed (will go to DLQ)
        const failureMessage = isDecryptionError
          ? `${errorMessage} - This is a configuration issue. Please re-authenticate with Beds24.`
          : errorMessage;

        await markChannelEventFailed(channelEvent.id, failureMessage);
        
        console.error(
          `[OutboundWorker] Max attempts reached for event: ${channelEventId}`,
          {
            error: errorMessage,
            attempts: updatedEvent.attempts,
            maxAttempts: updatedEvent.max_attempts,
            isDecryptionError,
            recommendation: isDecryptionError
              ? 'Re-authenticate with Beds24 in settings to fix encryption issue'
              : 'Check error details and retry manually if needed',
          }
        );
      }

      // For decryption errors, don't retry - it's a configuration issue
      // Mark as failed immediately to prevent infinite retries
      if (isDecryptionError && updatedEvent && updatedEvent.attempts >= 1) {
        await markChannelEventFailed(
          channelEvent.id,
          `${errorMessage} - Configuration issue. Please re-authenticate with Beds24.`
        );
        console.error(
          `[OutboundWorker] Marking event as failed due to decryption error (configuration issue): ${channelEventId}`
        );
        // Don't re-throw - we've marked it as failed, no need to retry
        return;
      }

      // Re-throw to trigger nack and retry/DLQ routing for other errors
      throw error;
    }
  }
}

/**
 * Start outbound worker
 */
export async function startOutboundWorker(): Promise<OutboundWorker> {
  const worker = new OutboundWorker();
  await worker.start();
  console.log('[OutboundWorker] Started consuming from pms.outbound queue');
  return worker;
}

/**
 * Stop outbound worker
 */
export async function stopOutboundWorker(worker: OutboundWorker): Promise<void> {
  await worker.stop();
  console.log('[OutboundWorker] Stopped');
}

