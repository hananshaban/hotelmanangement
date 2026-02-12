import type { Request, Response, NextFunction } from 'express';
import { Beds24Client } from '../../integrations/beds24/beds24_client.js';
import { InitialSyncService } from '../../integrations/beds24/services/initial_sync_service.js';
import db from '../../config/database.js';
import { encrypt, decrypt } from '../../utils/encryption.js';

const PROPERTY_ID = '00000000-0000-0000-0000-000000000001';

/**
 * Get Beds24 configuration
 */
export async function getBeds24ConfigHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const config = await db('beds24_config')
      .where({ hotel_id: PROPERTY_ID })
      .first();

    if (!config) {
      res.json({
        configured: false,
        syncEnabled: false,
        pushSyncEnabled: false,
        pullSyncEnabled: false,
        webhookEnabled: false,
      });
      return;
    }

    // Parse JSONB fields
    const syncProgress = typeof config.sync_progress === 'string' 
      ? JSON.parse(config.sync_progress || '{}')
      : config.sync_progress || {};
    const syncErrors = typeof config.sync_errors === 'string'
      ? JSON.parse(config.sync_errors || '[]')
      : config.sync_errors || [];

    // Don't send encrypted tokens to frontend
    res.json({
      configured: true,
      beds24PropertyId: config.beds24_hotel_id,
      syncEnabled: config.sync_enabled,
      pushSyncEnabled: config.push_sync_enabled,
      pullSyncEnabled: config.pull_sync_enabled,
      webhookEnabled: config.webhook_enabled,
      lastSuccessfulSync: config.last_successful_sync,
      // Phase 2: Sync status tracking
      syncStatus: config.sync_status || 'idle',
      syncProgress: syncProgress,
      syncErrors: syncErrors,
      syncStartedAt: config.sync_started_at,
      syncCompletedAt: config.sync_completed_at,
      createdAt: config.created_at,
      updatedAt: config.updated_at,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Authenticate with Beds24 invite code and store tokens
 */
export async function authenticateBeds24Handler(
  req: Request<{}, {}, { inviteCode: string; beds24PropertyId: string; deviceName?: string }>,
  res: Response,
  next: NextFunction,
) {
  try {
    const { inviteCode, beds24PropertyId, deviceName } = req.body;

    if (!inviteCode || !beds24PropertyId) {
      res.status(400).json({
        error: 'inviteCode and beds24PropertyId are required',
      });
      return;
    }

    // Authenticate with Beds24
    const client = new Beds24Client();
    const authResult = await client.authenticate(inviteCode, deviceName || 'PMS-Integration');

    // Encrypt refresh token
    const encryptedRefreshToken = encrypt(authResult.refreshToken);

    // Get access token to verify it works
    client.setRefreshToken(authResult.refreshToken);
    const tokenDetails = await client.getTokenDetails();
    
    // Phase 6: Get and encrypt access token for persistence
    const accessToken = await client.getAccessToken();
    const encryptedAccessToken = encrypt(accessToken);
    
    // Calculate token expiry (default to 15 minutes if expiresIn is not provided)
    // Beds24 access tokens typically expire in 15 minutes (900 seconds)
    const expiresInSeconds = tokenDetails.expiresIn && typeof tokenDetails.expiresIn === 'number' 
      ? tokenDetails.expiresIn 
      : 900; // Default to 15 minutes
    const tokenExpiresAt = new Date(Date.now() + (expiresInSeconds * 1000) - (5 * 60 * 1000));

    // Phase 4: Validate property exists and is accessible
    const properties = await client.makeRequest<any[]>('/properties', {
      method: 'GET',
      query: { id: [parseInt(beds24PropertyId, 10)] },
    });

    const propertyArray = Array.isArray(properties) ? properties : (properties as any)?.data || [];
    if (propertyArray.length === 0) {
      res.status(400).json({
        error: `Property ${beds24PropertyId} not found or not accessible with current token scopes`,
      });
      return;
    }

    // Store or update configuration
    const existing = await db('beds24_config')
      .where({ hotel_id: PROPERTY_ID })
      .first();

    const isFirstTimeSetup = !existing;
    const beds24PropertyIdInt = parseInt(beds24PropertyId, 10);

    if (existing) {
      await db('beds24_config')
        .where({ hotel_id: PROPERTY_ID })
        .update({
          refresh_token: encryptedRefreshToken,
          access_token: encryptedAccessToken, // Phase 6: Persist access token
          token_expires_at: tokenExpiresAt, // Phase 6: Store expiry
          beds24_hotel_id: beds24PropertyId,
          sync_enabled: true,
          push_sync_enabled: true,
          pull_sync_enabled: true,
          webhook_enabled: true,
          updated_at: new Date(),
        });
    } else {
      await db('beds24_config').insert({
        hotel_id: PROPERTY_ID,
        refresh_token: encryptedRefreshToken,
        access_token: encryptedAccessToken, // Phase 6: Persist access token
        token_expires_at: tokenExpiresAt, // Phase 6: Store expiry
        beds24_hotel_id: beds24PropertyId,
        sync_enabled: true,
        push_sync_enabled: true,
        pull_sync_enabled: true,
        webhook_enabled: true,
      });
    }

    // Phase 1: Sync property ID to hotels
    await db('hotels')
      .where({ id: PROPERTY_ID })
      .update({
        beds24_hotel_id: beds24PropertyIdInt,
        updated_at: new Date(),
      });

    // Perform initial sync if this is first-time setup
    if (isFirstTimeSetup) {
      console.log('First-time Beds24 setup detected, starting initial sync...');
      
      // Phase 2: Set sync status to running before starting
      await db('beds24_config')
        .where({ hotel_id: PROPERTY_ID })
        .update({
          sync_status: 'running',
          sync_started_at: new Date(),
          sync_progress: JSON.stringify({
            rooms: { total: 0, synced: 0, errors: 0 },
            reservations: { total: 0, synced: 0, errors: 0 },
          }),
          sync_errors: JSON.stringify([]),
        });
      
      // Run initial sync in background (don't wait for it)
      const initialSyncService = new InitialSyncService(
        authResult.refreshToken,
        beds24PropertyId,
        PROPERTY_ID
      );
      initialSyncService.performInitialSync().catch((error) => {
        console.error('Initial sync failed:', error);
        // Don't fail authentication if initial sync fails
      });
    }

    res.json({
      success: true,
      message: isFirstTimeSetup
        ? 'Beds24 authentication successful. Initial sync started in background.'
        : 'Beds24 authentication successful',
      scopes: tokenDetails.scopes || [],
      propertyIds: tokenDetails.hotelIds || [],
      initialSyncStarted: isFirstTimeSetup,
    });
  } catch (error) {
    console.error('Beds24 authentication error:', error);
    res.status(400).json({
      error: error instanceof Error ? error.message : 'Failed to authenticate with Beds24',
    });
  }
}

/**
 * Update Beds24 configuration
 */
export async function updateBeds24ConfigHandler(
  req: Request<{}, {}, {
    syncEnabled?: boolean;
    pushSyncEnabled?: boolean;
    pullSyncEnabled?: boolean;
    webhookEnabled?: boolean;
    webhookSecret?: string;
  }>,
  res: Response,
  next: NextFunction,
) {
  try {
    const config = await db('beds24_config')
      .where({ hotel_id: PROPERTY_ID })
      .first();

    if (!config) {
      res.status(404).json({
        error: 'Beds24 configuration not found. Please authenticate first.',
      });
      return;
    }

    const updateData: any = {
      updated_at: new Date(),
    };

    if (req.body.syncEnabled !== undefined) {
      updateData.sync_enabled = req.body.syncEnabled;
    }
    if (req.body.pushSyncEnabled !== undefined) {
      updateData.push_sync_enabled = req.body.pushSyncEnabled;
    }
    if (req.body.pullSyncEnabled !== undefined) {
      updateData.pull_sync_enabled = req.body.pullSyncEnabled;
    }
    if (req.body.webhookEnabled !== undefined) {
      updateData.webhook_enabled = req.body.webhookEnabled;
    }
    if (req.body.webhookSecret !== undefined) {
      // Encrypt webhook secret
      updateData.webhook_secret = encrypt(req.body.webhookSecret);
    }

    await db('beds24_config')
      .where({ hotel_id: PROPERTY_ID })
      .update(updateData);

    const updated = await db('beds24_config')
      .where({ hotel_id: PROPERTY_ID })
      .first();

    res.json({
      configured: true,
      beds24PropertyId: updated.beds24_hotel_id,
      syncEnabled: updated.sync_enabled,
      pushSyncEnabled: updated.push_sync_enabled,
      pullSyncEnabled: updated.pull_sync_enabled,
      webhookEnabled: updated.webhook_enabled,
      lastSuccessfulSync: updated.last_successful_sync,
      updatedAt: updated.updated_at,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Test Beds24 connection
 */
export async function testBeds24ConnectionHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const config = await db('beds24_config')
      .where({ hotel_id: PROPERTY_ID })
      .first();

    if (!config) {
      res.status(404).json({
        error: 'Beds24 configuration not found',
      });
      return;
    }

    const refreshToken = decrypt(config.refresh_token);
    const client = new Beds24Client(refreshToken);

    // Test connection by getting token details
    const tokenDetails = await client.getTokenDetails();

    res.json({
      success: true,
      scopes: tokenDetails.scopes || [],
      propertyIds: tokenDetails.hotelIds || [],
      expiresIn: tokenDetails.expiresIn,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'Connection test failed',
    });
  }
}

/**
 * Trigger initial sync manually
 */
export async function triggerInitialSyncHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const config = await db('beds24_config')
      .where({ hotel_id: PROPERTY_ID })
      .first();

    if (!config) {
      res.status(404).json({
        error: 'Beds24 configuration not found',
      });
      return;
    }

    const refreshToken = decrypt(config.refresh_token);

    // Run initial sync in background
    const initialSyncService = new InitialSyncService(
      refreshToken,
      config.beds24_hotel_id,
      PROPERTY_ID
    );

    // Phase 2: Set sync status to running before starting
    await db('beds24_config')
      .where({ hotel_id: PROPERTY_ID })
      .update({
        sync_status: 'running',
        sync_started_at: new Date(),
        sync_progress: JSON.stringify({
          rooms: { total: 0, synced: 0, errors: 0 },
          reservations: { total: 0, synced: 0, errors: 0 },
        }),
        sync_errors: JSON.stringify([]),
      });

    // Start sync in background (don't wait)
    initialSyncService.performInitialSync().catch((error) => {
      console.error('Manual initial sync failed:', error);
    });

    res.json({
      success: true,
      message: 'Initial sync started in background',
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to start initial sync',
    });
  }
}

