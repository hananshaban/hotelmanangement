/**
 * Sync hooks - Queue Beds24 sync jobs when PMS data changes
 * 
 * These functions should be called after successful database operations
 * Now uses RabbitMQ for event-driven processing
 */

import { publishOutbound } from '../queue/rabbitmq_publisher.js';
import {
  createChannelEvent,
  updateChannelEventStatus,
} from '../repositories/channel_event_repository.js';
import db from '../../../config/database.js';

/**
 * Check if Beds24 sync is enabled
 */
async function isSyncEnabled(): Promise<boolean> {
  const propertyId = '00000000-0000-0000-0000-000000000001';
  const config = await db('beds24_config')
    .where({ property_id: propertyId })
    .first();

  return config?.sync_enabled === true && config?.push_sync_enabled === true;
}

/**
 * Generate idempotency key for outbound event
 */
function generateIdempotencyKey(
  entityType: string,
  entityId: string,
  action: string,
  timestamp?: number
): string {
  const ts = timestamp || Date.now();
  return `pms-${entityType}-${entityId}-${action}-${ts}`;
}

/**
 * Queue reservation sync after create/update/cancel
 * Call this after successfully creating, updating, or cancelling a reservation
 */
export async function queueReservationSyncHook(
  reservationId: string,
  action: 'create' | 'update' | 'cancel' = 'update'
): Promise<void> {
  try {
    if (!(await isSyncEnabled())) {
      return; // Sync disabled, skip
    }

    // Skip if reservation source is Beds24 (already synced)
    const reservation = await db('reservations')
      .where({ id: reservationId })
      .whereNull('deleted_at')
      .first();

    if (reservation?.source === 'Beds24') {
      return; // Skip sync for Beds24-originated reservations
    }

    // Generate idempotency key
    const idempotencyKey = generateIdempotencyKey('booking', reservationId, action);

    // Persist event to channel_events
    const channelEvent = await createChannelEvent({
      direction: 'outbound',
      source: 'pms',
      event_type: `booking.${action}`,
      entity_type: 'booking',
      entity_internal_id: reservationId,
      entity_external_id: reservation.beds24_booking_id || null,
      idempotency_key: idempotencyKey,
      payload: {
        reservationId,
        action,
        beds24BookingId: reservation.beds24_booking_id,
      },
    });

    // Publish to RabbitMQ (fire and forget)
    publishOutbound(
      `booking.${action}`,
      {
        channelEventId: channelEvent.id,
        reservationId,
        action,
        beds24BookingId: reservation.beds24_booking_id,
      },
      {
        messageId: channelEvent.id,
        priority: 10, // High priority for bookings
      }
    )
      .then(() => {
        console.log(
          `[SyncHook] Successfully queued reservation sync for ${reservationId} (event: ${channelEvent.id})`
        );
      })
      .catch((error) => {
        // Enhanced error logging
        console.error(`[SyncHook] Failed to publish reservation sync for ${reservationId}:`, {
          reservationId,
          channelEventId: channelEvent.id,
          action,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
        
        // Update channel event status to failed if publish fails
        // This ensures we track the failure even if RabbitMQ is down
        updateChannelEventStatus(channelEvent.id, {
          status: 'failed',
          error: `Failed to publish to RabbitMQ: ${error instanceof Error ? error.message : String(error)}`,
        }).catch((updateError) => {
          console.error(
            `[SyncHook] Failed to update channel event status for ${channelEvent.id}:`,
            updateError
          );
        });
        
        // Don't throw - sync failures shouldn't break the main operation
      });
  } catch (error) {
    // Log but don't throw - sync is non-blocking
    console.error(`[SyncHook] Error in reservation sync hook for ${reservationId}:`, error);
  }
}

/**
 * Queue reservation cancellation sync
 * Call this after successfully cancelling a reservation
 */
export async function queueReservationCancelHook(reservationId: string): Promise<void> {
  try {
    if (!(await isSyncEnabled())) {
      return;
    }

    const reservation = await db('reservations')
      .where({ id: reservationId })
      .whereNull('deleted_at')
      .first();

    if (reservation?.source === 'Beds24' || !reservation?.beds24_booking_id) {
      return; // Skip if from Beds24 or not synced
    }

    // Use queueReservationSyncHook with cancel action
    await queueReservationSyncHook(reservationId, 'cancel');
  } catch (error) {
    console.error(`[SyncHook] Error in reservation cancel sync hook for ${reservationId}:`, error);
  }
}

/**
 * Queue room availability sync
 * Call this after room status changes, housekeeping updates, or maintenance changes
 */
export async function queueRoomAvailabilitySyncHook(roomId: string): Promise<void> {
  try {
    if (!(await isSyncEnabled())) {
      return;
    }

    // Check if room is mapped to Beds24
    const room = await db('rooms').where({ id: roomId }).first();
    if (!room?.beds24_room_id) {
      return; // Room not mapped to Beds24, skip
    }

    // Generate idempotency key
    const idempotencyKey = generateIdempotencyKey('availability', roomId, 'update');

    // Persist event to channel_events
    const channelEvent = await createChannelEvent({
      direction: 'outbound',
      source: 'pms',
      event_type: 'availability.update',
      entity_type: 'availability',
      entity_internal_id: roomId,
      entity_external_id: room.beds24_room_id,
      idempotency_key: idempotencyKey,
      payload: {
        roomId,
        beds24RoomId: room.beds24_room_id,
      },
    });

    // Publish to RabbitMQ (fire and forget)
    publishOutbound(
      'availability.update',
      {
        channelEventId: channelEvent.id,
        roomId,
        beds24RoomId: room.beds24_room_id,
      },
      {
        messageId: channelEvent.id,
        priority: 5, // Medium priority for availability
      }
    ).catch((error) => {
      console.error(`[SyncHook] Failed to publish availability sync for room ${roomId}:`, error);
    });
  } catch (error) {
    console.error(`[SyncHook] Error in room availability sync hook for ${roomId}:`, error);
  }
}

/**
 * Queue room rates sync
 * Call this after room price changes
 */
export async function queueRoomRatesSyncHook(roomId: string): Promise<void> {
  try {
    if (!(await isSyncEnabled())) {
      return;
    }

    const room = await db('rooms').where({ id: roomId }).first();
    if (!room?.beds24_room_id) {
      return;
    }

    // Generate idempotency key
    const idempotencyKey = generateIdempotencyKey('rate', roomId, 'update');

    // Persist event to channel_events
    const channelEvent = await createChannelEvent({
      direction: 'outbound',
      source: 'pms',
      event_type: 'rate.update',
      entity_type: 'rate',
      entity_internal_id: roomId,
      entity_external_id: room.beds24_room_id,
      idempotency_key: idempotencyKey,
      payload: {
        roomId,
        beds24RoomId: room.beds24_room_id,
        pricePerNight: room.price_per_night,
      },
    });

    // Publish to RabbitMQ (fire and forget)
    publishOutbound(
      'rate.update',
      {
        channelEventId: channelEvent.id,
        roomId,
        beds24RoomId: room.beds24_room_id,
        pricePerNight: room.price_per_night,
      },
      {
        messageId: channelEvent.id,
        priority: 3, // Low priority for rates
      }
    ).catch((error) => {
      console.error(`[SyncHook] Failed to publish rates sync for room ${roomId}:`, error);
    });
  } catch (error) {
    console.error(`[SyncHook] Error in room rates sync hook for ${roomId}:`, error);
  }
}

/**
 * Queue availability sync for all rooms
 * Useful for scheduled full syncs
 */
export async function queueAllRoomsAvailabilitySyncHook(): Promise<void> {
  try {
    if (!(await isSyncEnabled())) {
      return;
    }

    const rooms = await db('rooms')
      .whereNotNull('beds24_room_id')
      .select('id');

    for (const room of rooms) {
      queueRoomAvailabilitySyncHook(room.id).catch((error) => {
        console.error(`Failed to queue availability sync for room ${room.id}:`, error);
      });
    }
  } catch (error) {
    console.error('Error in all rooms availability sync hook:', error);
  }
}

