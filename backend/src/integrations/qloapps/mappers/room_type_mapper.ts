/**
 * QloApps Room Type Mapper
 *
 * Maps between PMS room types and QloApps products/room types.
 * Handles capacity, pricing, features, and inventory.
 */

import type {
  QloAppsRoomType,
  QloAppsRoomTypeCreateRequest,
  QloAppsRoomTypeUpdateRequest,
  QloAppsRoomFeature,
} from '../qloapps_types.js';
import type { RoomType, CreateRoomTypeRequest } from '../../../services/room_types/room_types_types.js';
import type { Beds24RoomType } from '../../../services/rooms/rooms_types.js';

// ============================================================================
// PMS → QloApps Mapping
// ============================================================================

/**
 * Map PMS room type to QloApps room type create request
 */
export function mapPmsRoomTypeToQloApps(roomType: RoomType): QloAppsRoomTypeCreateRequest {
  const request: QloAppsRoomTypeCreateRequest = {
    name: roomType.name,
    price: roomType.price_per_night,
    max_adults: roomType.max_adult || roomType.max_people || 2,
    max_children: roomType.max_children || 0,
    active: true,
  };

  // Add description if available
  if (roomType.description) {
    request.description = roomType.description;
  }

  return request;
}

/**
 * Map PMS room type to QloApps room type update request
 */
export function mapPmsRoomTypeToQloAppsUpdate(
  roomType: RoomType,
  qloAppsId: number
): QloAppsRoomTypeUpdateRequest {
  const request: QloAppsRoomTypeUpdateRequest = {
    id: qloAppsId,
    name: roomType.name,
    price: roomType.price_per_night,
    max_adults: roomType.max_adult || roomType.max_people || 2,
    max_children: roomType.max_children || 0,
    active: true,
  };

  if (roomType.description) {
    request.description = roomType.description;
  }

  return request;
}

// ============================================================================
// QloApps → PMS Mapping
// ============================================================================

/**
 * Map QloApps room type to PMS room type data for creation
 */
export function mapQloAppsRoomTypeToPms(
  qloAppsRoomType: QloAppsRoomType
): CreateRoomTypeRequest {
  // Safely calculate max_people
  const maxAdults = qloAppsRoomType.max_adults || 2;
  const maxChildren = qloAppsRoomType.max_children || 0;
  const maxPeople = qloAppsRoomType.max_guests || (maxAdults + maxChildren);
  
  // Ensure price is a number (QloApps may return string)
  const pricePerNight = typeof qloAppsRoomType.price === 'string' 
    ? parseFloat(qloAppsRoomType.price) 
    : (qloAppsRoomType.price || 0);
  
  // Ensure quantity is a number
  const qty = typeof qloAppsRoomType.quantity === 'string'
    ? parseInt(qloAppsRoomType.quantity, 10)
    : (qloAppsRoomType.quantity || 1);

  const result: CreateRoomTypeRequest = {
    name: qloAppsRoomType.name,
    room_type: 'double', // Default to double room type (most common)
    qty: isNaN(qty) ? 1 : qty,
    price_per_night: isNaN(pricePerNight) ? 0 : pricePerNight,
    max_adult: maxAdults,
    max_children: maxChildren,
    max_people: maxPeople,
    features: mapQloAppsFeaturesToPms(qloAppsRoomType.features),
  };

  // Only add description if it exists (exactOptionalPropertyTypes compliance)
  if (qloAppsRoomType.description) {
    result.description = qloAppsRoomType.description;
  }

  return result;
}

/**
 * Map QloApps room features to PMS features array
 */
export function mapQloAppsFeaturesToPms(features?: QloAppsRoomFeature[]): string[] {
  if (!features || features.length === 0) {
    return [];
  }

  return features.map(feature => {
    if (feature.value) {
      return `${feature.name}: ${feature.value}`;
    }
    return feature.name;
  });
}

/**
 * Map PMS features array to QloApps room features
 * Note: This requires feature IDs from QloApps, which needs to be fetched separately
 */
export function mapPmsFeaturesToQloApps(features: string[]): Partial<QloAppsRoomFeature>[] {
  return features.map(feature => {
    // Try to parse "name: value" format
    const parts = feature.split(':').map(s => s.trim());
    if (parts.length >= 2) {
      return {
        name: parts[0]!,
        value: parts.slice(1).join(':'),
      };
    }
    return {
      name: feature,
    };
  });
}

// ============================================================================
// Comparison Utilities
// ============================================================================

/**
 * Check if a QloApps room type needs updating from PMS data
 */
export function roomTypeNeedsUpdate(
  qloAppsRoomType: QloAppsRoomType,
  pmsRoomType: RoomType
): {
  needsUpdate: boolean;
  changes: string[];
} {
  const changes: string[] = [];

  // Compare name
  if (qloAppsRoomType.name !== pmsRoomType.name) {
    changes.push(`name: ${qloAppsRoomType.name} → ${pmsRoomType.name}`);
  }

  // Compare price (with tolerance)
  const priceDiff = Math.abs(qloAppsRoomType.price - pmsRoomType.price_per_night);
  if (priceDiff > 0.01) {
    changes.push(`price: ${qloAppsRoomType.price} → ${pmsRoomType.price_per_night}`);
  }

  // Compare capacity
  const pmsMaxAdults = pmsRoomType.max_adult || pmsRoomType.max_people || 2;
  if (qloAppsRoomType.max_adults !== pmsMaxAdults) {
    changes.push(`max_adults: ${qloAppsRoomType.max_adults} → ${pmsMaxAdults}`);
  }

  const pmsMaxChildren = pmsRoomType.max_children || 0;
  if (qloAppsRoomType.max_children !== pmsMaxChildren) {
    changes.push(`max_children: ${qloAppsRoomType.max_children} → ${pmsMaxChildren}`);
  }

  // Compare active status
  if (!qloAppsRoomType.active) {
    changes.push('active: false → true');
  }

  return {
    needsUpdate: changes.length > 0,
    changes,
  };
}

/**
 * Calculate match score between PMS room type and QloApps room type
 * Used for auto-matching during initial sync
 */
export function calculateRoomTypeMatchScore(
  pmsRoomType: RoomType,
  qloAppsRoomType: QloAppsRoomType
): number {
  let score = 0;

  // Exact name match
  if (pmsRoomType.name.toLowerCase() === qloAppsRoomType.name.toLowerCase()) {
    score += 50;
  } else if (
    pmsRoomType.name.toLowerCase().includes(qloAppsRoomType.name.toLowerCase()) ||
    qloAppsRoomType.name.toLowerCase().includes(pmsRoomType.name.toLowerCase())
  ) {
    score += 25;
  }

  // Price similarity (within 10%)
  const priceRatio = Math.min(pmsRoomType.price_per_night, qloAppsRoomType.price) /
    Math.max(pmsRoomType.price_per_night, qloAppsRoomType.price);
  if (priceRatio > 0.9) {
    score += 20;
  } else if (priceRatio > 0.8) {
    score += 10;
  }

  // Capacity match
  const pmsMaxGuests = pmsRoomType.max_people || (pmsRoomType.max_adult || 2) + (pmsRoomType.max_children || 0);
  const qloAppsMaxGuests = qloAppsRoomType.max_guests || qloAppsRoomType.max_adults + qloAppsRoomType.max_children;
  if (pmsMaxGuests === qloAppsMaxGuests) {
    score += 15;
  }

  // Quantity match
  if (pmsRoomType.qty === (qloAppsRoomType.quantity || 1)) {
    score += 15;
  }

  return Math.min(100, score);
}

/**
 * Validate that a QloApps room type has all required fields
 */
export function validateQloAppsRoomType(roomType: QloAppsRoomType): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!roomType.id) {
    errors.push('Missing room type ID');
  }

  if (!roomType.name) {
    errors.push('Missing room type name');
  }

  if (roomType.price === undefined || roomType.price < 0) {
    errors.push('Invalid or missing price');
  }

  if (!roomType.max_adults || roomType.max_adults < 1) {
    errors.push('Invalid max_adults (must be at least 1)');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Generate a unique identifier for room type matching
 * Combines name and capacity for fuzzy matching
 */
export function generateRoomTypeFingerprint(
  name: string,
  maxGuests: number,
  price: number
): string {
  const normalizedName = name.toLowerCase().replace(/[^a-z0-9]/g, '');
  return `${normalizedName}-${maxGuests}-${Math.round(price)}`;
}

/**
 * Calculate availability for a room type on a specific date
 * Takes into account total quantity and active reservations
 */
export function calculateAvailableUnits(
  totalQty: number,
  reservedUnits: number
): number {
  return Math.max(0, totalQty - reservedUnits);
}
