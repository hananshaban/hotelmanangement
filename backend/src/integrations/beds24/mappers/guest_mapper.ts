import type { Beds24Guest } from '../beds24_types.js';
import type { GuestResponse } from '../../../services/guests/guests_types.js';

/**
 * Map PMS guest to Beds24 guest format
 */
export function mapPmsGuestToBeds24(guest: GuestResponse): Beds24Guest {
  // Split name into first and last name
  const nameParts = guest.name.trim().split(/\s+/);
  const firstName = nameParts[0] || '';
  const lastName = nameParts.slice(1).join(' ') || '';

  const result: Beds24Guest = {
    firstName,
    lastName,
  };

  if (guest.email) {
    result.email = guest.email;
  }
  if (guest.phone) {
    result.phone = guest.phone;
  }

  return result;
}

/**
 * Map Beds24 guest to PMS guest format
 */
export function mapBeds24GuestToPms(guest: Beds24Guest): {
  name: string;
  email?: string;
  phone?: string;
} {
  const firstName = (guest.firstName || '').trim();
  const lastName = (guest.lastName || '').trim();
  
  // Build full name
  let fullName = [firstName, lastName].filter(Boolean).join(' ').trim();
  
  // If no name at all, try to use email or phone as identifier
  if (!fullName) {
    if (guest.email) {
      // Extract name from email (e.g., "john.doe@example.com" -> "john doe")
      const emailName = guest.email.split('@')[0]?.replace(/[._-]/g, ' ');
      fullName = emailName || 'Unknown Guest';
    } else if (guest.phone) {
      fullName = `Guest (${guest.phone})`;
    } else {
      // Last resort: use "Unknown Guest" instead of just "Guest"
      fullName = 'Unknown Guest';
    }
  }

  const result: {
    name: string;
    email?: string;
    phone?: string;
  } = {
    name: fullName,
  };

  if (guest.email) {
    result.email = guest.email;
  }
  if (guest.phone) {
    result.phone = guest.phone;
  }

  return result;
}

/**
 * Extract guest name from full name string
 */
export function extractGuestName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/);
  return {
    firstName: parts[0] || '',
    lastName: parts.slice(1).join(' ') || '',
  };
}

