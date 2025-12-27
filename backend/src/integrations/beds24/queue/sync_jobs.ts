/**
 * Queue job definitions for Beds24 sync
 * 
 * Note: This uses a simple in-memory queue for now.
 * For production, integrate with Bull/Redis when available.
 */

import type { SyncResult } from '../beds24_sync_types.js';
import { ReservationPushService } from '../services/reservation_push_service.js';
import { AvailabilityPushService } from '../services/availability_push_service.js';
import db from '../../../config/database.js';
import { decrypt } from '../../../utils/encryption.js';

/**
 * Job data types
 */
export interface SyncReservationJobData {
  type: 'reservation';
  action: 'create' | 'update' | 'cancel';
  reservationId: string;
  priority?: number;
}

export interface SyncAvailabilityJobData {
  type: 'availability';
  roomId: string;
  includeRates?: boolean;
  priority?: number;
}

export interface SyncRatesJobData {
  type: 'rate';
  roomId: string;
  priority?: number;
}

export type SyncJobData = SyncReservationJobData | SyncAvailabilityJobData | SyncRatesJobData;

/**
 * Process a sync job
 */
export async function processSyncJob(jobData: SyncJobData): Promise<SyncResult> {
  // Load Beds24 config
  const propertyId = '00000000-0000-0000-0000-000000000001';
  const config = await db('beds24_config')
    .where({ property_id: propertyId })
    .first();

  if (!config) {
    throw new Error('Beds24 configuration not found');
  }

  if (!config.sync_enabled || !config.push_sync_enabled) {
    throw new Error('Beds24 sync is disabled');
  }

  const refreshToken = decrypt(config.refresh_token);

  try {
    if (jobData.type === 'reservation') {
      const service = new ReservationPushService(refreshToken);
      
      switch (jobData.action) {
        case 'create':
        case 'update':
          return await service.pushReservation(jobData.reservationId);
        case 'cancel':
          return await service.cancelReservation(jobData.reservationId);
        default:
          throw new Error(`Unknown reservation action: ${jobData.action}`);
      }
    } else if (jobData.type === 'availability') {
      const service = new AvailabilityPushService(refreshToken);
      const options: { includeRates?: boolean; isRoomType?: boolean; idempotencyKey?: string } = {};
      if (jobData.includeRates !== undefined) {
        options.includeRates = jobData.includeRates;
      }
      return await service.pushRoomAvailability(jobData.roomId, undefined, options);
    } else if (jobData.type === 'rate') {
      const service = new AvailabilityPushService(refreshToken);
      return await service.pushRates(jobData.roomId);
    } else {
      throw new Error(`Unknown job type: ${(jobData as any).type}`);
    }
  } catch (error) {
    throw error instanceof Error ? error : new Error('Unknown error');
  }
}

/**
 * Queue a sync job (simple in-memory implementation)
 * In production, this should use Bull/Redis
 */
class SimpleQueue {
  private jobs: Array<{ data: SyncJobData; resolve: (result: SyncResult) => void; reject: (error: Error) => void }> = [];
  private processing = false;

  async add(jobData: SyncJobData): Promise<Promise<SyncResult>> {
    return new Promise((resolve, reject) => {
      this.jobs.push({ data: jobData, resolve, reject });
      this.processQueue();
    });
  }

  private async processQueue() {
    if (this.processing || this.jobs.length === 0) {
      return;
    }

    this.processing = true;

    while (this.jobs.length > 0) {
      const job = this.jobs.shift()!;
      
      try {
        const result = await processSyncJob(job.data);
        job.resolve(result);
      } catch (error) {
        job.reject(error instanceof Error ? error : new Error('Unknown error'));
      }
    }

    this.processing = false;
  }
}

// Export singleton queue instance
export const syncQueue = new SimpleQueue();

/**
 * Queue a reservation sync job
 */
export async function queueReservationSync(
  reservationId: string,
  action: 'create' | 'update' | 'cancel' = 'update',
  priority: number = 10
): Promise<Promise<SyncResult>> {
  return syncQueue.add({
    type: 'reservation',
    action,
    reservationId,
    priority,
  });
}

/**
 * Queue an availability sync job
 */
export async function queueAvailabilitySync(
  roomId: string,
  includeRates: boolean = false,
  priority: number = 5
): Promise<Promise<SyncResult>> {
  return syncQueue.add({
    type: 'availability',
    roomId,
    includeRates,
    priority,
  });
}

/**
 * Queue a rates sync job
 */
export async function queueRatesSync(
  roomId: string,
  priority: number = 3
): Promise<Promise<SyncResult>> {
  return syncQueue.add({
    type: 'rate',
    roomId,
    priority,
  });
}

