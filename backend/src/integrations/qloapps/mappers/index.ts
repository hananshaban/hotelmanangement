/**
 * QloApps Mappers Index
 *
 * Central export point for all QloApps data mappers.
 * Import from this file for clean, organized imports.
 */

// Guest Mapper
export {
  mapPmsGuestToQloApps,
  mapPmsGuestToQloAppsBookingCustomer,
  mapQloAppsCustomerToPms,
  mapQloAppsBookingCustomerToPms,
  extractGuestName,
  generatePlaceholderEmail,
  normalizePhone,
  calculateGuestMatchScore,
  needsUpdate as guestNeedsUpdate,
} from './guest_mapper.js';

// Reservation Mapper
export {
  mapQloAppsStatusToPms,
  mapPmsStatusToQloApps,
  mapQloAppsPaymentStatusToPms,
  mapPmsPaymentStatusToQloApps,
  mapQloAppsSourceToPms,
  mapPmsSourceToQloApps,
  mapPmsReservationToQloApps,
  mapPmsReservationToQloAppsUpdate,
  mapQloAppsBookingToPms,
  extractBookingDates,
  formatDateForQloApps,
  formatDateForPms,
  hasBookingChanged,
  validateQloAppsBooking,
  calculateNights,
} from './reservation_mapper.js';

// Room Type Mapper
export {
  mapPmsRoomTypeToQloApps,
  mapPmsRoomTypeToQloAppsUpdate,
  mapQloAppsRoomTypeToPms,
  mapQloAppsFeaturesToPms,
  mapPmsFeaturesToQloApps,
  roomTypeNeedsUpdate,
  calculateRoomTypeMatchScore,
  validateQloAppsRoomType,
  generateRoomTypeFingerprint,
  calculateAvailableUnits,
} from './room_type_mapper.js';

// Availability Mapper
export {
  calculateRoomTypeAvailability,
  mapAvailabilityToQloApps,
  getRoomTypeRates,
  mapRatesToQloApps,
  createAvailabilityBatches,
  createRateBatches,
  formatDateString,
  parseDateString,
  getDefaultDateRange,
  splitDateRange,
  findAvailabilityDifferences,
} from './availability_mapper.js';

// Re-export types from availability mapper
export type {
  DateRange,
  DailyAvailability,
  AvailabilityBatch,
  RateBatch,
} from './availability_mapper.js';
