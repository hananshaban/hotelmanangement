/**
 * QloApps Sync Hooks
 *
 * Queue QloApps sync jobs when PMS data changes.
 * These functions should be called after successful database operations.
 * Uses RabbitMQ for event-driven processing.
 */

import db from '../../../config/database.js';
import { qloAppsPublisher } from '../queue/rabbitmq_publisher.js';

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if QloApps sync is enabled for a property
 */
async function isQloAppsSyncEnabled(propertyId: string): Promise<boolean> {
  const config = await db('qloapps_config')
    .where({ property_id: propertyId })
    .whereNull('deleted_at')
    .first();

  return config?.sync_enabled === true && config?.push_sync_enabled === true;
}

/**
 * Get QloApps config ID for a property
 */
async function getQloAppsConfigId(propertyId: string): Promise<string | null> {
  const config = await db('qloapps_config')
    .where({ property_id: propertyId })
    .whereNull('deleted_at')
    .first();

  return config?.id ?? null;
}

/**
 * Get default property ID (for single-property installations)
 */
function getDefaultPropertyId(): string {
  return '00000000-0000-0000-0000-000000000001';
}

/**
 * Get room type's property ID
 */
async function getRoomTypePropertyId(roomTypeId: string): Promise<string | null> {
  const roomType = await db('room_types').where({ id: roomTypeId }).first();
  return roomType?.property_id ?? getDefaultPropertyId();
}

/**
 * Get reservation's property ID from room type
 */
async function getReservationPropertyId(reservationId: string): Promise<string | null> {
  const reservation = await db('reservations')
    .where({ id: reservationId })
    .whereNull('deleted_at')
    .first();

  if (!reservation?.room_type_id) {
    return getDefaultPropertyId();
  }

  return getRoomTypePropertyId(reservation.room_type_id);
}

// ============================================================================
// Reservation Sync Hooks
// ============================================================================

/**
 * Queue reservation sync after create/update/cancel
 * Call this after successfully creating, updating, or cancelling a reservation
 *
 * @param reservationId - The PMS reservation ID
 * @param action - The action type: create, update, or cancel
 */
export async function queueQloAppsReservationSyncHook(
  reservationId: string,
  action: 'create' | 'update' | 'cancel' = 'update'
): Promise<void> {
  try {
    // Get property ID from reservation
    const propertyId = (await getReservationPropertyId(reservationId)) ?? getDefaultPropertyId();

    // Check if sync is enabled
    if (!(await isQloAppsSyncEnabled(propertyId))) {
      return; // Sync disabled, skip
    }

    // Get config ID
    const configId = await getQloAppsConfigId(propertyId);
    if (!configId) {
      console.warn(
        `[QloApps SyncHook] No QloApps config found for property ${propertyId}`
      );
      return;
    }

    // Skip if reservation source is QloApps (already synced from there)
    const reservation = await db('reservations')
      .where({ id: reservationId })
      .whereNull('deleted_at')
      .first();

    if (!reservation) {
      console.warn(
        `[QloApps SyncHook] Reservation ${reservationId} not found, skipping sync`
      );
      return;
    }

    if (reservation.source === 'QloApps') {
      console.log(
        `[QloApps SyncHook] Skipping sync for QloApps-originated reservation ${reservationId}`
      );
      return;
    }

    // Queue the sync based on action
    let messageId: string;
    switch (action) {
      case 'create':
        messageId = await qloAppsPublisher.queueReservationCreate(
          configId,
          reservationId
        );
        break;
      case 'update':
        messageId = await qloAppsPublisher.queueReservationUpdate(
          configId,
          reservationId
        );
        break;
      case 'cancel':
        messageId = await qloAppsPublisher.queueReservationCancel(
          configId,
          reservationId
        );
        break;
    }

    console.log(
      `[QloApps SyncHook] Queued reservation.${action} for ${reservationId} (message: ${messageId})`
    );
  } catch (error) {
    // Log but don't throw - sync is non-blocking
    console.error(
      `[QloApps SyncHook] Error in reservation sync hook for ${reservationId}:`,
      error
    );
  }
}

/**
 * Queue reservation cancellation sync
 * Convenience function that calls queueQloAppsReservationSyncHook with cancel action
 */
export async function queueQloAppsReservationCancelHook(
  reservationId: string
): Promise<void> {
  return queueQloAppsReservationSyncHook(reservationId, 'cancel');
}

// ============================================================================
// Availability Sync Hooks
// ============================================================================

/**
 * Queue availability sync for a room type
 * Call this after room availability changes (reservation create/update/cancel, room blocks, etc.)
 *
 * @param roomTypeId - The PMS room type ID
 * @param dateFrom - Start date (YYYY-MM-DD)
 * @param dateTo - End date (YYYY-MM-DD)
 */
export async function queueQloAppsAvailabilitySyncHook(
  roomTypeId: string,
  dateFrom: string,
  dateTo: string
): Promise<void> {
  try {
    // Get property ID from room type
    const propertyId = (await getRoomTypePropertyId(roomTypeId)) ?? getDefaultPropertyId();

    // Check if sync is enabled
    if (!(await isQloAppsSyncEnabled(propertyId))) {
      return;
    }

    // Get config ID
    const configId = await getQloAppsConfigId(propertyId);
    if (!configId) {
      console.warn(
        `[QloApps SyncHook] No QloApps config found for property ${propertyId}`
      );
      return;
    }

    // Check if room type is mapped to QloApps
    const mapping = await db('qloapps_room_type_mappings')
      .where({ pms_room_type_id: roomTypeId })
      .whereNull('deleted_at')
      .first();

    if (!mapping) {
      console.log(
        `[QloApps SyncHook] Room type ${roomTypeId} not mapped to QloApps, skipping availability sync`
      );
      return;
    }

    // Queue the sync
    const messageId = await qloAppsPublisher.queueAvailabilityUpdate(
      configId,
      roomTypeId,
      dateFrom,
      dateTo
    );

    console.log(
      `[QloApps SyncHook] Queued availability.update for room type ${roomTypeId} (${dateFrom} to ${dateTo}, message: ${messageId})`
    );
  } catch (error) {
    console.error(
      `[QloApps SyncHook] Error in availability sync hook for room type ${roomTypeId}:`,
      error
    );
  }
}

/**
 * Queue availability sync for a reservation's room type and date range
 * Convenience function to trigger availability sync based on reservation data
 */
export async function queueQloAppsReservationAvailabilitySyncHook(
  reservationId: string
): Promise<void> {
  try {
    const reservation = await db('reservations')
      .where({ id: reservationId })
      .whereNull('deleted_at')
      .first();

    if (!reservation || !reservation.room_type_id) {
      console.warn(
        `[QloApps SyncHook] Reservation ${reservationId} not found or has no room type`
      );
      return;
    }

    await queueQloAppsAvailabilitySyncHook(
      reservation.room_type_id,
      reservation.check_in,
      reservation.check_out
    );
  } catch (error) {
    console.error(
      `[QloApps SyncHook] Error in reservation availability sync hook for ${reservationId}:`,
      error
    );
  }
}

// ============================================================================
// Rate Sync Hooks
// ============================================================================

/**
 * Queue rate sync for a room type
 * Call this after rate changes
 *
 * @param roomTypeId - The PMS room type ID
 * @param dateFrom - Start date (YYYY-MM-DD)
 * @param dateTo - End date (YYYY-MM-DD)
 */
export async function queueQloAppsRateSyncHook(
  roomTypeId: string,
  dateFrom: string,
  dateTo: string
): Promise<void> {
  try {
    // Get property ID from room type
    const propertyId = (await getRoomTypePropertyId(roomTypeId)) ?? getDefaultPropertyId();

    // Check if sync is enabled
    if (!(await isQloAppsSyncEnabled(propertyId))) {
      return;
    }

    // Get config ID
    const configId = await getQloAppsConfigId(propertyId);
    if (!configId) {
      console.warn(
        `[QloApps SyncHook] No QloApps config found for property ${propertyId}`
      );
      return;
    }

    // Check if room type is mapped to QloApps
    const mapping = await db('qloapps_room_type_mappings')
      .where({ pms_room_type_id: roomTypeId })
      .whereNull('deleted_at')
      .first();

    if (!mapping) {
      console.log(
        `[QloApps SyncHook] Room type ${roomTypeId} not mapped to QloApps, skipping rate sync`
      );
      return;
    }

    // Queue the sync
    const messageId = await qloAppsPublisher.queueRateUpdate(
      configId,
      roomTypeId,
      dateFrom,
      dateTo
    );

    console.log(
      `[QloApps SyncHook] Queued rate.update for room type ${roomTypeId} (${dateFrom} to ${dateTo}, message: ${messageId})`
    );
  } catch (error) {
    console.error(
      `[QloApps SyncHook] Error in rate sync hook for room type ${roomTypeId}:`,
      error
    );
  }
}

// ============================================================================
// Room Type Sync Hooks
// ============================================================================

/**
 * Queue room type sync after updates
 * Call this after room type properties are updated
 *
 * @param roomTypeId - The PMS room type ID
 */
export async function queueQloAppsRoomTypeSyncHook(
  roomTypeId: string
): Promise<void> {
  try {
    // Get property ID from room type
    const propertyId = (await getRoomTypePropertyId(roomTypeId)) ?? getDefaultPropertyId();

    // Check if sync is enabled
    if (!(await isQloAppsSyncEnabled(propertyId))) {
      return;
    }

    // Get config ID
    const configId = await getQloAppsConfigId(propertyId);
    if (!configId) {
      console.warn(
        `[QloApps SyncHook] No QloApps config found for property ${propertyId}`
      );
      return;
    }

    // Check if room type is mapped to QloApps
    const mapping = await db('qloapps_room_type_mappings')
      .where({ pms_room_type_id: roomTypeId })
      .whereNull('deleted_at')
      .first();

    if (!mapping) {
      console.log(
        `[QloApps SyncHook] Room type ${roomTypeId} not mapped to QloApps, skipping room type sync`
      );
      return;
    }

    // For room type updates, we typically need to update availability
    // for the next 365 days (or a configurable window)
    const today = new Date();
    const futureDate = new Date();
    futureDate.setDate(today.getDate() + 365);

    const dateFrom = today.toISOString().slice(0, 10);
    const dateTo = futureDate.toISOString().slice(0, 10);

    // Queue availability update for the full window
    await queueQloAppsAvailabilitySyncHook(roomTypeId, dateFrom, dateTo);

    console.log(
      `[QloApps SyncHook] Triggered availability sync for room type ${roomTypeId} update`
    );
  } catch (error) {
    console.error(
      `[QloApps SyncHook] Error in room type sync hook for ${roomTypeId}:`,
      error
    );
  }
}

// ============================================================================
// Bulk Sync Hooks
// ============================================================================

/**
 * Queue full sync for a property
 * Call this for initial sync or manual full sync requests
 *
 * @param propertyId - The property ID
 */
export async function queueQloAppsFullSyncHook(propertyId?: string): Promise<void> {
  try {
    const propId = propertyId ?? getDefaultPropertyId();

    // Check if sync is enabled
    if (!(await isQloAppsSyncEnabled(propId))) {
      console.warn(
        `[QloApps SyncHook] Sync not enabled for property ${propId}`
      );
      return;
    }

    // Get config ID
    const configId = await getQloAppsConfigId(propId);
    if (!configId) {
      console.warn(
        `[QloApps SyncHook] No QloApps config found for property ${propId}`
      );
      return;
    }

    // Queue full inbound sync
    const messageId = await qloAppsPublisher.queueInboundSync(configId, {
      syncType: 'full',
      priority: 10, // Highest priority
    });

    console.log(
      `[QloApps SyncHook] Queued full sync for property ${propId} (message: ${messageId})`
    );
  } catch (error) {
    console.error(
      `[QloApps SyncHook] Error in full sync hook for property:`,
      error
    );
  }
}
