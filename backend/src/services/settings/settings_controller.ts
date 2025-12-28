import type { Request, Response, NextFunction } from 'express';
import db from '../../config/database.js';
import type {
  HotelSettingsResponse,
  UpdateHotelSettingsRequest,
} from './settings_types.js';
import { logAction, logUpdate } from '../audit/audit_utils.js';

const HOTEL_SETTINGS_ID = '00000000-0000-0000-0000-000000000001';

/**
 * Clear all data except users and Beds24 token data
 * This is a dangerous operation - use with caution!
 */
export async function clearAllDataHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    // This operation should only be done by SUPER_ADMIN
    // The middleware will handle role checking

    console.log('Starting data clearing operation...');

    // Use a transaction to ensure all-or-nothing
    await db.transaction(async (trx) => {
      // Clear in order to respect foreign key constraints
      
      // 1. Clear reservation_guests (junction table)
      await trx('reservation_guests').del();
      console.log('Cleared reservation_guests');

      // 2. Clear reservations
      await trx('reservations').del();
      console.log('Cleared reservations');

      // 3. Clear invoices
      await trx('invoices').del();
      console.log('Cleared invoices');

      // 4. Clear expenses
      await trx('expenses').del();
      console.log('Cleared expenses');

      // 5. Clear maintenance_requests
      await trx('maintenance_requests').del();
      console.log('Cleared maintenance_requests');

      // 6. Clear housekeeping
      await trx('housekeeping').del();
      console.log('Cleared housekeeping');

      // 7. Clear room_types (new Beds24-style)
      await trx('room_types').del();
      console.log('Cleared room_types');

      // 8. Clear rooms (legacy individual rooms)
      await trx('rooms').del();
      console.log('Cleared rooms');

      // 9. Clear guests
      await trx('guests').del();
      console.log('Cleared guests');

      // 10. Clear sync conflicts
      await trx('sync_conflicts').del();
      console.log('Cleared sync_conflicts');

      // 11. Clear webhook events
      await trx('webhook_events').del();
      console.log('Cleared webhook_events');

      // 12. Clear audit logs
      await trx('audit_logs').del();
      console.log('Cleared audit_logs');

      // Note: We keep:
      // - users (authentication data)
      // - beds24_config (Beds24 token data)
      // - hotel_settings (hotel configuration)
    });

    console.log('Data clearing completed successfully');

    res.json({
      success: true,
      message: 'All data cleared successfully (users and Beds24 config preserved)',
    });

    // Audit log: all data cleared
    logAction(req, 'CLEAR_ALL_DATA', 'system', 'all', {
      cleared_tables: [
        'reservation_guests', 'reservations', 'invoices', 'expenses',
        'maintenance_requests', 'housekeeping', 'room_types', 'rooms',
        'guests', 'sync_conflicts', 'webhook_events', 'audit_logs'
      ],
    }).catch((err) => console.error('Audit log failed:', err));
  } catch (error) {
    console.error('Error clearing data:', error);
    next(error);
  }
}

// Get hotel settings
export async function getHotelSettingsHandler(
  req: Request,
  res: Response<HotelSettingsResponse>,
  next: NextFunction,
) {
  try {
    const settings = await db('hotel_settings')
      .where({ id: HOTEL_SETTINGS_ID })
      .first();

    if (!settings) {
      res.status(404).json({
        error: 'Hotel settings not found',
      } as any);
      return;
    }

    // Parse JSONB settings field if it's a string
    const parsedSettings =
      typeof settings.settings === 'string'
        ? JSON.parse(settings.settings)
        : settings.settings || {};

    res.json({
      ...settings,
      settings: parsedSettings,
    } as any);
  } catch (error) {
    next(error);
  }
}

// Update hotel settings
export async function updateHotelSettingsHandler(
  req: Request<{}, HotelSettingsResponse, UpdateHotelSettingsRequest>,
  res: Response<HotelSettingsResponse>,
  next: NextFunction,
) {
  try {
    const updateData: any = { ...req.body };

    // Stringify settings if provided
    if (updateData.settings) {
      updateData.settings = JSON.stringify(updateData.settings);
    }

    // Add updated_at timestamp
    updateData.updated_at = new Date();

    // Try to update existing settings
    const updated = await db('hotel_settings')
      .where({ id: HOTEL_SETTINGS_ID })
      .update(updateData)
      .returning('*');

    if (updated.length === 0) {
      // Settings don't exist, create them
      const [newSettings] = await db('hotel_settings')
        .insert({
          id: HOTEL_SETTINGS_ID,
          hotel_name: updateData.hotel_name || 'Hotel',
          ...updateData,
        })
        .returning('*');

      const parsedSettings =
        typeof newSettings.settings === 'string'
          ? JSON.parse(newSettings.settings)
          : newSettings.settings || {};

      res.json({
        ...newSettings,
        settings: parsedSettings,
      } as any);
      return;
    }

    const settings = updated[0];
    const parsedSettings =
      typeof settings.settings === 'string'
        ? JSON.parse(settings.settings)
        : settings.settings || {};

    res.json({
      ...settings,
      settings: parsedSettings,
    } as any);

    // Audit log: settings updated
    logAction(req, 'UPDATE_SETTINGS', 'hotel_settings', HOTEL_SETTINGS_ID, {
      updated_fields: Object.keys(req.body),
    }).catch((err) => console.error('Audit log failed:', err));
  } catch (error) {
    next(error);
  }
}

