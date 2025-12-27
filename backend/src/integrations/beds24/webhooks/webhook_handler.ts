import type { Request, Response } from 'express';
import type { Beds24Booking } from '../beds24_types.js';
import { validateWebhookSignature } from './webhook_validator.js';
import { createChannelEvent, findChannelEventByIdempotencyKey } from '../repositories/channel_event_repository.js';
import { publishInbound } from '../queue/rabbitmq_publisher.js';

/**
 * Webhook event types from Beds24
 */
type WebhookEventType = 'booking.created' | 'booking.modified' | 'booking.cancelled' | 'booking.deleted';

/**
 * Beds24 webhook payload structure
 */
interface Beds24WebhookPayload {
  event: WebhookEventType;
  booking: Beds24Booking;
  eventId?: string;
  timestamp?: string;
}

/**
 * Webhook handler endpoint
 * Enhanced to persist events to channel_events and publish to RabbitMQ
 */
export async function webhookHandler(req: Request, res: Response): Promise<void> {
  try {
    // Get signature from header
    const signature = req.headers['x-beds24-signature'] as string;
    
    // Reconstruct raw body from parsed body for signature verification
    // Note: In production, consider using express.raw() middleware for webhook routes
    const rawBody = JSON.stringify(req.body);

    if (!signature) {
      res.status(401).json({
        error: 'Missing signature header',
      });
      return;
    }

    // Validate signature
    const isValid = await validateWebhookSignature(rawBody, signature);
    if (!isValid) {
      res.status(401).json({
        error: 'Invalid signature',
      });
      return;
    }

    // Parse payload
    const payload: Beds24WebhookPayload = req.body;

    if (!payload.event || !payload.booking) {
      res.status(400).json({
        error: 'Invalid webhook payload',
      });
      return;
    }

    // Generate idempotency key (use eventId if provided, otherwise generate)
    const idempotencyKey = payload.eventId || `beds24-${payload.booking.id}-${payload.event}-${Date.now()}`;

    // Check idempotency using channel_events
    const existingEvent = await findChannelEventByIdempotencyKey(idempotencyKey);
    if (existingEvent) {
      // Already processed, return success
      res.status(200).json({
        success: true,
        message: 'Event already processed',
        eventId: existingEvent.id,
      });
      return;
    }

    // Persist event to channel_events (status: 'received')
    const channelEvent = await createChannelEvent({
      direction: 'inbound',
      source: 'beds24',
      event_type: payload.event,
      entity_type: 'booking',
      entity_external_id: payload.booking.id?.toString() || null,
      idempotency_key: idempotencyKey,
      payload: payload,
    });

    // Publish to RabbitMQ inbound queue (non-blocking)
    publishInbound(
      payload.event,
      {
        channelEventId: channelEvent.id,
        booking: payload.booking,
        eventId: idempotencyKey,
      },
      {
        messageId: channelEvent.id,
        priority: 10, // High priority for bookings
      }
    ).catch((error) => {
      console.error(`[Webhook] Failed to publish to RabbitMQ:`, error);
      // Update event status to failed if publish fails
      // Note: This will be handled by the worker retry logic
    });

    // Update event status to 'processing' (published to queue)
    // This will be done by the worker, but we can mark it here for tracking
    // Actually, let's leave it as 'received' and let the worker update it to 'processing'

    // Return immediately (async processing via queue)
    res.status(200).json({
      success: true,
      message: 'Webhook received and queued for processing',
      eventId: channelEvent.id,
    });
  } catch (error) {
    console.error('[Webhook] Handler error:', error);
    res.status(500).json({
      error: 'Internal server error',
    });
  }
}

