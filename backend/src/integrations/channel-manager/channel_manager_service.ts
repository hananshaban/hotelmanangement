/**
 * Channel Manager Service (Lightweight Facade)
 *
 * A simplified service that manages channel manager selection.
 * - QloApps: Uses strategy pattern
 * - Beds24: Uses direct integration (no strategy wrapper)
 *
 * This is an incremental approach - Beds24 can be migrated to strategy later.
 */

import db from '../../config/database.js';
import type {
  ChannelManagerName,
  ChannelManagerStatus,
  SyncReservationInput,
  SyncAvailabilityInput,
  SyncRatesInput,
  SyncResult,
  ConnectionTestResult,
} from './types.js';
import { QloAppsChannelStrategy } from './strategies/qloapps_strategy.js';

class ChannelManagerService {
  private static instance: ChannelManagerService;
  private qloAppsStrategy: QloAppsChannelStrategy;
  private activeChannelManager: ChannelManagerName = 'qloapps'; // Default to QloApps
  private propertyId = '00000000-0000-0000-0000-000000000000';
  private initialized = false;

  private constructor() {
    this.qloAppsStrategy = new QloAppsChannelStrategy();
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): ChannelManagerService {
    if (!ChannelManagerService.instance) {
      ChannelManagerService.instance = new ChannelManagerService();
    }
    return ChannelManagerService.instance;
  }

  /**
   * Initialize the service (call on app startup)
   */
  public async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    console.log('[ChannelManager] Initializing...');

    // Initialize QloApps strategy
    await this.qloAppsStrategy.initialize();

    // Load active channel manager from database
    await this.loadActiveChannelManager();

    this.initialized = true;
    console.log(`[ChannelManager] Active: ${this.activeChannelManager}`);
  }

  /**
   * Load active channel manager from database
   * Auto-detects and prefers QloApps if configured
   */
  private async loadActiveChannelManager(): Promise<void> {
    try {
      const settings = await db('hotels')
        .where({ id: this.propertyId })
        .first();

      // If explicitly set, use it
      if (settings?.active_channel_manager) {
        this.activeChannelManager = settings.active_channel_manager;
        return;
      }

      // Otherwise, prefer QloApps if configured
      const qloAppsConfig = await db('qloapps_config')
        .where({ hotel_id: this.propertyId })
        .first();

      if (qloAppsConfig?.api_key_encrypted && qloAppsConfig?.sync_enabled) {
        this.activeChannelManager = 'qloapps';
        // Auto-set in database
        await db('hotels')
          .where({ id: this.propertyId })
          .update({ active_channel_manager: 'qloapps' });
        console.log('[ChannelManager] Auto-detected QloApps configuration, setting as active channel manager');
      } else {
        // Default to QloApps even if not configured (Beds24 disabled)
        this.activeChannelManager = 'qloapps';
      }
    } catch (error) {
      console.error('[ChannelManager] Error loading active channel manager:', error);
      this.activeChannelManager = 'qloapps'; // Default to QloApps
    }
  }

  /**
   * Get the currently active channel manager
   */
  public getActiveChannelManager(): ChannelManagerName {
    return this.activeChannelManager;
  }

  /**
   * Check if QloApps is the active channel manager
   */
  public isQloAppsActive(): boolean {
    return this.activeChannelManager === 'qloapps';
  }

  /**
   * Check if Beds24 is the active channel manager
   */
  public isBeds24Active(): boolean {
    return this.activeChannelManager === 'beds24';
  }

  /**
   * Switch to a different channel manager
   */
  public async switchTo(channelManager: ChannelManagerName): Promise<void> {
    // Validate the channel manager
    if (!['beds24', 'qloapps'].includes(channelManager)) {
      throw new Error(`Invalid channel manager: ${channelManager}`);
    }

    // If switching to QloApps, check if it's configured
    if (channelManager === 'qloapps') {
      const isEnabled = await this.qloAppsStrategy.isEnabled();
      if (!isEnabled) {
        throw new Error('QloApps is not configured or sync is disabled');
      }
    }

    // If switching to Beds24, check if it's configured
    if (channelManager === 'beds24') {
      const beds24Config = await db('beds24_config')
        .where({ hotel_id: this.propertyId })
        .first();

      if (!beds24Config || !beds24Config.sync_enabled) {
        throw new Error('Beds24 is not configured or sync is disabled');
      }
    }

    // Update database
    await db('hotels')
      .where({ id: this.propertyId })
      .update({ active_channel_manager: channelManager });

    this.activeChannelManager = channelManager;
    console.log(`[ChannelManager] Switched to: ${channelManager}`);
  }

  /**
   * Get full status of all channel managers
   */
  public async getStatus(): Promise<ChannelManagerStatus> {
    // Check Beds24 config
    const beds24Config = await db('beds24_config')
      .where({ hotel_id: this.propertyId })
      .first();

    // Check QloApps config
    const qloAppsConfig = await db('qloapps_config')
      .where({ hotel_id: this.propertyId })
      .first();

    return {
      active: this.activeChannelManager,
      available: ['beds24', 'qloapps'],
      beds24: {
        configured: !!beds24Config?.api_key_encrypted,
        syncEnabled: beds24Config?.sync_enabled || false,
      },
      qloapps: {
        configured: !!qloAppsConfig?.api_key_encrypted,
        syncEnabled: qloAppsConfig?.sync_enabled || false,
      },
    };
  }

  // ========================================================================
  // Sync Operations (QloApps only - Beds24 uses direct calls)
  // ========================================================================

  /**
   * Sync reservation via QloApps strategy
   * Only use this when QloApps is active; Beds24 uses direct hooks
   */
  public async syncReservation(input: SyncReservationInput): Promise<SyncResult> {
    if (!this.isQloAppsActive()) {
      throw new Error('QloApps is not active. Use Beds24 hooks directly.');
    }

    return this.qloAppsStrategy.syncReservation(input);
  }

  /**
   * Sync availability via QloApps strategy
   */
  public async syncAvailability(input: SyncAvailabilityInput): Promise<SyncResult> {
    if (!this.isQloAppsActive()) {
      throw new Error('QloApps is not active. Use Beds24 hooks directly.');
    }

    return this.qloAppsStrategy.syncAvailability(input);
  }

  /**
   * Sync rates via QloApps strategy
   */
  public async syncRates(input: SyncRatesInput): Promise<SyncResult> {
    if (!this.isQloAppsActive()) {
      throw new Error('QloApps is not active. Use Beds24 hooks directly.');
    }

    return this.qloAppsStrategy.syncRates(input);
  }

  /**
   * Test QloApps connection
   */
  public async testQloAppsConnection(): Promise<ConnectionTestResult> {
    return this.qloAppsStrategy.testConnection();
  }
}

// Export singleton instance
export const channelManagerService = ChannelManagerService.getInstance();
