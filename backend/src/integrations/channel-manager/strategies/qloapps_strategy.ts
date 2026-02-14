/**
 * QloApps Channel Manager Strategy (Adapter)
 *
 * Wraps the existing QloApps integration to implement IChannelManagerStrategy.
 * Delegates to existing QloApps hooks and services.
 */

import type {
  IChannelManagerStrategy,
  ChannelManagerName,
  SyncReservationInput,
  SyncAvailabilityInput,
  SyncRatesInput,
  SyncResult,
  ConnectionTestResult,
} from '../types.js';
import db from '../../../config/database.js';
import { QloAppsClient } from '../../qloapps/qloapps_client.js';
import { decrypt } from '../../../utils/encryption.js';
import {
  queueQloAppsReservationSyncHook,
  queueQloAppsAvailabilitySyncHook,
  queueQloAppsRateSyncHook,
} from '../../qloapps/hooks/sync_hooks.js';

export class QloAppsChannelStrategy implements IChannelManagerStrategy {
  private hotelId = '00000000-0000-0000-0000-000000000000';

  getName(): ChannelManagerName {
    return 'qloapps';
  }

  getDisplayName(): string {
    return 'QloApps';
  }

  async initialize(): Promise<void> {
    console.log('[QloAppsStrategy] Initialized');
  }

  async isEnabled(): Promise<boolean> {
    const config = await db('qloapps_config')
      .where({ hotel_id: this.hotelId })
      .first();

    return config?.sync_enabled === true;
  }

  /**
   * Check if outbound reservation sync is enabled
   */
  private async isOutboundReservationSyncEnabled(): Promise<boolean> {
    const config = await db('qloapps_config')
      .where({ hotel_id: this.hotelId })
      .first();

    if (!config) {
      console.warn(
        `[QloAppsStrategy] QloApps config not found for property ${this.hotelId}, outbound reservation sync disabled`
      );
      return false;
    }

    if (!config.sync_enabled) {
      console.warn(
        `[QloAppsStrategy] Global sync disabled for property ${this.hotelId}, outbound reservation sync disabled`
      );
      return false;
    }

    if (!config.sync_reservations_outbound) {
      console.warn(
        `[QloAppsStrategy] Outbound reservation sync disabled for property ${this.hotelId}`
      );
      return false;
    }

    return true;
  }

  async testConnection(): Promise<ConnectionTestResult> {
    try {
      const startTime = Date.now();

      // Check if config exists
      const config = await db('qloapps_config')
        .where({ hotel_id: this.hotelId })
        .first();

      if (!config) {
        return {
          success: false,
          message: 'QloApps is not configured. Please set up the connection first.',
        };
      }

      // Validate required fields
      if (!config.base_url || !config.api_key_encrypted || !config.qloapps_hotel_id) {
        return {
          success: false,
          message: 'QloApps configuration is incomplete. Please reconfigure the connection.',
        };
      }

      console.log('[QloAppsStrategy] Testing connection with:', {
        baseUrl: config.base_url,
        hotelId: config.qloapps_hotel_id,
      });

      const apiKey = decrypt(config.api_key_encrypted);
      const client = new QloAppsClient({
        baseUrl: config.base_url,
        apiKey,
        hotelId: config.qloapps_hotel_id,
      });

      // Test the connection
      const result = await client.testConnection();
      const latency = Date.now() - startTime;

      console.log('[QloAppsStrategy] Test result:', { success: result.success, latency });

      return {
        success: result.success,
        message: result.message,
        latency,
      };
    } catch (error) {
      console.error('[QloAppsStrategy] Test connection error:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Connection test failed',
      };
    }
  }

  async syncReservation(input: SyncReservationInput): Promise<SyncResult> {
    const startTime = Date.now();

    try {
      // Check if outbound reservation sync is enabled first
      if (!(await this.isOutboundReservationSyncEnabled())) {
        return {
          success: true,
          operationType: 'reservation',
          itemsProcessed: 0,
          duration: Date.now() - startTime,
        };
      }

      await queueQloAppsReservationSyncHook(input.reservationId, input.action);

      return {
        success: true,
        operationType: 'reservation',
        itemsProcessed: 1,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      console.error('[QloAppsStrategy] syncReservation error:', error);
      return {
        success: false,
        operationType: 'reservation',
        itemsProcessed: 0,
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async syncAvailability(input: SyncAvailabilityInput): Promise<SyncResult> {
    const startTime = Date.now();

    try {
      // Check if enabled first
      if (!(await this.isEnabled())) {
        return {
          success: true,
          operationType: 'availability',
          itemsProcessed: 0,
          duration: Date.now() - startTime,
        };
      }

      await queueQloAppsAvailabilitySyncHook(
        input.roomTypeId,
        input.dateFrom,
        input.dateTo
      );

      return {
        success: true,
        operationType: 'availability',
        itemsProcessed: 1,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      console.error('[QloAppsStrategy] syncAvailability error:', error);
      return {
        success: false,
        operationType: 'availability',
        itemsProcessed: 0,
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async syncRates(input: SyncRatesInput): Promise<SyncResult> {
    const startTime = Date.now();

    try {
      // Check if enabled first
      if (!(await this.isEnabled())) {
        return {
          success: true,
          operationType: 'rates',
          itemsProcessed: 0,
          duration: Date.now() - startTime,
        };
      }

      await queueQloAppsRateSyncHook(input.roomTypeId, input.dateFrom, input.dateTo);

      return {
        success: true,
        operationType: 'rates',
        itemsProcessed: 1,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      console.error('[QloAppsStrategy] syncRates error:', error);
      return {
        success: false,
        operationType: 'rates',
        itemsProcessed: 0,
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}
