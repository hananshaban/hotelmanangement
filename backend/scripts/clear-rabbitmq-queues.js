/**
 * Script to manually clear RabbitMQ queues
 * 
 * Usage:
 *   node scripts/clear-rabbitmq-queues.js [queue-name]
 * 
 * If no queue name provided, clears all queues
 */

import amqp from 'amqplib';
import { getConnectionUrl } from '../src/config/rabbitmq.js';

const QUEUES = ['beds24.inbound', 'pms.outbound', 'beds24.dlq', 'pms.dlq'];

async function purgeQueue(channel, queueName) {
  try {
    const result = await channel.checkQueue(queueName);
    if (result) {
      const purged = await channel.purgeQueue(queueName);
      console.log(`✅ Purged ${purged.messageCount} messages from queue: ${queueName}`);
      return purged.messageCount;
    } else {
      console.log(`⚠️  Queue does not exist: ${queueName}`);
      return 0;
    }
  } catch (error) {
    console.error(`❌ Error purging queue ${queueName}:`, error.message);
    return 0;
  }
}

async function main() {
  const queueName = process.argv[2];
  const queuesToPurge = queueName ? [queueName] : QUEUES;

  try {
    const connectionUrl = getConnectionUrl();
    console.log(`Connecting to RabbitMQ: ${connectionUrl.replace(/:[^:@]+@/, ':****@')}`);
    
    const connection = await amqp.connect(connectionUrl);
    const channel = await connection.createChannel();

    console.log(`\nPurging ${queuesToPurge.length} queue(s)...\n`);

    let totalPurged = 0;
    for (const queue of queuesToPurge) {
      const count = await purgeQueue(channel, queue);
      totalPurged += count;
    }

    await channel.close();
    await connection.close();

    console.log(`\n✅ Done! Total messages purged: ${totalPurged}`);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();



