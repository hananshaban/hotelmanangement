import crypto from 'crypto';
import db from '../../../config/database.js';

/**
 * Validate webhook HMAC signature
 */
export async function validateWebhookSignature(
  payload: string,
  signature: string,
  hotelId: string = '00000000-0000-0000-0000-000000000000'
): Promise<boolean> {
  // Load webhook secret from config
  const config = await db('beds24_config')
    .where({ hotel_id: hotelId })
    .first();

  if (!config?.webhook_secret) {
    console.warn('Webhook secret not configured');
    return false;
  }

  // Calculate expected signature
  const expectedSignature = crypto
    .createHmac('sha256', config.webhook_secret)
    .update(payload)
    .digest('hex');

  // Compare signatures (constant-time comparison)
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

/**
 * Check if webhook event was already processed (idempotency)
 */
export async function isWebhookEventProcessed(eventId: string): Promise<boolean> {
  const event = await db('webhook_events')
    .where({ event_id: eventId })
    .first();

  return event?.processed === true;
}

/**
 * Store webhook event for idempotency
 */
export async function storeWebhookEvent(
  eventId: string,
  eventType: string,
  payload: any
): Promise<string> {
  const [event] = await db('webhook_events')
    .insert({
      event_id: eventId,
      event_type: eventType,
      payload: JSON.stringify(payload),
      processed: false,
    })
    .onConflict('event_id')
    .merge()
    .returning('id');

  return event.id;
}

/**
 * Mark webhook event as processed
 */
export async function markWebhookEventProcessed(
  eventId: string,
  success: boolean,
  errorMessage?: string
): Promise<void> {
  await db('webhook_events')
    .where({ event_id: eventId })
    .update({
      processed: true,
      processed_at: new Date(),
      error_message: errorMessage || null,
    });
}

