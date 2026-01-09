/**
 * QloApps Guest Matching Service
 *
 * Matches and synchronizes guests between PMS and QloApps.
 * Handles finding existing guests, creating new ones, and merging data.
 */

import db from '../../../config/database.js';
import type { QloAppsCustomer, QloAppsBookingCustomer } from '../qloapps_types.js';
import {
  mapQloAppsCustomerToPms,
  mapQloAppsBookingCustomerToPms,
  normalizePhone,
  calculateGuestMatchScore,
} from '../mappers/guest_mapper.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Result of a guest matching operation
 */
export interface GuestMatchResult {
  /** PMS guest ID */
  guestId: string;
  /** Whether a new guest was created */
  created: boolean;
  /** Whether existing guest was updated */
  updated: boolean;
  /** Match confidence score (0-100) if matched existing guest */
  matchScore?: number;
  /** Source of the match (email, phone, name) */
  matchSource?: 'email' | 'phone' | 'name' | 'new';
}

/**
 * Options for guest matching
 */
export interface GuestMatchOptions {
  /** Minimum match score to consider a match (0-100) */
  minMatchScore?: number;
  /** Whether to create a new guest if no match found */
  createIfNotFound?: boolean;
  /** Whether to update existing guest with new data */
  updateExisting?: boolean;
}

// Default options
const DEFAULT_OPTIONS: Required<GuestMatchOptions> = {
  minMatchScore: 70,
  createIfNotFound: true,
  updateExisting: true,
};

// ============================================================================
// Guest Matching Service
// ============================================================================

/**
 * Service for matching QloApps customers with PMS guests
 */
export class QloAppsGuestMatchingService {
  /**
   * Get or create the default "Unknown Guest" record
   * Used when booking has no guest information
   */
  async getUnknownGuestId(): Promise<string> {
    // Find existing "Unknown Guest" record
    const unknownGuest = await db('guests')
      .where({ name: 'Unknown Guest', email: null, phone: null })
      .first();

    if (unknownGuest) {
      return unknownGuest.id;
    }

    // Create single "Unknown Guest" record if it doesn't exist
    const [newUnknownGuest] = await db('guests')
      .insert({
        name: 'Unknown Guest',
        email: null,
        phone: null,
        past_stays: 0,
      })
      .returning('id');

    return newUnknownGuest.id;
  }

  /**
   * Find or create guest from QloApps customer data
   */
  async findOrCreateGuest(
    qloAppsCustomer: QloAppsCustomer,
    options: GuestMatchOptions = {}
  ): Promise<GuestMatchResult> {
    const opts = { ...DEFAULT_OPTIONS, ...options };

    // Map QloApps customer to PMS format
    const guestData = mapQloAppsCustomerToPms(qloAppsCustomer);

    // Check if we have enough identifying information
    const hasEmail = !!guestData.email;
    const hasPhone = !!guestData.phone;
    const hasName = guestData.name && guestData.name !== 'Unknown Guest';

    // If no identifying information, use "Unknown Guest"
    if (!hasEmail && !hasPhone && !hasName) {
      const guestId = await this.getUnknownGuestId();
      return {
        guestId,
        created: false,
        updated: false,
        matchSource: 'new',
      };
    }

    // Step 1: Try to match by email (case-insensitive)
    if (hasEmail) {
      const guestByEmail = await db('guests')
        .whereRaw('LOWER(email) = LOWER(?)', [guestData.email])
        .first();

      if (guestByEmail) {
        let updated = false;
        if (opts.updateExisting) {
          updated = await this.mergeGuestData(guestByEmail.id, guestData);
        }
        return {
          guestId: guestByEmail.id,
          created: false,
          updated,
          matchScore: 100,
          matchSource: 'email',
        };
      }
    }

    // Step 2: Try to match by phone (normalized)
    if (hasPhone) {
      const normalizedPhone = normalizePhone(guestData.phone!);
      const guestByPhone = await db('guests')
        .whereNotNull('phone')
        .whereRaw(
          "REPLACE(REPLACE(REPLACE(REPLACE(phone, ' ', ''), '-', ''), '(', ''), ')', '') = ?",
          [normalizedPhone]
        )
        .first();

      if (guestByPhone) {
        let updated = false;
        if (opts.updateExisting) {
          updated = await this.mergeGuestData(guestByPhone.id, guestData);
        }
        return {
          guestId: guestByPhone.id,
          created: false,
          updated,
          matchScore: 90,
          matchSource: 'phone',
        };
      }
    }

    // Step 3: Try fuzzy name matching (only if we have a real name)
    if (hasName && guestData.name.length > 3) {
      // Search for guests with similar names
      const potentialMatches = await db('guests')
        .whereRaw('LOWER(name) LIKE ?', [`%${guestData.name.toLowerCase().split(' ')[0]}%`])
        .limit(10);

      for (const existingGuest of potentialMatches) {
        const score = this.calculateNameMatchScore(guestData.name, existingGuest.name);
        if (score >= opts.minMatchScore) {
          let updated = false;
          if (opts.updateExisting) {
            updated = await this.mergeGuestData(existingGuest.id, guestData);
          }
          return {
            guestId: existingGuest.id,
            created: false,
            updated,
            matchScore: score,
            matchSource: 'name',
          };
        }
      }
    }

    // Step 4: Create new guest if enabled
    if (!opts.createIfNotFound) {
      const guestId = await this.getUnknownGuestId();
      return {
        guestId,
        created: false,
        updated: false,
        matchSource: 'new',
      };
    }

    // Create new guest
    const [newGuest] = await db('guests')
      .insert({
        name: guestData.name,
        email: guestData.email || null,
        phone: guestData.phone || null,
        notes: guestData.notes || null,
        past_stays: 0,
      })
      .returning('id');

    return {
      guestId: newGuest.id,
      created: true,
      updated: false,
      matchSource: 'new',
    };
  }

  /**
   * Find or create guest from QloApps booking customer data
   * Simpler version that works with booking-embedded customer data
   */
  async findOrCreateGuestFromBooking(
    bookingCustomer: QloAppsBookingCustomer,
    options: GuestMatchOptions = {}
  ): Promise<GuestMatchResult> {
    const opts = { ...DEFAULT_OPTIONS, ...options };

    // Map booking customer to PMS format
    const guestData = mapQloAppsBookingCustomerToPms(bookingCustomer);

    // Check if we have enough identifying information
    const hasEmail = !!guestData.email;
    const hasPhone = !!guestData.phone;
    const hasName = guestData.name && guestData.name !== 'Unknown Guest';

    // If no identifying information, use "Unknown Guest"
    if (!hasEmail && !hasPhone && !hasName) {
      const guestId = await this.getUnknownGuestId();
      return {
        guestId,
        created: false,
        updated: false,
        matchSource: 'new',
      };
    }

    // Try to match by email first
    if (hasEmail) {
      const guestByEmail = await db('guests')
        .whereRaw('LOWER(email) = LOWER(?)', [guestData.email])
        .first();

      if (guestByEmail) {
        let updated = false;
        if (opts.updateExisting) {
          updated = await this.mergeGuestData(guestByEmail.id, guestData);
        }
        return {
          guestId: guestByEmail.id,
          created: false,
          updated,
          matchScore: 100,
          matchSource: 'email',
        };
      }
    }

    // Try to match by phone
    if (hasPhone) {
      const normalizedPhone = normalizePhone(guestData.phone!);
      const guestByPhone = await db('guests')
        .whereNotNull('phone')
        .whereRaw(
          "REPLACE(REPLACE(REPLACE(REPLACE(phone, ' ', ''), '-', ''), '(', ''), ')', '') = ?",
          [normalizedPhone]
        )
        .first();

      if (guestByPhone) {
        let updated = false;
        if (opts.updateExisting) {
          updated = await this.mergeGuestData(guestByPhone.id, guestData);
        }
        return {
          guestId: guestByPhone.id,
          created: false,
          updated,
          matchScore: 90,
          matchSource: 'phone',
        };
      }
    }

    // Create new guest
    if (!opts.createIfNotFound) {
      const guestId = await this.getUnknownGuestId();
      return {
        guestId,
        created: false,
        updated: false,
        matchSource: 'new',
      };
    }

    const [newGuest] = await db('guests')
      .insert({
        name: guestData.name,
        email: guestData.email || null,
        phone: guestData.phone || null,
        past_stays: 0,
      })
      .returning('id');

    return {
      guestId: newGuest.id,
      created: true,
      updated: false,
      matchSource: 'new',
    };
  }

  /**
   * Merge QloApps guest data into existing PMS guest
   * Returns true if any updates were made
   */
  private async mergeGuestData(
    guestId: string,
    guestData: { name: string; email: string | null; phone: string | null; notes?: string | null }
  ): Promise<boolean> {
    const existingGuest = await db('guests').where({ id: guestId }).first();
    if (!existingGuest) {
      return false;
    }

    const updates: Record<string, string | number | null> = {};

    // Update name if QloApps has a more complete name
    if (guestData.name && guestData.name.length > (existingGuest.name?.length || 0)) {
      if (guestData.name !== 'Unknown Guest') {
        updates.name = guestData.name;
      }
    }

    // Update email if missing in PMS
    if (guestData.email && !existingGuest.email) {
      updates.email = guestData.email;
    }

    // Update phone if missing in PMS
    if (guestData.phone && !existingGuest.phone) {
      updates.phone = guestData.phone;
    }

    // Append notes if provided
    if (guestData.notes && guestData.notes !== existingGuest.notes) {
      if (existingGuest.notes) {
        updates.notes = `${existingGuest.notes}\n\n[QloApps] ${guestData.notes}`;
      } else {
        updates.notes = `[QloApps] ${guestData.notes}`;
      }
    }

    if (Object.keys(updates).length > 0) {
      await db('guests')
        .where({ id: guestId })
        .update({
          ...updates,
          updated_at: new Date(),
        });
      return true;
    }

    return false;
  }

  /**
   * Calculate name match score between two names
   * Uses simple word matching algorithm
   */
  private calculateNameMatchScore(name1: string, name2: string): number {
    const words1 = name1.toLowerCase().split(/\s+/).filter(Boolean);
    const words2 = name2.toLowerCase().split(/\s+/).filter(Boolean);

    if (words1.length === 0 || words2.length === 0) {
      return 0;
    }

    // Count matching words
    let matches = 0;
    for (const word1 of words1) {
      if (words2.some(word2 => word1 === word2 || word1.includes(word2) || word2.includes(word1))) {
        matches++;
      }
    }

    // Calculate score based on proportion of matched words
    const proportion = matches / Math.max(words1.length, words2.length);
    return Math.round(proportion * 100);
  }

  /**
   * Create or update QloApps customer mapping
   */
  async createOrUpdateMapping(
    pmsGuestId: string,
    qloAppsCustomerId: number,
    propertyId: string
  ): Promise<void> {
    const existing = await db('qloapps_customer_mappings')
      .where({
        property_id: propertyId,
        local_guest_id: pmsGuestId,
      })
      .first();

    if (existing) {
      await db('qloapps_customer_mappings')
        .where({ id: existing.id })
        .update({
          qloapps_customer_id: qloAppsCustomerId.toString(),
          updated_at: new Date(),
          last_synced_at: new Date(),
        });
    } else {
      await db('qloapps_customer_mappings').insert({
        property_id: propertyId,
        local_guest_id: pmsGuestId,
        qloapps_customer_id: qloAppsCustomerId.toString(),
        sync_direction: 'bidirectional',
        match_type: 'booking',
        is_active: true,
        is_verified: false,
        last_synced_at: new Date(),
        last_sync_status: 'success',
      });
    }
  }

  /**
   * Get PMS guest ID from QloApps customer ID mapping
   */
  async getGuestIdFromMapping(
    qloAppsCustomerId: number,
    propertyId: string
  ): Promise<string | null> {
    const mapping = await db('qloapps_customer_mappings')
      .where({
        property_id: propertyId,
        qloapps_customer_id: qloAppsCustomerId.toString(),
      })
      .first();

    return mapping?.local_guest_id || null;
  }

  /**
   * Get QloApps customer ID from PMS guest ID mapping
   */
  async getQloAppsCustomerIdFromMapping(
    pmsGuestId: string,
    propertyId: string
  ): Promise<number | null> {
    const mapping = await db('qloapps_customer_mappings')
      .where({
        property_id: propertyId,
        local_guest_id: pmsGuestId,
      })
      .first();

    return mapping?.qloapps_customer_id ? parseInt(mapping.qloapps_customer_id, 10) : null;
  }
}
