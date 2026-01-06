/**
 * QloApps Conflict Resolution Service
 *
 * Handles conflicts that arise during synchronization between PMS and QloApps.
 * Provides configurable resolution strategies and detailed conflict logging.
 */

import db from '../../../config/database.js';
import { QloAppsBooking, QloAppsCustomer, QloAppsRoomType } from '../qloapps_types.js';

// =============================================================================
// Types & Interfaces
// =============================================================================

/**
 * Available conflict resolution strategies
 */
export type ConflictResolutionStrategy =
  | 'pms_wins' // PMS data always takes precedence
  | 'qloapps_wins' // QloApps data always takes precedence
  | 'newest_wins' // Most recently modified data wins
  | 'manual' // Flag for manual review, don't auto-resolve
  | 'merge'; // Attempt to merge non-conflicting fields

/**
 * Types of entities that can have conflicts
 */
export type ConflictEntityType = 'reservation' | 'guest' | 'room_type' | 'availability' | 'rate';

/**
 * Conflict status
 */
export type ConflictStatus = 'detected' | 'resolved' | 'pending_review' | 'ignored';

/**
 * Represents a detected conflict between PMS and QloApps
 */
export interface SyncConflict {
  id?: number;
  entityType: ConflictEntityType;
  pmsId: number;
  qloAppsId: string | number;
  pmsData: Record<string, unknown>;
  qloAppsData: Record<string, unknown>;
  conflictingFields: string[];
  pmsModifiedAt?: Date;
  qloAppsModifiedAt?: Date;
  status: ConflictStatus;
  resolution?: ConflictResolution;
  detectedAt: Date;
  resolvedAt?: Date;
}

/**
 * Resolution applied to a conflict
 */
export interface ConflictResolution {
  strategy: ConflictResolutionStrategy;
  winningSource: 'pms' | 'qloapps' | 'merged';
  resolvedData: Record<string, unknown>;
  resolvedBy?: string; // User ID for manual resolutions
  notes?: string;
}

/**
 * Options for conflict detection
 */
export interface ConflictDetectionOptions {
  entityType: ConflictEntityType;
  pmsId: number;
  qloAppsId: string | number;
  pmsData: Record<string, unknown>;
  qloAppsData: Record<string, unknown>;
  pmsModifiedAt?: Date;
  qloAppsModifiedAt?: Date;
  fieldsToCompare?: string[];
}

/**
 * Configuration for conflict resolution
 */
export interface ConflictResolutionConfig {
  defaultStrategy: ConflictResolutionStrategy;
  strategyByEntityType?: Partial<Record<ConflictEntityType, ConflictResolutionStrategy>>;
  strategyByField?: Record<string, ConflictResolutionStrategy>;
  ignoredFields?: string[];
  mergeableFields?: string[];
}

/**
 * Result of conflict resolution
 */
export interface ConflictResolutionResult {
  conflict: SyncConflict;
  resolved: boolean;
  resolution?: ConflictResolution;
  requiresManualReview: boolean;
}

// =============================================================================
// Default Configuration
// =============================================================================

const DEFAULT_CONFIG: ConflictResolutionConfig = {
  defaultStrategy: 'pms_wins',
  strategyByEntityType: {
    reservation: 'newest_wins',
    guest: 'merge',
    room_type: 'pms_wins',
    availability: 'pms_wins',
    rate: 'pms_wins',
  },
  ignoredFields: [
    'id',
    'created_at',
    'updated_at',
    'pms_id',
    'qloapps_id',
    'sync_status',
    'last_synced_at',
  ],
  mergeableFields: [
    'notes',
    'special_requests',
    'preferences',
    'tags',
  ],
};

// =============================================================================
// Conflict Resolution Service Class
// =============================================================================

export class ConflictResolutionService {
  private config: ConflictResolutionConfig;

  constructor(config?: Partial<ConflictResolutionConfig>) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      strategyByEntityType: {
        ...DEFAULT_CONFIG.strategyByEntityType,
        ...config?.strategyByEntityType,
      },
    };
  }

  // ===========================================================================
  // Conflict Detection
  // ===========================================================================

  /**
   * Detect conflicts between PMS and QloApps data
   */
  detectConflicts(options: ConflictDetectionOptions): SyncConflict | null {
    const {
      entityType,
      pmsId,
      qloAppsId,
      pmsData,
      qloAppsData,
      pmsModifiedAt,
      qloAppsModifiedAt,
      fieldsToCompare,
    } = options;

    // Get fields to compare
    const fields = fieldsToCompare || this.getComparableFields(pmsData, qloAppsData);

    // Find conflicting fields
    const conflictingFields = this.findConflictingFields(pmsData, qloAppsData, fields);

    // No conflicts detected
    if (conflictingFields.length === 0) {
      return null;
    }

    // Create conflict record - handle exactOptionalPropertyTypes
    const conflict: SyncConflict = {
      entityType,
      pmsId,
      qloAppsId,
      pmsData,
      qloAppsData,
      conflictingFields,
      status: 'detected',
      detectedAt: new Date(),
    };

    // Only add optional properties if defined
    if (pmsModifiedAt !== undefined) {
      conflict.pmsModifiedAt = pmsModifiedAt;
    }
    if (qloAppsModifiedAt !== undefined) {
      conflict.qloAppsModifiedAt = qloAppsModifiedAt;
    }

    return conflict;
  }

  /**
   * Get comparable fields from both data objects, excluding ignored fields
   */
  private getComparableFields(
    pmsData: Record<string, unknown>,
    qloAppsData: Record<string, unknown>
  ): string[] {
    const allFields = new Set([...Object.keys(pmsData), ...Object.keys(qloAppsData)]);
    const ignoredFields = new Set(this.config.ignoredFields || []);

    return Array.from(allFields).filter((field) => !ignoredFields.has(field));
  }

  /**
   * Find fields that have different values between PMS and QloApps
   */
  private findConflictingFields(
    pmsData: Record<string, unknown>,
    qloAppsData: Record<string, unknown>,
    fieldsToCompare: string[]
  ): string[] {
    const conflicting: string[] = [];

    for (const field of fieldsToCompare) {
      const pmsValue = pmsData[field];
      const qloAppsValue = qloAppsData[field];

      if (!this.valuesAreEqual(pmsValue, qloAppsValue)) {
        conflicting.push(field);
      }
    }

    return conflicting;
  }

  /**
   * Check if two values are equal (deep comparison for objects/arrays)
   */
  private valuesAreEqual(value1: unknown, value2: unknown): boolean {
    // Handle null/undefined
    if (value1 == null && value2 == null) return true;
    if (value1 == null || value2 == null) return false;

    // Handle dates
    if (value1 instanceof Date && value2 instanceof Date) {
      return value1.getTime() === value2.getTime();
    }
    if (value1 instanceof Date || value2 instanceof Date) {
      const date1 = value1 instanceof Date ? value1 : new Date(value1 as string);
      const date2 = value2 instanceof Date ? value2 : new Date(value2 as string);
      if (!isNaN(date1.getTime()) && !isNaN(date2.getTime())) {
        return date1.getTime() === date2.getTime();
      }
    }

    // Handle arrays
    if (Array.isArray(value1) && Array.isArray(value2)) {
      if (value1.length !== value2.length) return false;
      return value1.every((v, i) => this.valuesAreEqual(v, value2[i]));
    }

    // Handle objects
    if (typeof value1 === 'object' && typeof value2 === 'object') {
      const keys1 = Object.keys(value1 as object);
      const keys2 = Object.keys(value2 as object);
      if (keys1.length !== keys2.length) return false;
      return keys1.every((key) =>
        this.valuesAreEqual(
          (value1 as Record<string, unknown>)[key],
          (value2 as Record<string, unknown>)[key]
        )
      );
    }

    // Handle primitives (with string normalization)
    if (typeof value1 === 'string' && typeof value2 === 'string') {
      return value1.trim().toLowerCase() === value2.trim().toLowerCase();
    }

    return value1 === value2;
  }

  // ===========================================================================
  // Conflict Resolution
  // ===========================================================================

  /**
   * Resolve a conflict using the configured strategy
   */
  resolveConflict(conflict: SyncConflict): ConflictResolutionResult {
    // Get strategy for this entity type
    const strategy = this.getStrategyForConflict(conflict);

    // If manual strategy, mark for review
    if (strategy === 'manual') {
      return {
        conflict: {
          ...conflict,
          status: 'pending_review',
        },
        resolved: false,
        requiresManualReview: true,
      };
    }

    // Apply resolution strategy
    const resolution = this.applyStrategy(conflict, strategy);

    return {
      conflict: {
        ...conflict,
        status: 'resolved',
        resolution,
        resolvedAt: new Date(),
      },
      resolved: true,
      resolution,
      requiresManualReview: false,
    };
  }

  /**
   * Get the resolution strategy for a specific conflict
   */
  private getStrategyForConflict(conflict: SyncConflict): ConflictResolutionStrategy {
    // Check for entity-type-specific strategy
    const entityStrategy = this.config.strategyByEntityType?.[conflict.entityType];
    if (entityStrategy) {
      return entityStrategy;
    }

    return this.config.defaultStrategy;
  }

  /**
   * Apply a resolution strategy to resolve the conflict
   */
  private applyStrategy(
    conflict: SyncConflict,
    strategy: ConflictResolutionStrategy
  ): ConflictResolution {
    switch (strategy) {
      case 'pms_wins':
        return this.resolvePmsWins(conflict);

      case 'qloapps_wins':
        return this.resolveQloAppsWins(conflict);

      case 'newest_wins':
        return this.resolveNewestWins(conflict);

      case 'merge':
        return this.resolveMerge(conflict);

      default:
        // Fall back to PMS wins
        return this.resolvePmsWins(conflict);
    }
  }

  /**
   * Resolve by taking PMS data
   */
  private resolvePmsWins(conflict: SyncConflict): ConflictResolution {
    return {
      strategy: 'pms_wins',
      winningSource: 'pms',
      resolvedData: { ...conflict.pmsData },
    };
  }

  /**
   * Resolve by taking QloApps data
   */
  private resolveQloAppsWins(conflict: SyncConflict): ConflictResolution {
    return {
      strategy: 'qloapps_wins',
      winningSource: 'qloapps',
      resolvedData: { ...conflict.qloAppsData },
    };
  }

  /**
   * Resolve by taking the most recently modified data
   */
  private resolveNewestWins(conflict: SyncConflict): ConflictResolution {
    const pmsTime = conflict.pmsModifiedAt?.getTime() || 0;
    const qloAppsTime = conflict.qloAppsModifiedAt?.getTime() || 0;

    if (pmsTime >= qloAppsTime) {
      return {
        strategy: 'newest_wins',
        winningSource: 'pms',
        resolvedData: { ...conflict.pmsData },
        notes: `PMS data is newer (${conflict.pmsModifiedAt?.toISOString() || 'unknown'} vs ${conflict.qloAppsModifiedAt?.toISOString() || 'unknown'})`,
      };
    }

    return {
      strategy: 'newest_wins',
      winningSource: 'qloapps',
      resolvedData: { ...conflict.qloAppsData },
      notes: `QloApps data is newer (${conflict.qloAppsModifiedAt?.toISOString() || 'unknown'} vs ${conflict.pmsModifiedAt?.toISOString() || 'unknown'})`,
    };
  }

  /**
   * Resolve by merging non-conflicting fields and using PMS for conflicts
   */
  private resolveMerge(conflict: SyncConflict): ConflictResolution {
    const mergedData: Record<string, unknown> = {};
    const allFields = new Set([
      ...Object.keys(conflict.pmsData),
      ...Object.keys(conflict.qloAppsData),
    ]);

    for (const field of allFields) {
      const pmsValue = conflict.pmsData[field];
      const qloAppsValue = conflict.qloAppsData[field];

      // If field is not conflicting, take whichever has a value
      if (!conflict.conflictingFields.includes(field)) {
        mergedData[field] = pmsValue ?? qloAppsValue;
        continue;
      }

      // For conflicting mergeable fields (like arrays), try to merge
      if (this.config.mergeableFields?.includes(field)) {
        mergedData[field] = this.mergeFieldValues(pmsValue, qloAppsValue);
        continue;
      }

      // For non-mergeable conflicts, PMS wins
      mergedData[field] = pmsValue;
    }

    return {
      strategy: 'merge',
      winningSource: 'merged',
      resolvedData: mergedData,
      notes: `Merged fields: ${Array.from(allFields).join(', ')}. Conflicts resolved in favor of PMS: ${conflict.conflictingFields.join(', ')}`,
    };
  }

  /**
   * Merge two field values (for mergeable fields)
   */
  private mergeFieldValues(pmsValue: unknown, qloAppsValue: unknown): unknown {
    // Merge arrays by combining unique values
    if (Array.isArray(pmsValue) && Array.isArray(qloAppsValue)) {
      const combined = [...pmsValue, ...qloAppsValue];
      return Array.from(new Set(combined.map((v) => JSON.stringify(v)))).map((v) =>
        JSON.parse(v)
      );
    }

    // Merge strings by concatenating with separator
    if (typeof pmsValue === 'string' && typeof qloAppsValue === 'string') {
      if (pmsValue === qloAppsValue) return pmsValue;
      return `${pmsValue}\n---\n${qloAppsValue}`;
    }

    // Merge objects by combining keys
    if (
      typeof pmsValue === 'object' &&
      pmsValue !== null &&
      typeof qloAppsValue === 'object' &&
      qloAppsValue !== null
    ) {
      return { ...qloAppsValue, ...pmsValue }; // PMS takes precedence
    }

    // Default: PMS wins
    return pmsValue ?? qloAppsValue;
  }

  // ===========================================================================
  // Manual Resolution
  // ===========================================================================

  /**
   * Manually resolve a conflict
   */
  manuallyResolve(
    conflict: SyncConflict,
    resolvedData: Record<string, unknown>,
    resolvedBy: string,
    notes?: string
  ): ConflictResolutionResult {
    const resolution: ConflictResolution = {
      strategy: 'manual',
      winningSource: 'merged',
      resolvedData,
      resolvedBy,
    };

    // Only add notes if defined
    if (notes !== undefined) {
      resolution.notes = notes;
    }

    return {
      conflict: {
        ...conflict,
        status: 'resolved',
        resolution,
        resolvedAt: new Date(),
      },
      resolved: true,
      resolution,
      requiresManualReview: false,
    };
  }

  // ===========================================================================
  // Conflict Persistence
  // ===========================================================================

  /**
   * Save a conflict to the database for tracking/review
   */
  async saveConflict(conflict: SyncConflict): Promise<number> {
    const [id] = await db('qloapps_sync_logs').insert({
      entity_type: conflict.entityType,
      entity_id: conflict.pmsId,
      external_id: String(conflict.qloAppsId),
      operation: 'conflict',
      status: conflict.status === 'resolved' ? 'success' : 'error',
      request_data: JSON.stringify({
        pmsData: conflict.pmsData,
        qloAppsData: conflict.qloAppsData,
        conflictingFields: conflict.conflictingFields,
        pmsModifiedAt: conflict.pmsModifiedAt,
        qloAppsModifiedAt: conflict.qloAppsModifiedAt,
      }),
      response_data: conflict.resolution ? JSON.stringify(conflict.resolution) : null,
      error_message: conflict.status === 'pending_review' ? 'Requires manual review' : null,
      created_at: conflict.detectedAt,
    }).returning('id');

    return typeof id === 'object' ? id.id : id;
  }

  /**
   * Get pending conflicts that need manual review
   */
  async getPendingConflicts(entityType?: ConflictEntityType): Promise<SyncConflict[]> {
    let query = db('qloapps_sync_logs')
      .where('operation', 'conflict')
      .where('status', 'error')
      .whereNotNull('error_message')
      .where('error_message', 'like', '%manual%');

    if (entityType) {
      query = query.where('entity_type', entityType);
    }

    const rows = await query.orderBy('created_at', 'desc');

    return rows.map((row) => this.rowToConflict(row));
  }

  /**
   * Convert database row to SyncConflict
   */
  private rowToConflict(row: Record<string, unknown>): SyncConflict {
    const requestData = typeof row.request_data === 'string'
      ? JSON.parse(row.request_data)
      : row.request_data;

    const responseData = row.response_data
      ? (typeof row.response_data === 'string' ? JSON.parse(row.response_data) : row.response_data)
      : undefined;

    // Build result with required fields first
    const result: SyncConflict = {
      id: row.id as number,
      entityType: row.entity_type as ConflictEntityType,
      pmsId: row.entity_id as number,
      qloAppsId: row.external_id as string,
      pmsData: requestData.pmsData || {},
      qloAppsData: requestData.qloAppsData || {},
      conflictingFields: requestData.conflictingFields || [],
      status: row.status === 'success' ? 'resolved' : 'pending_review',
      detectedAt: new Date(row.created_at as string),
    };

    // Add optional fields only if defined
    if (requestData.pmsModifiedAt) {
      result.pmsModifiedAt = new Date(requestData.pmsModifiedAt);
    }
    if (requestData.qloAppsModifiedAt) {
      result.qloAppsModifiedAt = new Date(requestData.qloAppsModifiedAt);
    }
    if (responseData !== undefined) {
      result.resolution = responseData;
    }
    if (row.status === 'success') {
      result.resolvedAt = new Date(row.created_at as string);
    }

    return result;
  }

  // ===========================================================================
  // Reservation-Specific Conflict Handling
  // ===========================================================================

  /**
   * Detect conflicts for a reservation sync
   */
  detectReservationConflict(
    pmsReservation: Record<string, unknown>,
    qloAppsBooking: QloAppsBooking,
    pmsModifiedAt?: Date
  ): SyncConflict | null {
    // Get dates from the first room type in the booking
    const firstRoomType = qloAppsBooking.room_types?.[0];

    // Convert QloApps booking to comparable format
    const qloAppsData: Record<string, unknown> = {
      check_in_date: firstRoomType?.date_from,
      check_out_date: firstRoomType?.date_to,
      status: this.mapQloAppsBookingStatus(qloAppsBooking.booking_status),
      total_amount: qloAppsBooking.total_price,
      guest_count: qloAppsBooking.id_customer,
      notes: qloAppsBooking.remarks,
    };

    const pmsData: Record<string, unknown> = {
      check_in_date: pmsReservation.check_in_date,
      check_out_date: pmsReservation.check_out_date,
      status: pmsReservation.status,
      total_amount: pmsReservation.total_amount,
      guest_count: pmsReservation.guest_count,
      notes: pmsReservation.notes,
    };

    // Build options object with required fields
    const options: ConflictDetectionOptions = {
      entityType: 'reservation',
      pmsId: pmsReservation.id as number,
      qloAppsId: qloAppsBooking.id,
      pmsData,
      qloAppsData,
      fieldsToCompare: ['check_in_date', 'check_out_date', 'status', 'total_amount', 'notes'],
    };

    // Add optional fields only if defined
    if (pmsModifiedAt !== undefined) {
      options.pmsModifiedAt = pmsModifiedAt;
    }
    if (qloAppsBooking.date_upd) {
      options.qloAppsModifiedAt = new Date(qloAppsBooking.date_upd);
    }

    return this.detectConflicts(options);
  }

  /**
   * Map QloApps booking status to PMS status
   */
  private mapQloAppsBookingStatus(statusCode: number): string {
    switch (statusCode) {
      case 1:
        return 'pending';
      case 2:
        return 'confirmed';
      case 3:
        return 'cancelled';
      case 4:
        return 'refunded';
      default:
        return 'pending';
    }
  }

  /**
   * Map QloApps order state to PMS status
   */
  private mapQloAppsStatus(stateId: number | string): string {
    const state = typeof stateId === 'string' ? parseInt(stateId, 10) : stateId;
    switch (state) {
      case 1:
        return 'pending';
      case 2:
        return 'confirmed';
      case 3:
        return 'processing';
      case 4:
        return 'checked_in';
      case 5:
        return 'checked_out';
      case 6:
        return 'cancelled';
      case 7:
        return 'refunded';
      default:
        return 'pending';
    }
  }

  // ===========================================================================
  // Guest-Specific Conflict Handling
  // ===========================================================================

  /**
   * Detect conflicts for a guest sync
   */
  detectGuestConflict(
    pmsGuest: Record<string, unknown>,
    qloAppsCustomer: QloAppsCustomer,
    pmsModifiedAt?: Date
  ): SyncConflict | null {
    const qloAppsData: Record<string, unknown> = {
      first_name: qloAppsCustomer.firstname,
      last_name: qloAppsCustomer.lastname,
      email: qloAppsCustomer.email,
      phone: qloAppsCustomer.phone,
    };

    const pmsData: Record<string, unknown> = {
      first_name: pmsGuest.first_name,
      last_name: pmsGuest.last_name,
      email: pmsGuest.email,
      phone: pmsGuest.phone,
    };

    // Build options object with required fields
    const options: ConflictDetectionOptions = {
      entityType: 'guest',
      pmsId: pmsGuest.id as number,
      qloAppsId: qloAppsCustomer.id,
      pmsData,
      qloAppsData,
      fieldsToCompare: ['first_name', 'last_name', 'email', 'phone'],
    };

    // Add optional fields only if defined
    if (pmsModifiedAt !== undefined) {
      options.pmsModifiedAt = pmsModifiedAt;
    }
    if (qloAppsCustomer.date_upd) {
      options.qloAppsModifiedAt = new Date(qloAppsCustomer.date_upd);
    }

    return this.detectConflicts(options);
  }

  // ===========================================================================
  // Room Type-Specific Conflict Handling
  // ===========================================================================

  /**
   * Detect conflicts for a room type sync
   */
  detectRoomTypeConflict(
    pmsRoomType: Record<string, unknown>,
    qloAppsRoomType: QloAppsRoomType,
    pmsModifiedAt?: Date
  ): SyncConflict | null {
    const qloAppsData: Record<string, unknown> = {
      name: qloAppsRoomType.name,
      base_price: qloAppsRoomType.price,
      max_adults: qloAppsRoomType.max_adults,
      max_children: qloAppsRoomType.max_children,
      active: qloAppsRoomType.active,
    };

    const pmsData: Record<string, unknown> = {
      name: pmsRoomType.name,
      base_price: pmsRoomType.base_price,
      max_adults: pmsRoomType.max_adults,
      max_children: pmsRoomType.max_children,
      active: pmsRoomType.is_active,
    };

    // Build options object with required fields
    const options: ConflictDetectionOptions = {
      entityType: 'room_type',
      pmsId: pmsRoomType.id as number,
      qloAppsId: qloAppsRoomType.id,
      pmsData,
      qloAppsData,
      fieldsToCompare: ['name', 'base_price', 'max_adults', 'max_children', 'active'],
    };

    // Add optional fields only if defined
    if (pmsModifiedAt !== undefined) {
      options.pmsModifiedAt = pmsModifiedAt;
    }
    if (qloAppsRoomType.date_upd) {
      options.qloAppsModifiedAt = new Date(qloAppsRoomType.date_upd);
    }

    return this.detectConflicts(options);
  }
}

// =============================================================================
// Factory & Exports
// =============================================================================

/**
 * Create a new ConflictResolutionService instance
 */
export function createConflictResolutionService(
  config?: Partial<ConflictResolutionConfig>
): ConflictResolutionService {
  return new ConflictResolutionService(config);
}

/**
 * Default singleton instance
 */
let defaultInstance: ConflictResolutionService | null = null;

/**
 * Get the default ConflictResolutionService instance
 */
export function getConflictResolutionService(): ConflictResolutionService {
  if (!defaultInstance) {
    defaultInstance = createConflictResolutionService();
  }
  return defaultInstance;
}

export default ConflictResolutionService;
