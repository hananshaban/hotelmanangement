/**
 * QloApps Guest Mapper
 *
 * Maps between PMS guest format and QloApps customer format.
 * Handles name splitting, email/phone normalization, and address mapping.
 */

import type { QloAppsCustomer, QloAppsBookingCustomer, QloAppsCustomerCreateRequest } from '../qloapps_types.js';
import type { GuestResponse } from '../../../services/guests/guests_types.js';

// ============================================================================
// PMS → QloApps Mapping
// ============================================================================

/**
 * Map PMS guest to QloApps customer format for creation
 */
export function mapPmsGuestToQloApps(guest: GuestResponse): QloAppsCustomerCreateRequest {
  // Split full name into first and last name
  const { firstName, lastName } = extractGuestName(guest.name);

  const result: QloAppsCustomerCreateRequest = {
    firstname: firstName,
    lastname: lastName,
    email: guest.email || generatePlaceholderEmail(guest),
    active: true,
    // Generate a random password for the customer (required by QloApps)
    passwd: generateRandomPassword(),
  };

  // Add phone if available
  if (guest.phone) {
    result.phone = normalizePhone(guest.phone);
    result.phone_mobile = normalizePhone(guest.phone);
  }

  // Add notes if available
  if (guest.notes) {
    result.note = guest.notes;
  }

  return result;
}

/**
 * Map PMS guest to QloApps booking customer format
 * This is a simpler format used within booking creation
 */
export function mapPmsGuestToQloAppsBookingCustomer(guest: GuestResponse): QloAppsBookingCustomer {
  const { firstName, lastName } = extractGuestName(guest.name);

  return {
    firstname: firstName,
    lastname: lastName,
    email: guest.email || generatePlaceholderEmail(guest),
    phone: guest.phone ? normalizePhone(guest.phone) : '',
  };
}

// ============================================================================
// QloApps → PMS Mapping
// ============================================================================

/**
 * Map QloApps customer to PMS guest format
 */
export function mapQloAppsCustomerToPms(customer: QloAppsCustomer): {
  name: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
} {
  const firstName = (customer.firstname || '').trim();
  const lastName = (customer.lastname || '').trim();

  // Build full name
  let fullName = [firstName, lastName].filter(Boolean).join(' ').trim();

  // Fallback if no name provided
  if (!fullName) {
    if (customer.email) {
      // Extract name from email (e.g., "john.doe@example.com" -> "John Doe")
      const emailName = customer.email.split('@')[0]?.replace(/[._-]/g, ' ');
      fullName = capitalizeWords(emailName || 'Unknown Guest');
    } else if (customer.phone || customer.phone_mobile) {
      fullName = `Guest (${customer.phone || customer.phone_mobile})`;
    } else {
      fullName = 'Unknown Guest';
    }
  }

  return {
    name: fullName,
    email: customer.email || null,
    phone: customer.phone || customer.phone_mobile || null,
    notes: customer.note || null,
  };
}

/**
 * Map QloApps booking customer to PMS guest format
 * This is for the simplified customer data in bookings
 */
export function mapQloAppsBookingCustomerToPms(customer: QloAppsBookingCustomer): {
  name: string;
  email: string | null;
  phone: string | null;
} {
  const firstName = (customer.firstname || '').trim();
  const lastName = (customer.lastname || '').trim();

  // Build full name
  let fullName = [firstName, lastName].filter(Boolean).join(' ').trim();

  // Fallback if no name provided
  if (!fullName) {
    if (customer.email) {
      const emailName = customer.email.split('@')[0]?.replace(/[._-]/g, ' ');
      fullName = capitalizeWords(emailName || 'Unknown Guest');
    } else if (customer.phone) {
      fullName = `Guest (${customer.phone})`;
    } else {
      fullName = 'Unknown Guest';
    }
  }

  return {
    name: fullName,
    email: customer.email || null,
    phone: customer.phone || null,
  };
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Extract first and last name from a full name string
 */
export function extractGuestName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/);
  return {
    firstName: parts[0] || 'Guest',
    lastName: parts.slice(1).join(' ') || '',
  };
}

/**
 * Generate a placeholder email for guests without email
 * QloApps requires email for customer creation
 */
export function generatePlaceholderEmail(guest: GuestResponse): string {
  // Use phone number to create a unique placeholder email
  if (guest.phone) {
    const cleanPhone = guest.phone.replace(/\D/g, '');
    return `guest.${cleanPhone}@placeholder.local`;
  }

  // Use guest ID for truly unique placeholder
  const guestId = guest.id.replace(/-/g, '').substring(0, 12);
  return `guest.${guestId}@placeholder.local`;
}

/**
 * Generate a random password for QloApps customer creation
 */
function generateRandomPassword(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%';
  let password = '';
  for (let i = 0; i < 16; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

/**
 * Normalize phone number to a consistent format
 * Removes spaces, dashes, parentheses but keeps country codes
 */
export function normalizePhone(phone: string): string {
  // Remove common formatting characters but keep + for country codes
  return phone.replace(/[\s\-\(\)\.]/g, '');
}

/**
 * Capitalize first letter of each word
 */
function capitalizeWords(str: string): string {
  return str
    .toLowerCase()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Compare two guests for matching
 * Returns a score 0-100 indicating likelihood of same person
 */
export function calculateGuestMatchScore(
  pmsGuest: { name: string; email?: string | null; phone?: string | null },
  qloAppsCustomer: QloAppsCustomer
): number {
  let score = 0;

  // Email match is strongest indicator (exact match)
  if (pmsGuest.email && qloAppsCustomer.email) {
    if (pmsGuest.email.toLowerCase() === qloAppsCustomer.email.toLowerCase()) {
      score += 50;
    }
  }

  // Phone match (normalized)
  const pmsPhone = pmsGuest.phone ? normalizePhone(pmsGuest.phone) : null;
  const qloAppsPhone = qloAppsCustomer.phone
    ? normalizePhone(qloAppsCustomer.phone)
    : qloAppsCustomer.phone_mobile
      ? normalizePhone(qloAppsCustomer.phone_mobile)
      : null;

  if (pmsPhone && qloAppsPhone) {
    // Check if one contains the other (handles country code differences)
    if (pmsPhone.endsWith(qloAppsPhone) || qloAppsPhone.endsWith(pmsPhone)) {
      score += 30;
    } else if (pmsPhone === qloAppsPhone) {
      score += 40;
    }
  }

  // Name match (fuzzy)
  const pmsNameParts = pmsGuest.name.toLowerCase().split(/\s+/).filter(Boolean);
  const qloAppsName = `${qloAppsCustomer.firstname} ${qloAppsCustomer.lastname}`.toLowerCase();
  const qloAppsNameParts = qloAppsName.split(/\s+/).filter(Boolean);

  // Count matching name parts
  let matchingParts = 0;
  for (const part of pmsNameParts) {
    if (qloAppsNameParts.some(qPart => qPart === part || qPart.includes(part) || part.includes(qPart))) {
      matchingParts++;
    }
  }

  if (matchingParts > 0) {
    const nameScore = Math.min(20, (matchingParts / Math.max(pmsNameParts.length, qloAppsNameParts.length)) * 20);
    score += nameScore;
  }

  return Math.min(100, score);
}

/**
 * Check if a QloApps customer needs updating from PMS data
 */
export function needsUpdate(
  existingCustomer: QloAppsCustomer,
  pmsGuest: GuestResponse
): boolean {
  const { firstName, lastName } = extractGuestName(pmsGuest.name);

  // Check if names differ
  if (existingCustomer.firstname !== firstName || existingCustomer.lastname !== lastName) {
    return true;
  }

  // Check if we have email in PMS but not in QloApps
  if (pmsGuest.email && !existingCustomer.email) {
    return true;
  }

  // Check if we have phone in PMS but not in QloApps
  if (pmsGuest.phone && !existingCustomer.phone && !existingCustomer.phone_mobile) {
    return true;
  }

  return false;
}
