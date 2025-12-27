#!/usr/bin/env node

/**
 * Outbound Worker Entry Point
 * Run this as a separate process to consume messages from pms.outbound queue
 * 
 * Usage: npm run worker:outbound
 * or: tsx src/workers/outbound_worker.ts
 */

import { initRabbitMQ } from '../config/rabbitmq.js';
import { initTopology } from '../integrations/beds24/queue/rabbitmq_topology.js';
import { startOutboundWorker, stopOutboundWorker } from '../integrations/beds24/workers/outbound_worker.js';

let worker: Awaited<ReturnType<typeof startOutboundWorker>> | null = null;

/**
 * Graceful shutdown handler
 */
async function shutdown() {
  console.log('\n[OutboundWorker] Shutting down...');
  
  if (worker) {
    await stopOutboundWorker(worker);
  }
  
  process.exit(0);
}

// Handle shutdown signals
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('[OutboundWorker] Uncaught exception:', error);
  shutdown();
});

process.on('unhandledRejection', (error) => {
  console.error('[OutboundWorker] Unhandled rejection:', error);
  shutdown();
});

/**
 * Main function
 */
async function main() {
  try {
    console.log('[OutboundWorker] Initializing...');
    
    // Initialize RabbitMQ connection
    initRabbitMQ();
    
    // Initialize topology (exchange, queues, bindings)
    await initTopology();
    
    // Start worker
    worker = await startOutboundWorker();
    
    console.log('[OutboundWorker] Running. Press Ctrl+C to stop.');
  } catch (error) {
    console.error('[OutboundWorker] Failed to start:', error);
    process.exit(1);
  }
}

// Start the worker
main();

