/**
 * Channel Manager Integration
 *
 * Main exports for the channel manager strategy pattern.
 */

export { channelManagerService } from './channel_manager_service.js';
export type {
  ChannelManagerName,
  ChannelManagerConfig,
  ChannelManagerStatus,
  SyncReservationInput,
  SyncAvailabilityInput,
  SyncRatesInput,
  SyncResult,
  ConnectionTestResult,
  IChannelManagerStrategy,
} from './types.js';
