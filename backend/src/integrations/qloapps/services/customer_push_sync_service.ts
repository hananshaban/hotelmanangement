/**
 * QloApps Customer Push Sync Service
 *
 * Pushes guests from PMS to QloApps as customers.
 * Handles matching, creating, and updating customers in QloApps.
 */

import { QloAppsClient } from '../qloapps_client.js';
import { QLOAPPS_CONFIG } from '../qloapps_config.js';
import type { QloAppsCustomer } from '../qloapps_types.js';
import { mapPmsGuestToQloApps, calculateGuestMatchScore } from '../mappers/guest_mapper.js';
import db from '../../../config/database.js';
import { decrypt } from '../../../utils/encryption.js';
import type { GuestResponse } from '../../../services/guests/guests_types.js';
import crypto from 'crypto';

// ============================================================================
// Types
// ============================================================================

/**
 * Result of pushing a single guest
 */
export interface CustomerPushResult {
  success: boolean;
  pmsGuestId: string;
  qloAppsCustomerId?: number;
  action: 'created' | 'updated' | 'matched' | 'skipped' | 'failed';
  error?: string;
}

/**
 * Options for push sync operation
 */
export interface CustomerPushSyncOptions {
  /** Specific guest IDs to push */
  guestIds?: string[];
  /** Maximum guests to process */
  limit?: number;
  /** Force update even if no changes detected */
  forceUpdate?: boolean;
}

// ============================================================================
// Customer Push Sync Service
// ============================================================================

/**
 * Service for pushing guests from PMS to QloApps
 */
export class QloAppsCustomerPushSyncService {
  private client: QloAppsClient;
  private configId: string;
  private hotelId: string;
  private qloAppsHotelId: number;

  constructor(
    client: QloAppsClient,
    configId: string,
    hotelId: string,
    qloAppsHotelId: number
  ) {
    this.client = client;
    this.configId = configId;
    this.hotelId = hotelId;
    this.qloAppsHotelId = qloAppsHotelId;
  }

  /**
   * Create a new CustomerPushSyncService instance from stored config
   */
  static async fromConfigId(configId: string): Promise<QloAppsCustomerPushSyncService> {
    const config = await db('qloapps_config')
      .where({ id: configId })
      .first();

    if (!config) {
      throw new Error(`QloApps config not found: ${configId}`);
    }

    const apiKey = decrypt(config.api_key_encrypted);
    const hotelId = parseInt(config.qloapps_hotel_id, 10);

    const client = new QloAppsClient({
      baseUrl: config.base_url,
      apiKey,
      hotelId,
    });

    return new QloAppsCustomerPushSyncService(
      client,
      configId,
      config.hotel_id,
      hotelId
    );
  }

  /**
   * Push a single guest to QloApps
   */
  async pushGuest(guestId: string): Promise<CustomerPushResult> {
    console.log(`[QloApps Customer Push] Processing guest ${guestId}...`);

    try {
      // Get guest from database
      const guest = await db('guests')
        .where({ id: guestId })
        .whereNull('deleted_at')
        .first();

      if (!guest) {
        return {
          success: false,
          pmsGuestId: guestId,
          action: 'failed',
          error: 'Guest not found',
        };
      }

      // Check if guest is already mapped
      const existingMapping = await db('qloapps_customer_mappings')
        .where({
          hotel_id: this.hotelId,
          local_guest_id: guestId,
          is_active: true,
        })
        .first();

      if (existingMapping) {
        // Update existing customer
        return await this.updateCustomer(guest, parseInt(existingMapping.qloapps_customer_id, 10));
      } else {
        // Find or create customer
        return await this.findOrCreateCustomer(guest);
      }
    } catch (error) {
      console.error(`[QloApps Customer Push] Error pushing guest ${guestId}:`, error);
      return {
        success: false,
        pmsGuestId: guestId,
        action: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Find or create a customer in QloApps
   */
  private async findOrCreateCustomer(guest: GuestResponse): Promise<CustomerPushResult> {
    console.log(`[QloApps Customer Push] Finding or creating customer for guest ${guest.id}...`);

    try {
      // Try to find existing customer by email
      let qloAppsCustomer: QloAppsCustomer | null = null;
      
      if (guest.email) {
        qloAppsCustomer = await this.client.findCustomerByEmail(guest.email);
        
        if (qloAppsCustomer) {
          // Found existing customer by email - create mapping
          console.log(`[QloApps Customer Push] Found existing customer ${qloAppsCustomer.id} by email`);
          
          await this.createMapping(guest.id, qloAppsCustomer.id, 'email');
          
          return {
            success: true,
            pmsGuestId: guest.id,
            qloAppsCustomerId: qloAppsCustomer.id,
            action: 'matched',
          };
        }
      }

      // No match found - create new customer
      console.log(`[QloApps Customer Push] Creating new customer for guest ${guest.id}...`);
      
      const customerData = mapPmsGuestToQloApps(guest);
      const qloAppsCustomerId = await this.client.createCustomer(customerData);

      // Create mapping
      await this.createMapping(guest.id, qloAppsCustomerId, 'manual');

      console.log(`[QloApps Customer Push] Created customer ${qloAppsCustomerId} for guest ${guest.id}`);

      return {
        success: true,
        pmsGuestId: guest.id,
        qloAppsCustomerId,
        action: 'created',
      };
    } catch (error) {
      console.error(`[QloApps Customer Push] Error finding/creating customer:`, error);
      return {
        success: false,
        pmsGuestId: guest.id,
        action: 'failed',
        error: error instanceof Error ? error.message : 'Failed to create customer',
      };
    }
  }

  /**
   * Update an existing customer in QloApps
   */
  private async updateCustomer(
    guest: GuestResponse,
    qloAppsCustomerId: number
  ): Promise<CustomerPushResult> {
    console.log(`[QloApps Customer Push] Updating customer ${qloAppsCustomerId} for guest ${guest.id}...`);

    try {
      // Get current customer data from QloApps
      const currentCustomer = await this.client.getCustomer(qloAppsCustomerId);

      if (!currentCustomer) {
        console.warn(`[QloApps Customer Push] Customer ${qloAppsCustomerId} not found in QloApps`);
        // Customer was deleted in QloApps - create new one
        return await this.findOrCreateCustomer(guest);
      }

      // Check if update is needed
      const needsUpdate = this.checkIfUpdateNeeded(guest, currentCustomer);

      if (!needsUpdate) {
        console.log(`[QloApps Customer Push] Customer ${qloAppsCustomerId} is up to date, skipping`);
        
        // Update last synced timestamp
        await db('qloapps_customer_mappings')
          .where({
            hotel_id: this.hotelId,
            local_guest_id: guest.id,
          })
          .update({
            last_synced_at: new Date(),
            last_sync_status: 'success',
            updated_at: new Date(),
          });

        return {
          success: true,
          pmsGuestId: guest.id,
          qloAppsCustomerId,
          action: 'skipped',
        };
      }

      // Update customer
      const updateData = mapPmsGuestToQloApps(guest);
      await this.client.updateCustomer({
        id: qloAppsCustomerId,
        ...updateData,
      });

      // Update mapping
      await db('qloapps_customer_mappings')
        .where({
          hotel_id: this.hotelId,
          local_guest_id: guest.id,
        })
        .update({
          local_hash: this.calculateGuestHash(guest),
          last_synced_at: new Date(),
          last_sync_status: 'success',
          updated_at: new Date(),
        });

      console.log(`[QloApps Customer Push] Updated customer ${qloAppsCustomerId}`);

      return {
        success: true,
        pmsGuestId: guest.id,
        qloAppsCustomerId,
        action: 'updated',
      };
    } catch (error) {
      console.error(`[QloApps Customer Push] Error updating customer:`, error);
      return {
        success: false,
        pmsGuestId: guest.id,
        qloAppsCustomerId,
        action: 'failed',
        error: error instanceof Error ? error.message : 'Failed to update customer',
      };
    }
  }

  /**
   * Create a customer mapping
   */
  private async createMapping(
    guestId: string,
    qloAppsCustomerId: number,
    matchType: 'email' | 'phone' | 'manual'
  ): Promise<void> {
    const guest = await db('guests').where({ id: guestId }).first();
    
    await db('qloapps_customer_mappings').insert({
      id: crypto.randomUUID(),
      hotel_id: this.hotelId,
      local_guest_id: guestId,
      qloapps_customer_id: qloAppsCustomerId.toString(),
      qloapps_hotel_id: this.qloAppsHotelId.toString(),
      match_type: matchType,
      sync_direction: 'outbound',
      is_active: true,
      is_verified: matchType === 'email', // Auto-verify email matches
      local_hash: guest ? this.calculateGuestHash(guest) : null,
      last_synced_at: new Date(),
      last_sync_status: 'success',
      created_at: new Date(),
      updated_at: new Date(),
    });

    console.log(`[QloApps Customer Push] Created mapping: guest ${guestId} -> customer ${qloAppsCustomerId}`);
  }

  /**
   * Check if customer update is needed
   */
  private checkIfUpdateNeeded(guest: GuestResponse, customer: QloAppsCustomer): boolean {
    // Check name
    const guestFirstName = guest.name.trim().split(/\s+/)[0] || '';
    const guestLastName = guest.name.trim().split(/\s+/).slice(1).join(' ') || '';
    
    if (customer.firstname !== guestFirstName || customer.lastname !== guestLastName) {
      return true;
    }

    // Check email
    if (guest.email && guest.email !== customer.email) {
      return true;
    }

    // Check phone
    const normalizePhone = (phone: string) => phone.replace(/[\s\-\(\)\.]/g, '');
    const guestPhone = guest.phone ? normalizePhone(guest.phone) : '';
    const customerPhone = customer.phone ? normalizePhone(customer.phone) : '';
    
    if (guestPhone && guestPhone !== customerPhone) {
      return true;
    }

    return false;
  }

  /**
   * Calculate hash of guest data for change detection
   */
  private calculateGuestHash(guest: GuestResponse): string {
    const data = {
      name: guest.name,
      email: guest.email || '',
      phone: guest.phone || '',
    };

    return crypto
      .createHash('sha256')
      .update(JSON.stringify(data))
      .digest('hex');
  }

  /**
   * Push multiple guests
   */
  async pushGuests(guestIds: string[]): Promise<CustomerPushResult[]> {
    const results: CustomerPushResult[] = [];

    console.log(`[QloApps Customer Push] Pushing ${guestIds.length} guests...`);

    for (const guestId of guestIds) {
      const result = await this.pushGuest(guestId);
      results.push(result);
    }

    return results;
  }
}

