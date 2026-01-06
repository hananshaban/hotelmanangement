/**
 * QloApps Queue Module
 *
 * Exports for RabbitMQ queue components.
 */

export {
  QLOAPPS_EXCHANGE_NAME,
  QLOAPPS_EXCHANGE_TYPE,
  QLOAPPS_QUEUE_NAMES,
  QLOAPPS_ROUTING_KEYS,
  setupQloAppsTopology,
  initQloAppsTopology,
  getQloAppsTopologyChannel,
  type QloAppsQueueMessage,
  type QloAppsInboundMessage,
  type QloAppsOutboundReservationMessage,
  type QloAppsOutboundAvailabilityMessage,
  type QloAppsOutboundRateMessage,
  type QloAppsOutboundMessage,
} from './rabbitmq_topology.js';

export {
  QloAppsBaseConsumer,
  type QloAppsMessageContext,
  type QloAppsConsumerOptions,
} from './rabbitmq_consumer_base.js';

export {
  qloAppsPublisher,
  queueQloAppsInboundSync,
  queueQloAppsReservationSync,
  queueQloAppsAvailabilitySync,
  queueQloAppsRateSync,
} from './rabbitmq_publisher.js';
