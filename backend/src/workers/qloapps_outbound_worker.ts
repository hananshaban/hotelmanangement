#!/usr/bin/env node

/**
 * QloApps Outbound Worker Entry Point
 * Run this as a separate process to consume messages from qloapps.outbound queue
 *
 * Usage: npm run worker:qloapps-outbound
 * or: tsx src/workers/qloapps_outbound_worker.ts
 */

import { initRabbitMQ } from '../config/rabbitmq.js';
import { initQloAppsTopology } from '../integrations/qloapps/queue/rabbitmq_topology.js';
import {
  startQloAppsOutboundWorker,
  stopQloAppsOutboundWorker,
  QloAppsOutboundWorker,
} from '../integrations/qloapps/workers/outbound_worker.js';

let worker: QloAppsOutboundWorker | null = null;

/**
 * Graceful shutdown handler
 */
async function shutdown(): Promise<void> {
  console.log('\n[QloApps OutboundWorker] Shutting down...');

  if (worker) {
    await stopQloAppsOutboundWorker(worker);
  }

  process.exit(0);
}

// Handle shutdown signals
process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('[QloApps OutboundWorker] Uncaught exception:', error);
  void shutdown();
});

process.on('unhandledRejection', (error) => {
  console.error('[QloApps OutboundWorker] Unhandled rejection:', error);
  void shutdown();
});

/**
 * Main function
 */
async function main(): Promise<void> {
  try {
    console.log('[QloApps OutboundWorker] Initializing...');

    // Initialize RabbitMQ connection
    initRabbitMQ();

    // Initialize QloApps topology (exchange, queues, bindings)
    await initQloAppsTopology();

    // Start worker
    worker = await startQloAppsOutboundWorker();

    console.log('[QloApps OutboundWorker] Running. Press Ctrl+C to stop.');
  } catch (error) {
    console.error('[QloApps OutboundWorker] Failed to start:', error);
    process.exit(1);
  }
}

// Start the worker
void main();
