#!/usr/bin/env node

/**
 * Inbound Worker Entry Point
 * Run this as a separate process to consume messages from beds24.inbound queue
 * 
 * Usage: npm run worker:inbound
 * or: tsx src/workers/inbound_worker.ts
 */

import { initRabbitMQ } from '../config/rabbitmq.js';
import { initTopology } from '../integrations/beds24/queue/rabbitmq_topology.js';
import { startInboundWorker, stopInboundWorker } from '../integrations/beds24/workers/inbound_worker.js';

let worker: Awaited<ReturnType<typeof startInboundWorker>> | null = null;

/**
 * Graceful shutdown handler
 */
async function shutdown() {
  console.log('\n[InboundWorker] Shutting down...');
  
  if (worker) {
    await stopInboundWorker(worker);
  }
  
  process.exit(0);
}

// Handle shutdown signals
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('[InboundWorker] Uncaught exception:', error);
  shutdown();
});

process.on('unhandledRejection', (error) => {
  console.error('[InboundWorker] Unhandled rejection:', error);
  shutdown();
});

/**
 * Main function
 */
async function main() {
  try {
    console.log('[InboundWorker] Initializing...');
    
    // Initialize RabbitMQ connection
    initRabbitMQ();
    
    // Initialize topology (exchange, queues, bindings)
    await initTopology();
    
    // Start worker
    worker = await startInboundWorker();
    
    console.log('[InboundWorker] Running. Press Ctrl+C to stop.');
  } catch (error) {
    console.error('[InboundWorker] Failed to start:', error);
    process.exit(1);
  }
}

// Start the worker
main();

