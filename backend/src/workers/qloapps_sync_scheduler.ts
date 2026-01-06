#!/usr/bin/env node

/**
 * QloApps Sync Scheduler Entry Point
 * Run this as a separate process to run scheduled pull syncs from QloApps
 *
 * Usage: npm run worker:qloapps-sync
 * or: tsx src/workers/qloapps_sync_scheduler.ts
 *
 * Environment variables:
 * - QLOAPPS_SYNC_INTERVAL_MS: Sync interval in milliseconds (default: 300000 = 5 minutes)
 *
 * This script imports and runs the sync scheduler from the QloApps integration module.
 */

// Simply re-export the main sync scheduler - it runs itself when imported
import '../integrations/qloapps/workers/sync_scheduler.js';
