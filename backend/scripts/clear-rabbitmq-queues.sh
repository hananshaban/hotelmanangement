#!/bin/bash

# Script to clear RabbitMQ queues manually
# Usage: ./clear-rabbitmq-queues.sh [queue-name]
# If no queue name provided, clears all queues

RABBITMQ_HOST="${RABBITMQ_HOST:-localhost}"
RABBITMQ_PORT="${RABBITMQ_PORT:-5672}"
RABBITMQ_USER="${RABBITMQ_USER:-guest}"
RABBITMQ_PASS="${RABBITMQ_PASS:-guest}"

# Queue names
QUEUES=("beds24.inbound" "pms.outbound" "beds24.dlq" "pms.dlq")

if [ -z "$1" ]; then
  echo "Clearing all queues..."
  for queue in "${QUEUES[@]}"; do
    echo "Purging queue: $queue"
    rabbitmqctl purge_queue "$queue" || echo "Failed to purge $queue (queue may not exist)"
  done
else
  echo "Purging queue: $1"
  rabbitmqctl purge_queue "$1" || echo "Failed to purge $1"
fi

echo "Done!"



