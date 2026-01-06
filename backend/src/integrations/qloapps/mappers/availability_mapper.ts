/**
 * QloApps Availability Mapper
 *
 * Maps availability data between PMS and QloApps.
 * Handles date ranges, room quantities, and availability calculations.
 */

import type { QloAppsAvailabilityUpdate, QloAppsRateUpdate } from '../qloapps_types.js';
import db from '../../../config/database.js';

// ============================================================================
// Date Range Types
// ============================================================================

/**
 * Date range for availability queries
 */
export interface DateRange {
  startDate: Date;
  endDate: Date;
}

/**
 * Daily availability for a room type
 */
export interface DailyAvailability {
  date: string; // YYYY-MM-DD
  totalUnits: number;
  reservedUnits: number;
  availableUnits: number;
  blockedUnits: number;
}

/**
 * Availability update batch for a room type
 */
export interface AvailabilityBatch {
  roomTypeId: string;
  qloAppsRoomTypeId: number;
  updates: QloAppsAvailabilityUpdate[];
}

/**
 * Rate update batch for a room type
 */
export interface RateBatch {
  roomTypeId: string;
  qloAppsRoomTypeId: number;
  updates: QloAppsRateUpdate[];
}

// ============================================================================
// Availability Calculation
// ============================================================================

/**
 * Calculate room availability for a date range
 * Returns number of available units per day
 */
export async function calculateRoomTypeAvailability(
  roomTypeId: string,
  dateRange: DateRange
): Promise<Map<string, DailyAvailability>> {
  const availability = new Map<string, DailyAvailability>();

  // Get room type details
  const roomType = await db('room_types')
    .where({ id: roomTypeId })
    .whereNull('deleted_at')
    .first();

  if (!roomType) {
    throw new Error(`Room type ${roomTypeId} not found`);
  }

  const totalUnits = roomType.qty || 1;

  // Format dates for query
  const startDateStr = formatDateString(dateRange.startDate);
  const endDateStr = formatDateString(dateRange.endDate);

  // Get all reservations for this room type in the date range
  const reservations = await db('reservations')
    .where({ room_type_id: roomTypeId })
    .whereNotIn('status', ['Cancelled'])
    .whereNull('deleted_at')
    .whereRaw('check_in <= ?', [endDateStr])
    .whereRaw('check_out > ?', [startDateStr])
    .select('check_in', 'check_out', 'status', 'units_requested');

  // Initialize availability for each day in range
  const currentDate = new Date(dateRange.startDate);
  while (currentDate <= dateRange.endDate) {
    const dateStr = formatDateString(currentDate);
    availability.set(dateStr, {
      date: dateStr,
      totalUnits,
      reservedUnits: 0,
      availableUnits: totalUnits,
      blockedUnits: 0,
    });
    currentDate.setDate(currentDate.getDate() + 1);
  }

  // Calculate reserved units for each day
  for (const reservation of reservations) {
    const checkIn = new Date(reservation.check_in);
    const checkOut = new Date(reservation.check_out);
    const unitsRequested = reservation.units_requested || 1;

    // Mark each night as reserved
    const resDate = new Date(Math.max(checkIn.getTime(), dateRange.startDate.getTime()));
    const resEndDate = new Date(Math.min(checkOut.getTime(), dateRange.endDate.getTime()));

    while (resDate < resEndDate) {
      const dateStr = formatDateString(resDate);
      const dayAvail = availability.get(dateStr);
      if (dayAvail) {
        dayAvail.reservedUnits += unitsRequested;
        dayAvail.availableUnits = Math.max(0, dayAvail.totalUnits - dayAvail.reservedUnits - dayAvail.blockedUnits);
      }
      resDate.setDate(resDate.getDate() + 1);
    }
  }

  return availability;
}

/**
 * Convert PMS availability to QloApps availability updates
 */
export function mapAvailabilityToQloApps(
  dailyAvailability: Map<string, DailyAvailability>,
  qloAppsRoomTypeId: number
): QloAppsAvailabilityUpdate[] {
  const updates: QloAppsAvailabilityUpdate[] = [];

  for (const [date, avail] of dailyAvailability) {
    updates.push({
      roomTypeId: qloAppsRoomTypeId,
      date,
      quantity: avail.availableUnits,
    });
  }

  return updates;
}

// ============================================================================
// Rate Calculation
// ============================================================================

/**
 * Get room type rates for a date range
 * For now, returns the base price. Future: support dynamic pricing
 */
export async function getRoomTypeRates(
  roomTypeId: string,
  dateRange: DateRange
): Promise<Map<string, number>> {
  const rates = new Map<string, number>();

  // Get room type details
  const roomType = await db('room_types')
    .where({ id: roomTypeId })
    .whereNull('deleted_at')
    .first();

  if (!roomType) {
    throw new Error(`Room type ${roomTypeId} not found`);
  }

  const basePrice = roomType.price_per_night || 0;

  // TODO: Implement dynamic pricing by checking:
  // 1. Special date-based rates from a rates table (if exists)
  // 2. Seasonal pricing rules
  // 3. Demand-based pricing

  // For now, use base price for all dates
  const currentDate = new Date(dateRange.startDate);
  while (currentDate <= dateRange.endDate) {
    const dateStr = formatDateString(currentDate);
    rates.set(dateStr, basePrice);
    currentDate.setDate(currentDate.getDate() + 1);
  }

  return rates;
}

/**
 * Convert PMS rates to QloApps rate updates
 */
export function mapRatesToQloApps(
  rates: Map<string, number>,
  qloAppsRoomTypeId: number,
  options?: {
    minStay?: number;
    maxStay?: number;
    closedToArrival?: boolean;
    closedToDeparture?: boolean;
  }
): QloAppsRateUpdate[] {
  const updates: QloAppsRateUpdate[] = [];

  for (const [date, price] of rates) {
    const update: QloAppsRateUpdate = {
      roomTypeId: qloAppsRoomTypeId,
      date,
      price,
    };

    if (options?.minStay !== undefined) {
      update.minStay = options.minStay;
    }
    if (options?.maxStay !== undefined) {
      update.maxStay = options.maxStay;
    }
    if (options?.closedToArrival !== undefined) {
      update.closedToArrival = options.closedToArrival;
    }
    if (options?.closedToDeparture !== undefined) {
      update.closedToDeparture = options.closedToDeparture;
    }

    updates.push(update);
  }

  return updates;
}

// ============================================================================
// Batch Processing
// ============================================================================

/**
 * Create availability update batches for all mapped room types
 */
export async function createAvailabilityBatches(
  dateRange: DateRange
): Promise<AvailabilityBatch[]> {
  const batches: AvailabilityBatch[] = [];

  // Get all room type mappings
  const mappings = await db('qloapps_room_type_mappings')
    .where({ is_active: true })
    .select('pms_room_type_id', 'qloapps_room_type_id');

  for (const mapping of mappings) {
    try {
      const availability = await calculateRoomTypeAvailability(
        mapping.pms_room_type_id,
        dateRange
      );

      const updates = mapAvailabilityToQloApps(
        availability,
        parseInt(mapping.qloapps_room_type_id, 10)
      );

      batches.push({
        roomTypeId: mapping.pms_room_type_id,
        qloAppsRoomTypeId: parseInt(mapping.qloapps_room_type_id, 10),
        updates,
      });
    } catch (error) {
      console.error(`Failed to calculate availability for room type ${mapping.pms_room_type_id}:`, error);
      // Continue with other room types
    }
  }

  return batches;
}

/**
 * Create rate update batches for all mapped room types
 */
export async function createRateBatches(
  dateRange: DateRange
): Promise<RateBatch[]> {
  const batches: RateBatch[] = [];

  // Get all room type mappings
  const mappings = await db('qloapps_room_type_mappings')
    .where({ is_active: true })
    .select('pms_room_type_id', 'qloapps_room_type_id');

  for (const mapping of mappings) {
    try {
      const rates = await getRoomTypeRates(
        mapping.pms_room_type_id,
        dateRange
      );

      const updates = mapRatesToQloApps(
        rates,
        parseInt(mapping.qloapps_room_type_id, 10)
      );

      batches.push({
        roomTypeId: mapping.pms_room_type_id,
        qloAppsRoomTypeId: parseInt(mapping.qloapps_room_type_id, 10),
        updates,
      });
    } catch (error) {
      console.error(`Failed to get rates for room type ${mapping.pms_room_type_id}:`, error);
      // Continue with other room types
    }
  }

  return batches;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Format date to YYYY-MM-DD string
 */
export function formatDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Parse YYYY-MM-DD string to Date
 */
export function parseDateString(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  if (!year || !month || !day) {
    throw new Error(`Invalid date string: ${dateStr}`);
  }
  return new Date(year, month - 1, day);
}

/**
 * Get date range for availability sync
 * Default: today to 365 days in the future
 */
export function getDefaultDateRange(futureDays: number = 365): DateRange {
  const startDate = new Date();
  startDate.setHours(0, 0, 0, 0);

  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + futureDays);

  return { startDate, endDate };
}

/**
 * Split a date range into smaller chunks for batch processing
 */
export function splitDateRange(
  dateRange: DateRange,
  chunkSizeDays: number = 30
): DateRange[] {
  const chunks: DateRange[] = [];
  const currentStart = new Date(dateRange.startDate);

  while (currentStart < dateRange.endDate) {
    const chunkEnd = new Date(currentStart);
    chunkEnd.setDate(chunkEnd.getDate() + chunkSizeDays - 1);

    // Don't exceed the end date
    const actualEnd = chunkEnd > dateRange.endDate ? new Date(dateRange.endDate) : chunkEnd;

    chunks.push({
      startDate: new Date(currentStart),
      endDate: actualEnd,
    });

    currentStart.setDate(currentStart.getDate() + chunkSizeDays);
  }

  return chunks;
}

/**
 * Compare availability between PMS and QloApps
 * Returns dates where availability differs
 */
export function findAvailabilityDifferences(
  pmsAvailability: Map<string, DailyAvailability>,
  qloAppsQuantities: Map<string, number>
): Array<{ date: string; pmsQty: number; qloAppsQty: number }> {
  const differences: Array<{ date: string; pmsQty: number; qloAppsQty: number }> = [];

  for (const [date, avail] of pmsAvailability) {
    const qloAppsQty = qloAppsQuantities.get(date);
    if (qloAppsQty === undefined || qloAppsQty !== avail.availableUnits) {
      differences.push({
        date,
        pmsQty: avail.availableUnits,
        qloAppsQty: qloAppsQty ?? -1, // -1 indicates no data in QloApps
      });
    }
  }

  return differences;
}
