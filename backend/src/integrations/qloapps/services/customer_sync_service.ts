/**
 * QloApps Customer Sync Service
 *
 * Syncs customers between PMS and QloApps.
 * Handles pulling customers from QloApps and creating/matching PMS guests.
 */

import { QloAppsClient } from '../qloapps_client.js';
import { QLOAPPS_CONFIG } from '../qloapps_config.js';
import type {
  QloAppsCustomer,
  QloAppsSyncResult,
} from '../qloapps_types.js';
import { QloAppsGuestMatchingService } from './guest_matching_service.js';
import db from '../../../config/database.js';
import { decrypt } from '../../../utils/encryption.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Result of syncing a single customer
 */
export interface CustomerSyncResult {
  success: boolean;
  pmsGuestId?: string;
  qloAppsCustomerId?: number;
  action: 'created' | 'matched' | 'updated' | 'skipped' | 'failed';
  error?: string;
  matchScore?: number;
}

/**
 * Options for customer sync
 */
export interface CustomerSyncOptions {
  /** Only sync specific QloApps customer IDs */
  qloAppsCustomerIds?: number[];
  /** Minimum match score for guest matching (0-100) */
  minMatchScore?: number;
  /** Whether to update existing guest data */
  updateExisting?: boolean;
}

// ============================================================================
// Customer Sync Service
// ============================================================================

/**
 * Service for syncing customers between PMS and QloApps
 */
export class QloAppsCustomerSyncService {
  private client: QloAppsClient;
  private configId: string;
  private hotelId: string;
  private qloAppsHotelId: number;
  private guestMatchingService: QloAppsGuestMatchingService;

  constructor(client: QloAppsClient, configId: string, hotelId: string, qloAppsHotelId: number) {
    this.client = client;
    this.configId = configId;
    this.hotelId = hotelId;
    this.qloAppsHotelId = qloAppsHotelId;
    this.guestMatchingService = new QloAppsGuestMatchingService();
  }

  /**
   * Create a new CustomerSyncService instance from stored config
   */
  static async fromConfigId(configId: string): Promise<QloAppsCustomerSyncService> {
    const config = await db('qloapps_config')
      .where({ id: configId })
      .first();

    if (!config) {
      throw new Error(`QloApps config not found: ${configId}`);
    }

    const apiKey = decrypt(config.api_key_encrypted);
    const client = new QloAppsClient({
      baseUrl: config.base_url,
      apiKey,
      hotelId: parseInt(config.qloapps_hotel_id, 10),
    });

    return new QloAppsCustomerSyncService(
      client,
      configId,
      config.hotel_id,
      parseInt(config.qloapps_hotel_id, 10)
    );
  }

  /**
   * Get all QloApps customers
   */
  async getQloAppsCustomers(): Promise<QloAppsCustomer[]> {
    console.log('[QloApps Customer Sync] Fetching customers from QloApps...');
    const customers = await this.client.getCustomers({ limit: 1000 });
    console.log(`[QloApps Customer Sync] Fetched ${customers.length} customers`);
    return customers;
  }

  /**
   * Get existing customer mappings
   */
  async getExistingMappings(): Promise<Map<number, string>> {
    const mappings = await db('qloapps_customer_mappings')
      .where({
        hotel_id: this.hotelId,
        qloapps_hotel_id: this.qloAppsHotelId.toString(),
      })
      .select('qloapps_customer_id', 'local_guest_id');

    const map = new Map<number, string>();
    for (const mapping of mappings) {
      map.set(parseInt(mapping.qloapps_customer_id, 10), mapping.local_guest_id);
    }

    return map;
  }

  /**
   * Create a customer mapping
   */
  async createMapping(
    qloAppsCustomerId: number,
    pmsGuestId: string,
    matchType: 'email' | 'phone' | 'name' | 'new' = 'new',
    matchScore?: number
  ): Promise<void> {
    await db('qloapps_customer_mappings').insert({
      hotel_id: this.hotelId,
      local_guest_id: pmsGuestId,
      qloapps_customer_id: qloAppsCustomerId.toString(),
      qloapps_hotel_id: this.qloAppsHotelId.toString(),
      match_type: matchType === 'name' ? 'manual' : matchType === 'new' ? 'booking' : matchType,
      is_active: true,
      is_verified: matchType === 'email', // Auto-verify email matches
      sync_direction: 'bidirectional',
      last_synced_at: new Date(),
      last_sync_status: 'success',
    });

    console.log(`[QloApps Customer Sync] Created mapping: QloApps customer ${qloAppsCustomerId} -> PMS guest ${pmsGuestId}`);
  }

  /**
   * Update existing mapping
   */
  async updateMapping(
    qloAppsCustomerId: number,
    pmsGuestId: string
  ): Promise<void> {
    await db('qloapps_customer_mappings')
      .where({
        hotel_id: this.hotelId,
        qloapps_customer_id: qloAppsCustomerId.toString(),
        qloapps_hotel_id: this.qloAppsHotelId.toString(),
      })
      .update({
        local_guest_id: pmsGuestId,
        last_synced_at: new Date(),
        last_sync_status: 'success',
      });

    console.log(`[QloApps Customer Sync] Updated mapping: QloApps customer ${qloAppsCustomerId} -> PMS guest ${pmsGuestId}`);
  }

  /**
   * Pull customers from QloApps to PMS
   * Creates PMS guests for QloApps customers without mappings
   */
  async pullCustomers(options: CustomerSyncOptions = {}): Promise<CustomerSyncResult[]> {
    const results: CustomerSyncResult[] = [];

    console.log('[QloApps Customer Sync] Starting customer pull sync...');

    // Get customers from QloApps
    const qloAppsCustomers = await this.getQloAppsCustomers();
    
    // Filter by specific customer IDs if provided
    const customersToSync = options.qloAppsCustomerIds
      ? qloAppsCustomers.filter(c => options.qloAppsCustomerIds!.includes(c.id))
      : qloAppsCustomers;

    console.log(`[QloApps Customer Sync] Processing ${customersToSync.length} customers...`);

    // Get existing mappings
    const existingMappings = await this.getExistingMappings();

    for (const qloAppsCustomer of customersToSync) {
      try {
        // Check if mapping already exists
        const existingGuestId = existingMappings.get(qloAppsCustomer.id);

        if (existingGuestId) {
          // Already mapped, skip unless updateExisting is true
          if (options.updateExisting) {
            // TODO: Update guest data if needed
            results.push({
              success: true,
              qloAppsCustomerId: qloAppsCustomer.id,
              pmsGuestId: existingGuestId,
              action: 'updated',
            });
          } else {
            results.push({
              success: true,
              qloAppsCustomerId: qloAppsCustomer.id,
              pmsGuestId: existingGuestId,
              action: 'skipped',
            });
          }
          continue;
        }

        // Find or create guest using matching service
        const matchResult = await this.guestMatchingService.findOrCreateGuest(
          qloAppsCustomer,
          {
            minMatchScore: options.minMatchScore || 70,
            createIfNotFound: true,
            updateExisting: options.updateExisting !== false,
          }
        );

        // Create mapping
        await this.createMapping(
          qloAppsCustomer.id,
          matchResult.guestId,
          matchResult.matchSource || 'new',
          matchResult.matchScore
        );

        const result: CustomerSyncResult = {
          success: true,
          pmsGuestId: matchResult.guestId,
          qloAppsCustomerId: qloAppsCustomer.id,
          action: matchResult.created ? 'created' : 'matched',
        };
        if (matchResult.matchScore !== undefined) {
          result.matchScore = matchResult.matchScore;
        }
        results.push(result);

        console.log(
          `[QloApps Customer Sync] ${matchResult.created ? 'Created' : 'Matched'} guest ${matchResult.guestId} for QloApps customer ${qloAppsCustomer.id} (${matchResult.matchSource})`
        );
      } catch (error) {
        console.error(`[QloApps Customer Sync] Failed to sync customer ${qloAppsCustomer.id}:`, error);
        results.push({
          success: false,
          qloAppsCustomerId: qloAppsCustomer.id,
          action: 'failed',
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    // Summary
    const created = results.filter(r => r.action === 'created').length;
    const matched = results.filter(r => r.action === 'matched').length;
    const updated = results.filter(r => r.action === 'updated').length;
    const skipped = results.filter(r => r.action === 'skipped').length;
    const failed = results.filter(r => r.action === 'failed').length;

    console.log('[QloApps Customer Sync] 📊 Customer sync results:');
    console.log(`[QloApps Customer Sync]   ✓ Created: ${created}`);
    console.log(`[QloApps Customer Sync]   ✓ Matched: ${matched}`);
    console.log(`[QloApps Customer Sync]   ✓ Updated: ${updated}`);
    console.log(`[QloApps Customer Sync]   ⊘ Skipped: ${skipped}`);
    console.log(`[QloApps Customer Sync]   ✗ Failed: ${failed}`);

    return results;
  }

  /**
   * Run customer sync and return aggregate results
   */
  async runCustomerSync(options: CustomerSyncOptions = {}): Promise<QloAppsSyncResult> {
    const startTime = Date.now();

    try {
      const results = await this.pullCustomers(options);

      const processed = results.length;
      const created = results.filter(r => r.action === 'created').length;
      const matched = results.filter(r => r.action === 'matched').length;
      const synced = created + matched;
      const failed = results.filter(r => !r.success).length;

      return {
        success: failed === 0,
        syncType: 'customers',
        processedCount: processed,
        createdCount: synced,
        updatedCount: 0,
        skippedCount: 0,
        failedCount: failed,
        errors: results
          .filter(r => r.error)
          .map(r => `Customer ${r.qloAppsCustomerId}: ${r.error}`),
        durationMs: Date.now() - startTime,
        startedAt: new Date(startTime),
        completedAt: new Date(),
      };
    } catch (error) {
      return {
        success: false,
        syncType: 'customers',
        processedCount: 0,
        createdCount: 0,
        updatedCount: 0,
        skippedCount: 0,
        failedCount: 0,
        errors: [error instanceof Error ? error.message : 'Unknown error'],
        durationMs: Date.now() - startTime,
        startedAt: new Date(startTime),
        completedAt: new Date(),
      };
    }
  }
}

