#!/usr/bin/env node

/**
 * QloApps Inbound Worker Entry Point
 * Run this as a separate process to consume messages from qloapps.inbound queue
 *
 * Usage: npm run worker:qloapps-inbound
 * or: tsx src/workers/qloapps_inbound_worker.ts
 */

import { initRabbitMQ } from '../config/rabbitmq.js';
import { initQloAppsTopology } from '../integrations/qloapps/queue/rabbitmq_topology.js';
import {
  startQloAppsInboundWorker,
  stopQloAppsInboundWorker,
  QloAppsInboundWorker,
} from '../integrations/qloapps/workers/inbound_worker.js';

let worker: QloAppsInboundWorker | null = null;

/**
 * Graceful shutdown handler
 */
async function shutdown(): Promise<void> {
  console.log('\n[QloApps InboundWorker] Shutting down...');

  if (worker) {
    await stopQloAppsInboundWorker(worker);
  }

  process.exit(0);
}

// Handle shutdown signals
process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('[QloApps InboundWorker] Uncaught exception:', error);
  void shutdown();
});

process.on('unhandledRejection', (error) => {
  console.error('[QloApps InboundWorker] Unhandled rejection:', error);
  void shutdown();
});

/**
 * Main function
 */
async function main(): Promise<void> {
  try {
    console.log('[QloApps InboundWorker] Initializing...');

    // Initialize RabbitMQ connection
    initRabbitMQ();

    // Initialize QloApps topology (exchange, queues, bindings)
    await initQloAppsTopology();

    // Start worker
    worker = await startQloAppsInboundWorker();

    console.log('[QloApps InboundWorker] Running. Press Ctrl+C to stop.');
  } catch (error) {
    console.error('[QloApps InboundWorker] Failed to start:', error);
    process.exit(1);
  }
}

// Start the worker
void main();
