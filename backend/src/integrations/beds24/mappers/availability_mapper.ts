import type {
  Beds24CalendarDay,
  Beds24CalendarUpdate,
} from '../beds24_types.js';
import type { RoomResponse } from '../../../services/rooms/rooms_types.js';
import db from '../../../config/database.js';

/**
 * Date range for availability sync
 */
export interface DateRange {
  startDate: Date;
  endDate: Date;
}

/**
 * Calculate room availability for a date range
 * Returns number of available units per day
 * Supports both individual rooms (legacy) and room types (new)
 */
export async function calculateRoomAvailability(
  roomId: string,
  dateRange: DateRange,
  isRoomType: boolean = false
): Promise<Map<string, number>> {
  const availability = new Map<string, number>();

  // Try room type first (new), then individual room (legacy)
  let room: any = null;
  let totalUnits = 1;

  if (isRoomType) {
    room = await db('room_types').where({ id: roomId }).whereNull('deleted_at').first();
    if (room) {
      totalUnits = room.qty || 1;
    }
  } else {
    // Try individual room first (legacy)
    room = await db('rooms').where({ id: roomId }).first();
    if (!room) {
      // Fallback: try as room type
      room = await db('room_types').where({ id: roomId }).whereNull('deleted_at').first();
      if (room) {
        totalUnits = room.qty || 1;
        isRoomType = true;
      }
    }
  }

  if (!room) {
    throw new Error(`Room or room type ${roomId} not found`);
  }

  // Get all reservations for this room/room type in the date range
  const reservationQuery = isRoomType
    ? db('reservations').where({ room_type_id: roomId })
    : db('reservations').where({ room_id: roomId });

  // Extract date strings to avoid TypeScript inference issues
  const endDateStr = dateRange.endDate.toISOString().split('T')[0];
  const startDateStr = dateRange.startDate.toISOString().split('T')[0];

  const reservations = await reservationQuery
    .whereNotIn('status', ['Cancelled', 'Checked-out'])
    .whereNull('deleted_at')
    .where(function () {
      this.whereRaw('check_in <= ?', [endDateStr])
        .andWhereRaw('check_out > ?', [startDateStr]);
    })
    .select('check_in', 'check_out', 'status', 'units_requested');

  // Get maintenance/out-of-service periods
  // Note: maintenance_requests table only has room_id (not room_type_id)
  // and doesn't have start_date, end_date, or affected_units columns
  // For room types, we skip maintenance checks as the table doesn't support them
  // For individual rooms, we check maintenance but only use status (no date ranges)
  let maintenance: any[] = [];
  if (!isRoomType) {
    // For individual rooms, check maintenance requests
    // Note: maintenance_requests doesn't have date ranges, so we check all active maintenance
    // This is a limitation - maintenance_requests table needs date fields for proper availability calculation
    try {
      maintenance = await db('maintenance_requests')
        .where({ room_id: roomId })
        .where('status', '!=', 'Completed')
        .where('status', '!=', 'Repaired')
        .select('id', 'status');
    } catch (error) {
      // If query fails (e.g., columns don't exist), set empty array
      console.warn('Could not fetch maintenance requests:', error);
      maintenance = [];
    }
  }

  // Get housekeeping out-of-order status (only for individual rooms, not room types)
  let housekeeping: any[] = [];
  if (!isRoomType) {
    housekeeping = await db('housekeeping')
      .where({ room_id: roomId })
      .where('status', 'Out of Service')
      .whereRaw('date >= ?', [dateRange.startDate.toISOString().split('T')[0]])
      .whereRaw('date <= ?', [dateRange.endDate.toISOString().split('T')[0]])
      .select('date');
  }

  // Calculate availability for each day
  const currentDate = new Date(dateRange.startDate);
  while (currentDate <= dateRange.endDate) {
    const dateStr = currentDate.toISOString().split('T')[0]; // YYYY-MM-DD
    let availableUnits = totalUnits;

    // Subtract reserved units (count units_requested, not just reservation count)
    const reservedUnitsOnDate = reservations
      .filter((res) => {
        const checkIn = new Date(res.check_in);
        const checkOut = new Date(res.check_out);
        return currentDate >= checkIn && currentDate < checkOut;
      })
      .reduce((sum, res) => sum + (res.units_requested || 1), 0);
    availableUnits -= reservedUnitsOnDate;

    // Subtract maintenance units
    // Note: maintenance_requests doesn't have date ranges, so if there are any active maintenance
    // requests, we subtract 1 unit for the entire period (this is a limitation)
    // TODO: Add start_date, end_date, and affected_units columns to maintenance_requests table
    const maintenanceUnitsOnDate = maintenance.length > 0 ? 1 : 0;
    availableUnits -= maintenanceUnitsOnDate;

    // Subtract housekeeping out-of-order
    const housekeepingOnDate = housekeeping.filter((h) => {
      if (!h.date || !dateStr) return false;
      const hDate = new Date(h.date);
      const hDateStr = hDate.toISOString().split('T')[0];
      return hDateStr === dateStr;
    }).length;
    availableUnits -= housekeepingOnDate;

    // Ensure non-negative
    if (dateStr) {
      availability.set(dateStr, Math.max(0, availableUnits));
    }

    // Move to next day
    currentDate.setDate(currentDate.getDate() + 1);
  }

  return availability;
}

/**
 * Map PMS room availability to Beds24 calendar format
 * Supports both individual rooms (legacy) and room types (new)
 */
export async function mapPmsAvailabilityToBeds24(
  room: RoomResponse | any, // Can be RoomResponse or room type
  dateRange: DateRange,
  beds24RoomId: string
): Promise<Beds24CalendarUpdate> {
  // Determine if this is a room type (has qty field) or individual room
  const isRoomType = 'qty' in room && room.qty !== undefined;
  
  // Calculate availability
  const availability = await calculateRoomAvailability(room.id, dateRange, isRoomType);

  // Build calendar data
  const calendarData: Record<string, Partial<Beds24CalendarDay>> = {};

  availability.forEach((numAvail, dateStr) => {
    calendarData[dateStr] = {
      numAvail,
    };
  });

  const startDateStr = dateRange.startDate.toISOString().split('T')[0];
  const endDateStr = dateRange.endDate.toISOString().split('T')[0];
  
  if (!startDateStr || !endDateStr) {
    throw new Error('Invalid date range');
  }

  return {
    roomId: parseInt(beds24RoomId, 10),
    startDate: startDateStr,
    endDate: endDateStr,
    data: calendarData,
  };
}

/**
 * Map PMS room rates to Beds24 calendar format
 */
export async function mapPmsRatesToBeds24(
  room: RoomResponse,
  dateRange: DateRange,
  beds24RoomId: string
): Promise<Beds24CalendarUpdate> {
  const calendarData: Record<string, Partial<Beds24CalendarDay>> = {};

  // For now, use room's base price_per_night for all dates
  // TODO: Implement seasonal rates, day-of-week rates, etc.
  const currentDate = new Date(dateRange.startDate);
  const pricePerNight = room.price_per_night;
  if (pricePerNight !== undefined && pricePerNight !== null) {
    while (currentDate <= dateRange.endDate) {
      const dateStr = currentDate.toISOString().split('T')[0];
      if (dateStr) {
        calendarData[dateStr] = {
          prices: {
            default: Number(pricePerNight),
          },
        };
      }

      currentDate.setDate(currentDate.getDate() + 1);
    }
  }

  const startDateStr = dateRange.startDate.toISOString().split('T')[0];
  const endDateStr = dateRange.endDate.toISOString().split('T')[0];
  
  if (!startDateStr || !endDateStr) {
    throw new Error('Invalid date range');
  }
  
  return {
    roomId: parseInt(beds24RoomId, 10),
    startDate: startDateStr,
    endDate: endDateStr,
    data: calendarData,
  };
}

/**
 * Get default date range for availability sync (today + 365 days)
 */
export function getDefaultDateRange(): DateRange {
  const startDate = new Date();
  startDate.setHours(0, 0, 0, 0);

  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + 365); // 1 year ahead

  return { startDate, endDate };
}

