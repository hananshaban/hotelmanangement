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
 * Load QloApps config for a property
 */
async function getQloAppsConfig(hotelId: string) {
  return db('qloapps_config')
    .where({ hotel_id: hotelId })
    .first();
}

/**
 * Check if any QloApps sync is globally enabled for a property
 */
async function isQloAppsSyncEnabled(hotelId: string): Promise<boolean> {
  const config = await getQloAppsConfig(hotelId);
  return config?.sync_enabled === true;
}

/**
 * Check if outbound reservation (and guest) sync is enabled
 */
async function isQloAppsReservationSyncEnabled(hotelId: string): Promise<boolean> {
  const config = await getQloAppsConfig(hotelId);

  if (!config) {
    console.warn(
      `[QloApps SyncHook] QloApps config not found for property ${hotelId}, skipping reservation sync`
    );
    return false;
  }

  if (!config.sync_enabled) {
    console.warn(
      `[QloApps SyncHook] Global sync disabled for property ${hotelId}, skipping reservation sync`
    );
    return false;
  }

  if (!config.sync_reservations_outbound) {
    console.warn(
      `[QloApps SyncHook] Outbound reservation sync disabled for property ${hotelId}, skipping reservation sync`
    );
    return false;
  }

  return true;
}

/**
 * Check if availability sync is enabled
 */
async function isQloAppsAvailabilitySyncEnabled(hotelId: string): Promise<boolean> {
  const config = await getQloAppsConfig(hotelId);

  if (!config) {
    console.warn(
      `[QloApps SyncHook] QloApps config not found for property ${hotelId}, skipping availability sync`
    );
    return false;
  }

  if (!config.sync_enabled) {
    console.warn(
      `[QloApps SyncHook] Global sync disabled for property ${hotelId}, skipping availability sync`
    );
    return false;
  }

  if (!config.sync_availability) {
    console.warn(
      `[QloApps SyncHook] Availability sync disabled for property ${hotelId}, skipping availability sync`
    );
    return false;
  }

  return true;
}

/**
 * Check if rate sync is enabled
 */
async function isQloAppsRateSyncEnabled(hotelId: string): Promise<boolean> {
  const config = await getQloAppsConfig(hotelId);

  if (!config) {
    console.warn(
      `[QloApps SyncHook] QloApps config not found for property ${hotelId}, skipping rate sync`
    );
    return false;
  }

  if (!config.sync_enabled) {
    console.warn(
      `[QloApps SyncHook] Global sync disabled for property ${hotelId}, skipping rate sync`
    );
    return false;
  }

  if (!config.sync_rates) {
    console.warn(
      `[QloApps SyncHook] Rate sync disabled for property ${hotelId}, skipping rate sync`
    );
    return false;
  }

  return true;
}

/**
 * Get QloApps config ID for a property
 */
async function getQloAppsConfigId(hotelId: string): Promise<string | null> {
  const config = await db('qloapps_config')
    .where({ hotel_id: hotelId })
    .first();

  return config?.id ?? null;
}

/**
 * Get default property ID (for single-property installations)
 */
function getDefaultPropertyId(): string {
  return '00000000-0000-0000-0000-000000000000';
}

/**
 * Get room type's property ID
 */
async function getRoomTypePropertyId(roomTypeId: string): Promise<string | null> {
  const roomType = await db('room_types').where({ id: roomTypeId }).first();
  return roomType?.hotel_id ?? getDefaultPropertyId();
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
    const hotelId = (await getReservationPropertyId(reservationId)) ?? getDefaultPropertyId();

    // Check if reservation outbound sync is enabled
    if (!(await isQloAppsReservationSyncEnabled(hotelId))) {
      return; // Sync disabled, skip
    }

    // Get config ID (we know config exists from the helper above)
    const configId = await getQloAppsConfigId(hotelId);
    if (!configId) {
      console.warn(
        `[QloApps SyncHook] No QloApps config found for property ${hotelId}`
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
    const hotelId = (await getRoomTypePropertyId(roomTypeId)) ?? getDefaultPropertyId();

    // Check if availability sync is enabled
    if (!(await isQloAppsAvailabilitySyncEnabled(hotelId))) {
      return;
    }

    // Get config ID
    const configId = await getQloAppsConfigId(hotelId);
    if (!configId) {
      console.warn(
        `[QloApps SyncHook] No QloApps config found for property ${hotelId}`
      );
      return;
    }

    // Check if room type is mapped to QloApps
    const mapping = await db('qloapps_room_type_mappings')
      .where({ local_room_type_id: roomTypeId })
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
    const hotelId = (await getRoomTypePropertyId(roomTypeId)) ?? getDefaultPropertyId();

    // Check if rate sync is enabled
    if (!(await isQloAppsRateSyncEnabled(hotelId))) {
      return;
    }

    // Get config ID
    const configId = await getQloAppsConfigId(hotelId);
    if (!configId) {
      console.warn(
        `[QloApps SyncHook] No QloApps config found for property ${hotelId}`
      );
      return;
    }

    // Check if room type is mapped to QloApps
    const mapping = await db('qloapps_room_type_mappings')
      .where({ local_room_type_id: roomTypeId })
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
    const hotelId = (await getRoomTypePropertyId(roomTypeId)) ?? getDefaultPropertyId();

    // Check if reservation/room type outbound sync is enabled (uses reservation flag)
    if (!(await isQloAppsReservationSyncEnabled(hotelId))) {
      return;
    }

    // Get config ID
    const configId = await getQloAppsConfigId(hotelId);
    if (!configId) {
      console.warn(
        `[QloApps SyncHook] No QloApps config found for property ${hotelId}`
      );
      return;
    }

    // Check if room type is mapped to QloApps
    const mapping = await db('qloapps_room_type_mappings')
      .where({ local_room_type_id: roomTypeId })
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
// Guest Sync Hooks
// ============================================================================

/**
 * Get guest's property ID
 */
async function getGuestPropertyId(guestId: string): Promise<string | null> {
  const guest = await db('guests').where({ id: guestId }).first();
  return guest?.hotel_id ?? getDefaultPropertyId();
}

/**
 * Queue guest sync after create/update
 * Call this after successfully creating or updating a guest
 *
 * @param guestId - The PMS guest ID
 * @param action - The action type: create or update
 */
export async function queueQloAppsGuestSyncHook(
  guestId: string,
  action: 'create' | 'update' = 'update'
): Promise<void> {
  try {
    // Get property ID from guest
    const hotelId = (await getGuestPropertyId(guestId)) ?? getDefaultPropertyId();

    // Check if reservation/guest outbound sync is enabled (uses reservation flag)
    if (!(await isQloAppsReservationSyncEnabled(hotelId))) {
      return; // Sync disabled, skip
    }

    // Get config ID
    const configId = await getQloAppsConfigId(hotelId);
    if (!configId) {
      console.warn(
        `[QloApps SyncHook] No QloApps config found for property ${hotelId}`
      );
      return;
    }

    // Queue the sync based on action
    let messageId: string;
    switch (action) {
      case 'create':
        messageId = await qloAppsPublisher.queueGuestCreate(configId, guestId);
        break;
      case 'update':
        messageId = await qloAppsPublisher.queueGuestUpdate(configId, guestId);
        break;
    }

    console.log(
      `[QloApps SyncHook] Queued guest.${action} for ${guestId} (message: ${messageId})`
    );
  } catch (error) {
    // Log but don't throw - sync is non-blocking
    console.error(
      `[QloApps SyncHook] Error in guest sync hook for ${guestId}:`,
      error
    );
  }
}

// ============================================================================
// Check-in Sync Hooks
// ============================================================================

/**
 * Get check-in's property ID from reservation
 */
async function getCheckInPropertyId(checkInId: string): Promise<string | null> {
  const checkIn = await db('check_ins')
    .where({ id: checkInId })
    .whereNull('deleted_at')
    .first();

  if (!checkIn?.reservation_id) {
    return getDefaultPropertyId();
  }

  return getReservationPropertyId(checkIn.reservation_id);
}

/**
 * Queue reservation sync after check-in
 * Updates QloApps booking status to reflect the check-in
 *
 * @param checkInId - The PMS check-in ID
 * @param action - The action type: checkin, checkout, or room_change
 */
export async function queueQloAppsCheckInSyncHook(
  checkInId: string,
  action: 'checkin' | 'checkout' | 'room_change' = 'checkin'
): Promise<void> {
  try {
    // Get reservation ID from check-in
    const checkIn = await db('check_ins')
      .where({ id: checkInId })
      .whereNull('deleted_at')
      .first();

    if (!checkIn || !checkIn.reservation_id) {
      console.warn(
        `[QloApps SyncHook] Check-in ${checkInId} not found or has no reservation`
      );
      return;
    }

    const reservationId = checkIn.reservation_id;

    // Get property ID from reservation
    const hotelId = (await getReservationPropertyId(reservationId)) ?? getDefaultPropertyId();

    // Check if reservation outbound sync is enabled
    if (!(await isQloAppsReservationSyncEnabled(hotelId))) {
      return; // Sync disabled, skip
    }

    // Get config ID
    const configId = await getQloAppsConfigId(hotelId);
    if (!configId) {
      console.warn(
        `[QloApps SyncHook] No QloApps config found for property ${hotelId}`
      );
      return;
    }

    // Check if reservation originated from QloApps
    const reservation = await db('reservations')
      .where({ id: reservationId })
      .whereNull('deleted_at')
      .first();

    if (!reservation) {
      console.warn(
        `[QloApps SyncHook] Reservation ${reservationId} not found`
      );
      return;
    }

    if (reservation.source === 'QloApps') {
      console.log(
        `[QloApps SyncHook] Skipping sync for QloApps-originated reservation ${reservationId} (check-in: ${action})`
      );
      return;
    }

    // Queue reservation update to sync check-in status
    // The mapper will handle converting check-in status to QloApps COMPLETED status
    const messageId = await qloAppsPublisher.queueReservationUpdate(
      configId,
      reservationId
    );

    console.log(
      `[QloApps SyncHook] Queued reservation.update for check-in ${action} on ${reservationId} (message: ${messageId})`
    );
  } catch (error) {
    // Log but don't throw - sync is non-blocking
    console.error(
      `[QloApps SyncHook] Error in check-in sync hook for ${checkInId}:`,
      error
    );
  }
}

/**
 * Queue reservation sync after checkout
 * Convenience function that calls queueQloAppsCheckInSyncHook with checkout action
 */
export async function queueQloAppsCheckOutSyncHook(
  checkInId: string
): Promise<void> {
  return queueQloAppsCheckInSyncHook(checkInId, 'checkout');
}

/**
 * Queue reservation sync after room change
 * Convenience function that calls queueQloAppsCheckInSyncHook with room_change action
 */
export async function queueQloAppsRoomChangeSyncHook(
  checkInId: string
): Promise<void> {
  return queueQloAppsCheckInSyncHook(checkInId, 'room_change');
}

// ============================================================================
// Bulk Sync Hooks
// ============================================================================

/**
 * Queue full sync for a property
 * Call this for initial sync or manual full sync requests
 *
 * @param hotelId - The property ID
 */
export async function queueQloAppsFullSyncHook(hotelId?: string): Promise<void> {
  try {
    const propId = hotelId ?? getDefaultPropertyId();

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
