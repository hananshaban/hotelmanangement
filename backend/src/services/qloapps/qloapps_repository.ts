/**
 * QloApps Repository
 *
 * Database access layer for QloApps integration data.
 * Handles CRUD operations for config, mappings, sync state, and logs.
 */

import db from '../../config/database.js';
import { encrypt, decrypt } from '../../utils/encryption.js';

// Default hotel ID for single-hotel installations
const HOTEL_ID = '00000000-0000-0000-0000-000000000000';

// =============================================================================
// Configuration Types
// =============================================================================

export interface QloAppsConfigRecord {
  id: string;
  hotel_id: string;
  base_url: string;
  api_key_encrypted: string;
  qloapps_hotel_id: number;
  sync_interval_minutes: number;
  sync_enabled: boolean;
  sync_reservations_inbound: boolean;
  sync_reservations_outbound: boolean;
  sync_availability: boolean;
  sync_rates: boolean;
  last_successful_sync: Date | null;
  last_sync_error: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface RoomTypeMappingRecord {
  id: string;
  hotel_id: string;
  local_room_type_id: string;
  qloapps_product_id: string;
  qloapps_hotel_id: string;
  metadata: Record<string, unknown> | null;
  last_synced_at: Date | null;
  last_sync_status: 'success' | 'failed' | 'partial' | null;
  last_sync_error: string | null;
  sync_direction: 'inbound' | 'outbound' | 'bidirectional';
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface ReservationMappingRecord {
  id: string;
  hotel_id: string;
  local_reservation_id: string;
  qloapps_order_id: string;
  qloapps_reference: string | null;
  qloapps_hotel_id: string;
  source: 'pms' | 'qloapps' | 'ota';
  ota_channel: string | null;
  ota_confirmation_number: string | null;
  is_active: boolean;
  qloapps_status_code: number | null;
  last_synced_at: Date | null;
  last_sync_status: 'success' | 'failed' | 'partial' | null;
  last_sync_error: string | null;
  local_hash: string | null;
  qloapps_hash: string | null;
  has_conflict: boolean;
  conflict_data: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
}

export interface CustomerMappingRecord {
  id: string;
  hotel_id: string;
  local_guest_id: string;
  qloapps_customer_id: string;
  qloapps_hotel_id: string;
  match_type: 'email' | 'phone' | 'manual' | 'booking';
  sync_direction: 'inbound' | 'outbound' | 'bidirectional';
  is_active: boolean;
  is_verified: boolean;
  local_hash: string | null;
  qloapps_hash: string | null;
  last_synced_at: Date | null;
  last_sync_status: 'success' | 'failed' | 'partial' | null;
  last_sync_error: string | null;
  metadata: Record<string, unknown> | null;
  has_conflict: boolean;
  conflict_data: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
}

export interface SyncStateRecord {
  id: string;
  hotel_id: string;
  sync_type: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  started_at: Date;
  completed_at: Date | null;
  last_successful_sync: Date | null;
  cursor: string | null;
  reservations_processed: number;
  reservations_created: number;
  reservations_updated: number;
  reservations_failed: number;
  room_types_processed: number;
  room_types_synced: number;
  customers_processed: number;
  customers_synced: number;
  availability_updates: number;
  rate_updates: number;
  duration_ms: number | null;
  api_calls_made: number;
  error_message: string | null;
  error_code: string | null;
  next_retry_at: Date | null;
  retry_count: number;
  max_retries: number;
  trigger_source: 'scheduled' | 'manual' | 'webhook' | 'event';
  triggered_by_user_id: string | null;
  lock_id: string | null;
  lock_expires_at: Date | null;
  metadata: Record<string, unknown> | null;
  summary: Record<string, unknown> | null;
  created_at: Date;
}

export interface SyncLogRecord {
  id: string;
  hotel_id: string;
  sync_state_id: string | null;
  operation: 'create' | 'update' | 'delete' | 'fetch' | 'push' | 'skip';
  entity_type: 'reservation' | 'room_type' | 'customer' | 'availability' | 'rate';
  direction: 'inbound' | 'outbound';
  local_entity_id: string | null;
  qloapps_entity_id: string | null;
  status: 'success' | 'failed' | 'skipped' | 'conflict';
  started_at: Date;
  completed_at: Date | null;
  duration_ms: number | null;
  api_endpoint: string | null;
  http_method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | null;
  http_status_code: number | null;
  request_payload: Record<string, unknown> | null;
  response_data: Record<string, unknown> | null;
  local_data_before: Record<string, unknown> | null;
  local_data_after: Record<string, unknown> | null;
  error_code: string | null;
  error_message: string | null;
  error_stack: string | null;
  changes: Record<string, unknown> | null;
  fields_updated: number | null;
  is_retry: boolean;
  retry_of_log_id: string | null;
  retry_attempt: number;
  had_conflict: boolean;
  conflict_resolution: 'local_wins' | 'remote_wins' | 'merged' | 'manual' | 'skipped' | null;
  metadata: Record<string, unknown> | null;
  created_at: Date;
}

// =============================================================================
// Configuration Repository
// =============================================================================

export class QloAppsConfigRepository {
  /**
   * Get the current QloApps configuration
   */
  async getConfig(): Promise<QloAppsConfigRecord | null> {
    const config = await db('qloapps_config')
      .where({ hotel_id: HOTEL_ID })
      .first();

    return config || null;
  }

  /**
   * Get the decrypted API key
   */
  async getDecryptedApiKey(): Promise<string | null> {
    const config = await this.getConfig();
    if (!config?.api_key_encrypted) {
      return null;
    }
    return decrypt(config.api_key_encrypted);
  }

  /**
   * Check if QloApps is configured
   */
  async isConfigured(): Promise<boolean> {
    const config = await this.getConfig();
    return config !== null && !!config.api_key_encrypted && !!config.base_url;
  }

  /**
   * Save new QloApps configuration
   */
  async saveConfig(data: {
    baseUrl: string;
    apiKey: string;
    qloAppsHotelId: number;
    syncIntervalMinutes?: number;
    syncEnabled?: boolean;
    syncReservationsInbound?: boolean;
    syncReservationsOutbound?: boolean;
    syncAvailability?: boolean;
    syncRates?: boolean;
  }): Promise<QloAppsConfigRecord> {
    const encryptedApiKey = encrypt(data.apiKey);
    const now = new Date();
    const existing = await this.getConfig();

    const dbPayload = {
      base_url: data.baseUrl,
      api_key_encrypted: encryptedApiKey,
      qloapps_hotel_id: data.qloAppsHotelId,
      sync_interval_minutes: data.syncIntervalMinutes ?? 5,
      sync_enabled: data.syncEnabled ?? true,
      sync_reservations_inbound: data.syncReservationsInbound ?? true,
      sync_reservations_outbound: data.syncReservationsOutbound ?? true,
      sync_availability: data.syncAvailability ?? true,
      sync_rates: data.syncRates ?? true,
    };

    if (existing) {
      // Update existing config
      await db('qloapps_config')
        .where({ hotel_id: HOTEL_ID })
        .update({
          ...dbPayload,
          last_sync_error: null,
          updated_at: now,
        });
    } else {
      // Insert new config
      await db('qloapps_config').insert({
        hotel_id: HOTEL_ID,
        ...dbPayload,
        created_at: now,
        updated_at: now,
      });
    }

    return (await this.getConfig())!;
  }

  /**
   * Update QloApps configuration (partial update)
   */
  async updateConfig(data: Partial<{
    syncIntervalMinutes: number;
    syncEnabled: boolean;
    syncReservationsInbound: boolean;
    syncReservationsOutbound: boolean;
    syncAvailability: boolean;
    syncRates: boolean;
  }>): Promise<QloAppsConfigRecord | null> {
    const existing = await this.getConfig();
    if (!existing) {
      return null;
    }

    const updateData: Record<string, unknown> = {
      updated_at: new Date(),
    };

    if (data.syncIntervalMinutes !== undefined) {
      updateData.sync_interval_minutes = data.syncIntervalMinutes;
    }
    if (data.syncEnabled !== undefined) {
      updateData.sync_enabled = data.syncEnabled;
    }
    if (data.syncReservationsInbound !== undefined) {
      updateData.sync_reservations_inbound = data.syncReservationsInbound;
    }
    if (data.syncReservationsOutbound !== undefined) {
      updateData.sync_reservations_outbound = data.syncReservationsOutbound;
    }
    if (data.syncAvailability !== undefined) {
      updateData.sync_availability = data.syncAvailability;
    }
    if (data.syncRates !== undefined) {
      updateData.sync_rates = data.syncRates;
    }

    await db('qloapps_config')
      .where({ hotel_id: HOTEL_ID })
      .update(updateData);

    return this.getConfig();
  }

  /**
   * Record a successful sync
   */
  async recordSyncSuccess(): Promise<void> {
    await db('qloapps_config')
      .where({ hotel_id: HOTEL_ID })
      .update({
        last_successful_sync: new Date(),
        last_sync_error: null,
        updated_at: new Date(),
      });
  }

  /**
   * Record a sync failure
   */
  async recordSyncFailure(errorMessage: string): Promise<void> {
    await db('qloapps_config')
      .where({ hotel_id: HOTEL_ID })
      .update({
        last_sync_error: errorMessage,
        updated_at: new Date(),
      });
  }

  /**
   * Delete configuration
   */
  async deleteConfig(): Promise<boolean> {
    const deleted = await db('qloapps_config')
      .where({ hotel_id: HOTEL_ID })
      .del();

    return deleted > 0;
  }
}

// =============================================================================
// Room Type Mapping Repository
// =============================================================================

export class RoomTypeMappingRepository {
  /**
   * Get all room type mappings
   */
  async getAllMappings(): Promise<RoomTypeMappingRecord[]> {
    return db('qloapps_room_type_mappings')
      .select('*')
      .where({ is_active: true })
      .orderBy('created_at', 'desc');
  }

  /**
   * Get all mappings with room type details
   */
  async getMappingsWithDetails(): Promise<Array<RoomTypeMappingRecord & { room_type_name: string }>> {
    return db('qloapps_room_type_mappings as m')
      .select(
        'm.*',
        'rt.name as room_type_name'
      )
      .leftJoin('room_types as rt', 'm.local_room_type_id', 'rt.id')
      .where('m.is_active', true)
      .orderBy('m.created_at', 'desc');
  }

  /**
   * Get mapping by local room type ID
   */
  async getByLocalRoomTypeId(localRoomTypeId: string): Promise<RoomTypeMappingRecord | null> {
    const mapping = await db('qloapps_room_type_mappings')
      .where({ local_room_type_id: localRoomTypeId, is_active: true })
      .first();

    return mapping || null;
  }

  /**
   * Get mapping by QloApps product ID
   */
  async getByQloAppsProductId(qloAppsProductId: number, qloAppsHotelId: number): Promise<RoomTypeMappingRecord | null> {
    const mapping = await db('qloapps_room_type_mappings')
      .where({
        qloapps_product_id: qloAppsProductId,
        qloapps_hotel_id: qloAppsHotelId,
        is_active: true,
      })
      .first();

    return mapping || null;
  }

  /**
   * Create a room type mapping
   */
  async createMapping(data: {
    localRoomTypeId: string;
    qloAppsProductId: number;
    qloAppsHotelId: number;
    syncDirection?: 'inbound' | 'outbound' | 'bidirectional';
  }): Promise<RoomTypeMappingRecord> {
    const now = new Date();

    const [result] = await db('qloapps_room_type_mappings')
      .insert({
        hotel_id: HOTEL_ID,
        local_room_type_id: data.localRoomTypeId,
        qloapps_product_id: data.qloAppsProductId,
        qloapps_hotel_id: data.qloAppsHotelId,
        sync_direction: data.syncDirection ?? 'bidirectional',
        is_active: true,
        created_at: now,
        updated_at: now,
      })
      .returning('*');

    return result;
  }

  /**
   * Update mapping sync timestamp
   */
  async updateLastSynced(mappingId: string): Promise<void> {
    await db('qloapps_room_type_mappings')
      .where({ id: mappingId })
      .update({
        last_synced_at: new Date(),
        updated_at: new Date(),
      });
  }

  /**
   * Deactivate a mapping (soft delete)
   */
  async deactivateMapping(mappingId: string): Promise<boolean> {
    const updated = await db('qloapps_room_type_mappings')
      .where({ id: mappingId })
      .update({
        is_active: false,
        updated_at: new Date(),
      });

    return updated > 0;
  }

  /**
   * Delete a mapping (hard delete)
   */
  async deleteMapping(mappingId: string): Promise<boolean> {
    const deleted = await db('qloapps_room_type_mappings')
      .where({ id: mappingId })
      .del();

    return deleted > 0;
  }

  /**
   * Get unmapped PMS room types
   */
  async getUnmappedPmsRoomTypes(): Promise<Array<{ id: string; name: string; room_type: string; price_per_night: number }>> {
    return db('room_types as rt')
      .select('rt.id', 'rt.name', 'rt.room_type', 'rt.price_per_night')
      .leftJoin('qloapps_room_type_mappings as m', function () {
        this.on('rt.id', '=', 'm.local_room_type_id')
          .andOn('m.is_active', '=', db.raw('true'));
      })
      .whereNull('m.id')
      .whereNull('rt.deleted_at')
      .orderBy('rt.name');
  }
}

// =============================================================================
// Reservation Mapping Repository
// =============================================================================

export class ReservationMappingRepository {
  /**
   * Get all reservation mappings with pagination
   */
  async getMappings(options: {
    limit?: number;
    offset?: number;
    source?: string;
    hasConflict?: boolean;
  } = {}): Promise<{ mappings: ReservationMappingRecord[]; total: number }> {
    const { limit = 50, offset = 0, source, hasConflict } = options;

    let query = db('qloapps_reservation_mappings');

    if (source) {
      query = query.where({ source });
    }

    if (hasConflict !== undefined) {
      query = query.where({ has_conflict: hasConflict });
    }

    const total = await query.clone().count('* as count').first();

    const mappings = await query
      .select('*')
      .orderBy('created_at', 'desc')
      .limit(limit)
      .offset(offset);

    return {
      mappings,
      total: parseInt((total as { count: string }).count, 10),
    };
  }

  /**
   * Get mapping by local reservation ID
   */
  async getByLocalReservationId(localReservationId: string): Promise<ReservationMappingRecord | null> {
    const mapping = await db('qloapps_reservation_mappings')
      .where({ local_reservation_id: localReservationId })
      .first();

    return mapping || null;
  }

  /**
   * Get mapping by QloApps order ID
   */
  async getByQloAppsOrderId(qloAppsOrderId: number): Promise<ReservationMappingRecord | null> {
    const mapping = await db('qloapps_reservation_mappings')
      .where({ qloapps_order_id: qloAppsOrderId })
      .first();

    return mapping || null;
  }

  /**
   * Create a reservation mapping
   */
  async createMapping(data: {
    localReservationId: string;
    qloAppsOrderId: number;
    qloAppsBookingId?: number;
    source: 'local' | 'qloapps' | 'ota';
    qloAppsChannel?: string;
  }): Promise<ReservationMappingRecord> {
    const now = new Date();

    const insertData: Record<string, unknown> = {
      hotel_id: HOTEL_ID,
      local_reservation_id: data.localReservationId,
      qloapps_order_id: data.qloAppsOrderId,
      source: data.source,
      has_conflict: false,
      created_at: now,
      updated_at: now,
    };

    if (data.qloAppsBookingId !== undefined) {
      insertData.qloapps_booking_id = data.qloAppsBookingId;
    }

    if (data.qloAppsChannel !== undefined) {
      insertData.qloapps_channel = data.qloAppsChannel;
    }

    const [result] = await db('qloapps_reservation_mappings')
      .insert(insertData)
      .returning('*');

    return result;
  }

  /**
   * Update mapping after sync
   */
  async updateAfterSync(mappingId: string, fromLocal: boolean): Promise<void> {
    const now = new Date();
    const updateData: Record<string, unknown> = {
      last_synced_at: now,
      updated_at: now,
    };

    if (fromLocal) {
      updateData.last_local_update = now;
    } else {
      updateData.last_qloapps_update = now;
    }

    await db('qloapps_reservation_mappings')
      .where({ id: mappingId })
      .update(updateData);
  }

  /**
   * Mark mapping as conflicted
   */
  async markConflict(mappingId: string, conflictData: Record<string, unknown>): Promise<void> {
    await db('qloapps_reservation_mappings')
      .where({ id: mappingId })
      .update({
        has_conflict: true,
        conflict_data: JSON.stringify(conflictData),
        updated_at: new Date(),
      });
  }

  /**
   * Resolve conflict
   */
  async resolveConflict(mappingId: string): Promise<void> {
    await db('qloapps_reservation_mappings')
      .where({ id: mappingId })
      .update({
        has_conflict: false,
        conflict_data: null,
        updated_at: new Date(),
      });
  }

  /**
   * Get mappings with conflicts
   */
  async getConflictedMappings(): Promise<ReservationMappingRecord[]> {
    return db('qloapps_reservation_mappings')
      .where({ has_conflict: true })
      .orderBy('updated_at', 'desc');
  }
}

// =============================================================================
// Customer Mapping Repository
// =============================================================================

export class CustomerMappingRepository {
  /**
   * Get all customer mappings with pagination
   */
  async getMappings(options: {
    limit?: number;
    offset?: number;
    matchMethod?: string;
  } = {}): Promise<{ mappings: Array<CustomerMappingRecord & { guest_name: string; guest_email: string | null }>; total: number }> {
    const { limit = 50, offset = 0, matchMethod } = options;

    let query = db('qloapps_customer_mappings as m')
      .leftJoin('guests as g', 'm.local_guest_id', 'g.id');

    if (matchMethod) {
      query = query.where('m.match_method', matchMethod);
    }

    const total = await query.clone().count('* as count').first();

    const mappings = await query
      .select(
        'm.*',
        'g.name as guest_name',
        'g.email as guest_email'
      )
      .orderBy('m.created_at', 'desc')
      .limit(limit)
      .offset(offset);

    return {
      mappings,
      total: parseInt((total as { count: string }).count, 10),
    };
  }

  /**
   * Get mapping by local guest ID
   */
  async getByLocalGuestId(localGuestId: string): Promise<CustomerMappingRecord | null> {
    const mapping = await db('qloapps_customer_mappings')
      .where({ local_guest_id: localGuestId })
      .first();

    return mapping || null;
  }

  /**
   * Get mapping by QloApps customer ID
   */
  async getByQloAppsCustomerId(qloAppsCustomerId: number): Promise<CustomerMappingRecord | null> {
    const mapping = await db('qloapps_customer_mappings')
      .where({ qloapps_customer_id: qloAppsCustomerId })
      .first();

    return mapping || null;
  }

  /**
   * Create a customer mapping
   */
  async createMapping(data: {
    localGuestId: string;
    qloAppsCustomerId: number;
    matchMethod: 'email' | 'phone' | 'name' | 'manual';
    confidenceScore?: number;
  }): Promise<CustomerMappingRecord> {
    const now = new Date();

    const [result] = await db('qloapps_customer_mappings')
      .insert({
        hotel_id: HOTEL_ID,
        local_guest_id: data.localGuestId,
        qloapps_customer_id: data.qloAppsCustomerId,
        match_type: data.matchMethod,
        sync_direction: 'bidirectional',
        is_active: true,
        is_verified: data.matchMethod === 'manual',
        created_at: now,
        updated_at: now,
      })
      .returning('*');

    return result;
  }

  /**
   * Delete a customer mapping
   */
  async deleteMapping(mappingId: string): Promise<boolean> {
    const deleted = await db('qloapps_customer_mappings')
      .where({ id: mappingId })
      .del();

    return deleted > 0;
  }
}

// =============================================================================
// Sync State Repository
// =============================================================================

export class SyncStateRepository {
  /**
   * Get the latest sync state for a sync type
   */
  async getLatestState(syncType: string): Promise<SyncStateRecord | null> {
    const state = await db('qloapps_sync_state')
      .where({ sync_type: syncType })
      .orderBy('started_at', 'desc')
      .first();

    return state || null;
  }

  /**
   * Get the last successful sync for a sync type
   */
  async getLastSuccessfulSync(syncType: string): Promise<SyncStateRecord | null> {
    const state = await db('qloapps_sync_state')
      .where({ sync_type: syncType, status: 'completed' })
      .orderBy('completed_at', 'desc')
      .first();

    return state || null;
  }

  /**
   * Check if a sync is currently running
   */
  async isRunning(syncType: string): Promise<boolean> {
    const running = await db('qloapps_sync_state')
      .where({ sync_type: syncType, status: 'running' })
      .first();

    return !!running;
  }

  /**
   * Start a new sync operation
   */
  async startSync(syncType: string, metadata?: Record<string, unknown>): Promise<SyncStateRecord> {
    const now = new Date();

    const insertData: Record<string, unknown> = {
      hotel_id: HOTEL_ID,
      sync_type: syncType,
      status: 'running',
      started_at: now,
      reservations_processed: 0,
      reservations_created: 0,
      reservations_updated: 0,
      reservations_failed: 0,
      room_types_processed: 0,
      room_types_synced: 0,
      customers_processed: 0,
      customers_synced: 0,
      availability_updates: 0,
      rate_updates: 0,
      api_calls_made: 0,
      retry_count: 0,
      trigger_source: 'manual',
      created_at: now,
    };

    if (metadata !== undefined) {
      insertData.metadata = JSON.stringify(metadata);
      // Set trigger source from metadata if provided
      if ((metadata as any).triggeredBy) {
        insertData.trigger_source = (metadata as any).triggeredBy;
      }
    }

    const [result] = await db('qloapps_sync_state')
      .insert(insertData)
      .returning('*');

    return result;
  }

  /**
   * Complete a sync operation
   */
  async completeSync(
    syncStateId: string,
    result: {
      itemsProcessed: number;
      itemsCreated: number;
      itemsUpdated: number;
      itemsFailed: number;
      syncCursor?: Record<string, unknown>;
    }
  ): Promise<void> {
    const now = new Date();
    const record = await db('qloapps_sync_state')
      .where({ id: syncStateId })
      .select('started_at', 'sync_type')
      .first();

    if (!record) {
      throw new Error(`Sync state not found: ${syncStateId}`);
    }

    const durationMs = now.getTime() - new Date(record.started_at).getTime();

    const updateData: Record<string, unknown> = {
      status: 'completed',
      completed_at: now,
      last_successful_sync: now,
      duration_ms: durationMs,
    };

    // Map generic result fields to appropriate entity-specific columns based on sync type
    if (record.sync_type.includes('reservation')) {
      updateData.reservations_processed = result.itemsProcessed;
      updateData.reservations_created = result.itemsCreated;
      updateData.reservations_updated = result.itemsUpdated;
      updateData.reservations_failed = result.itemsFailed;
    } else if (record.sync_type.includes('room_type')) {
      updateData.room_types_processed = result.itemsProcessed;
      updateData.room_types_synced = result.itemsCreated + result.itemsUpdated;
    } else if (record.sync_type.includes('customer')) {
      updateData.customers_processed = result.itemsProcessed;
      updateData.customers_synced = result.itemsCreated + result.itemsUpdated;
    }

    if (result.syncCursor !== undefined) {
      updateData.cursor = result.syncCursor ? JSON.stringify(result.syncCursor) : null;
    }

    await db('qloapps_sync_state')
      .where({ id: syncStateId })
      .update(updateData);
  }

  /**
   * Complete a full 3-phase sync operation with all statistics
   */
  async completeFullSync(
    syncStateId: string,
    result: {
      roomTypes: {
        processed: number;
        synced: number;
        failed: number;
      };
      customers: {
        processed: number;
        synced: number;
        failed: number;
      };
      reservations: {
        processed: number;
        created: number;
        updated: number;
        failed: number;
      };
      syncCursor?: Record<string, unknown>;
    }
  ): Promise<void> {
    const now = new Date();
    const record = await db('qloapps_sync_state')
      .where({ id: syncStateId })
      .select('started_at')
      .first();

    if (!record) {
      throw new Error(`Sync state not found: ${syncStateId}`);
    }

    const durationMs = now.getTime() - new Date(record.started_at).getTime();
    const totalFailed = result.roomTypes.failed + result.customers.failed + result.reservations.failed;

    const updateData: Record<string, unknown> = {
      status: totalFailed === 0 ? 'completed' : 'failed',
      completed_at: now,
      last_successful_sync: totalFailed === 0 ? now : null,
      duration_ms: durationMs,
      // Room types
      room_types_processed: result.roomTypes.processed,
      room_types_synced: result.roomTypes.synced,
      // Customers
      customers_processed: result.customers.processed,
      customers_synced: result.customers.synced,
      // Reservations
      reservations_processed: result.reservations.processed,
      reservations_created: result.reservations.created,
      reservations_updated: result.reservations.updated,
      reservations_failed: result.reservations.failed,
    };

    if (result.syncCursor !== undefined) {
      updateData.cursor = result.syncCursor ? JSON.stringify(result.syncCursor) : null;
    }

    await db('qloapps_sync_state')
      .where({ id: syncStateId })
      .update(updateData);
  }

  /**
   * Fail a sync operation
   */
  async failSync(syncStateId: string, errorMessage: string): Promise<void> {
    const now = new Date();
    const startedAt = await db('qloapps_sync_state')
      .where({ id: syncStateId })
      .select('started_at')
      .first();

    const durationMs = startedAt
      ? now.getTime() - new Date(startedAt.started_at).getTime()
      : null;

    await db('qloapps_sync_state')
      .where({ id: syncStateId })
      .update({
        status: 'failed',
        completed_at: now,
        error_message: errorMessage,
        duration_ms: durationMs,
      });
  }

  /**
   * Get running syncs count
   */
  async getRunningCount(): Promise<number> {
    const result = await db('qloapps_sync_state')
      .where({ status: 'running' })
      .count('* as count')
      .first();

    return parseInt((result as { count: string }).count, 10);
  }
}

// =============================================================================
// Sync Log Repository
// =============================================================================

export class SyncLogRepository {
  /**
   * Get sync logs with pagination and filters
   */
  async getLogs(options: {
    syncType?: string;
    direction?: 'inbound' | 'outbound';
    entityType?: string;
    success?: boolean;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
  } = {}): Promise<{ logs: SyncLogRecord[]; total: number }> {
    const {
      syncType,
      direction,
      entityType,
      success,
      startDate,
      endDate,
      limit = 50,
      offset = 0,
    } = options;

    let query = db('qloapps_sync_logs');

    // NOTE: qloapps_sync_logs does not have a sync_type or boolean success column.
    // We store syncType in metadata (when available) and use the status column
    // ('success' / 'failed' / 'skipped' / 'conflict') for success filtering.
    if (direction) {
      query = query.where({ direction });
    }
    if (entityType) {
      query = query.where({ entity_type: entityType });
    }
    if (success !== undefined) {
      query = query.where('status', success ? 'success' : 'failed');
    }
    if (startDate) {
      query = query.where('created_at', '>=', startDate);
    }
    if (endDate) {
      query = query.where('created_at', '<=', endDate);
    }

    const total = await query.clone().count('* as count').first();

    const logs = await query
      .select('*')
      .orderBy('created_at', 'desc')
      .limit(limit)
      .offset(offset);

    return {
      logs,
      total: parseInt((total as { count: string }).count, 10),
    };
  }

  /**
   * Create a sync log entry
   */
  async createLog(data: {
    syncStateId?: string;
    syncType: string;
    direction: 'inbound' | 'outbound';
    entityType: string;
    localEntityId?: string;
    qloAppsEntityId?: number;
    operation: 'create' | 'update' | 'delete' | 'skip' | 'conflict';
    success: boolean;
    requestData?: Record<string, unknown>;
    responseData?: Record<string, unknown>;
    errorMessage?: string;
    durationMs?: number;
  }): Promise<SyncLogRecord> {
    const now = new Date();

    const insertData: Record<string, unknown> = {
      hotel_id: HOTEL_ID,
      direction: data.direction,
      entity_type: data.entityType,
      operation: data.operation,
      status: data.success ? 'success' : 'failed',
      created_at: now,
    };

    if (data.syncStateId !== undefined) {
      insertData.sync_state_id = data.syncStateId;
    }
    if (data.localEntityId !== undefined) {
      insertData.local_entity_id = data.localEntityId;
    }
    if (data.qloAppsEntityId !== undefined) {
      insertData.qloapps_entity_id = data.qloAppsEntityId.toString();
    }
    if (data.requestData !== undefined) {
      insertData.request_payload = JSON.stringify(data.requestData);
    }
    if (data.responseData !== undefined) {
      insertData.response_data = JSON.stringify(data.responseData);
    }
    if (data.errorMessage !== undefined) {
      insertData.error_message = data.errorMessage;
    }
    if (data.durationMs !== undefined) {
      insertData.duration_ms = data.durationMs;
    }
    if (data.syncType !== undefined) {
      insertData.metadata = JSON.stringify({ sync_type: data.syncType });
    }

    const [result] = await db('qloapps_sync_logs')
      .insert(insertData)
      .returning('*');

    return result;
  }

  /**
   * Get recent errors
   */
  async getRecentErrors(limit: number = 10): Promise<SyncLogRecord[]> {
    return db('qloapps_sync_logs')
      .where({ status: 'failed' })
      .orderBy('created_at', 'desc')
      .limit(limit);
  }

  /**
   * Clean up old logs
   */
  async cleanupOldLogs(daysToKeep: number = 30): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    const deleted = await db('qloapps_sync_logs')
      .where('created_at', '<', cutoffDate)
      .del();

    return deleted;
  }
}

// =============================================================================
// Export Singleton Instances
// =============================================================================

export const qloAppsConfigRepository = new QloAppsConfigRepository();
export const roomTypeMappingRepository = new RoomTypeMappingRepository();
export const reservationMappingRepository = new ReservationMappingRepository();
export const customerMappingRepository = new CustomerMappingRepository();
export const syncStateRepository = new SyncStateRepository();
export const syncLogRepository = new SyncLogRepository();
