import db from '../../../config/database.js';
import type { Knex } from 'knex';

/**
 * Channel Event Repository
 * Handles CRUD operations for channel_events table
 */

export interface ChannelEvent {
  id: string;
  property_id: string;
  direction: 'inbound' | 'outbound';
  source: string;
  event_type: string;
  entity_type: string;
  entity_external_id: string | null;
  entity_internal_id: string | null;
  idempotency_key: string;
  payload: any;
  status: 'received' | 'processing' | 'done' | 'failed';
  attempts: number;
  max_attempts: number;
  last_error: string | null;
  received_at: Date;
  processed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface CreateChannelEventInput {
  property_id?: string;
  direction: 'inbound' | 'outbound';
  source: string;
  event_type: string;
  entity_type: string;
  entity_external_id?: string | null;
  entity_internal_id?: string | null;
  idempotency_key: string;
  payload: any;
  max_attempts?: number;
}

export interface UpdateChannelEventStatusInput {
  status: 'received' | 'processing' | 'done' | 'failed';
  error?: string | null;
  processed_at?: Date | null;
}

export interface FailedEventFilters {
  property_id?: string;
  direction?: 'inbound' | 'outbound';
  entity_type?: string;
  status?: string; // Filter by status (default: 'failed')
  limit?: number;
  offset?: number;
}

const DEFAULT_PROPERTY_ID = '00000000-0000-0000-0000-000000000001';
const DEFAULT_MAX_ATTEMPTS = 3;

/**
 * Create a new channel event
 */
export async function createChannelEvent(
  input: CreateChannelEventInput
): Promise<ChannelEvent> {
  const propertyId = input.property_id || DEFAULT_PROPERTY_ID;
  const maxAttempts = input.max_attempts || DEFAULT_MAX_ATTEMPTS;

  const [event] = await db('channel_events')
    .insert({
      property_id: propertyId,
      direction: input.direction,
      source: input.source,
      event_type: input.event_type,
      entity_type: input.entity_type,
      entity_external_id: input.entity_external_id || null,
      entity_internal_id: input.entity_internal_id || null,
      idempotency_key: input.idempotency_key,
      payload: JSON.stringify(input.payload),
      status: 'received',
      attempts: 0,
      max_attempts: maxAttempts,
      last_error: null,
      processed_at: null,
    })
    .returning('*');

  return {
    ...event,
    payload: typeof event.payload === 'string' ? JSON.parse(event.payload) : event.payload,
  };
}

/**
 * Find channel event by idempotency key
 */
export async function findChannelEventByIdempotencyKey(
  idempotencyKey: string
): Promise<ChannelEvent | null> {
  const event = await db('channel_events')
    .where({ idempotency_key: idempotencyKey })
    .first();

  if (!event) {
    return null;
  }

  return {
    ...event,
    payload: typeof event.payload === 'string' ? JSON.parse(event.payload) : event.payload,
  };
}

/**
 * Find channel event by external ID
 */
export async function findChannelEventsByExternalId(
  externalId: string,
  entityType?: string
): Promise<ChannelEvent[]> {
  let query = db('channel_events').where({ entity_external_id: externalId });

  if (entityType) {
    query = query.where({ entity_type: entityType });
  }

  const events = await query.orderBy('received_at', 'desc');

  return events.map((event) => ({
    ...event,
    payload: typeof event.payload === 'string' ? JSON.parse(event.payload) : event.payload,
  }));
}

/**
 * Find channel event by internal ID
 */
export async function findChannelEventsByInternalId(
  internalId: string,
  entityType?: string
): Promise<ChannelEvent[]> {
  let query = db('channel_events').where({ entity_internal_id: internalId });

  if (entityType) {
    query = query.where({ entity_type: entityType });
  }

  const events = await query.orderBy('received_at', 'desc');

  return events.map((event) => ({
    ...event,
    payload: typeof event.payload === 'string' ? JSON.parse(event.payload) : event.payload,
  }));
}

/**
 * Update channel event status
 */
export async function updateChannelEventStatus(
  id: string,
  update: UpdateChannelEventStatusInput
): Promise<ChannelEvent | null> {
  const updateData: any = {
    status: update.status,
    updated_at: new Date(),
  };

  if (update.error !== undefined) {
    updateData.last_error = update.error;
  }

  if (update.processed_at !== undefined) {
    updateData.processed_at = update.processed_at;
  }

  const [event] = await db('channel_events')
    .where({ id })
    .update(updateData)
    .returning('*');

  if (!event) {
    return null;
  }

  return {
    ...event,
    payload: typeof event.payload === 'string' ? JSON.parse(event.payload) : event.payload,
  };
}

/**
 * Increment event attempts counter
 */
export async function incrementChannelEventAttempts(
  id: string
): Promise<ChannelEvent | null> {
  const [event] = await db('channel_events')
    .where({ id })
    .increment('attempts', 1)
    .update({ updated_at: new Date() })
    .returning('*');

  if (!event) {
    return null;
  }

  return {
    ...event,
    payload: typeof event.payload === 'string' ? JSON.parse(event.payload) : event.payload,
  };
}

/**
 * Mark event as processed (status: done)
 */
export async function markChannelEventProcessed(
  id: string
): Promise<ChannelEvent | null> {
  return updateChannelEventStatus(id, {
    status: 'done',
    processed_at: new Date(),
  });
}

/**
 * Mark event as failed
 */
export async function markChannelEventFailed(
  id: string,
  error: string
): Promise<ChannelEvent | null> {
  return updateChannelEventStatus(id, {
    status: 'failed',
    error,
  });
}

/**
 * Get failed events (for DLQ listing)
 */
export async function getFailedChannelEvents(
  filters: FailedEventFilters = {}
): Promise<{ events: ChannelEvent[]; total: number }> {
  const status = filters.status || 'failed';
  let query = db('channel_events').where({ status });
  let countQuery = db('channel_events').where({ status });

  if (filters.property_id) {
    query = query.where({ property_id: filters.property_id });
    countQuery = countQuery.where({ property_id: filters.property_id });
  }

  if (filters.direction) {
    query = query.where({ direction: filters.direction });
    countQuery = countQuery.where({ direction: filters.direction });
  }

  if (filters.entity_type) {
    query = query.where({ entity_type: filters.entity_type });
    countQuery = countQuery.where({ entity_type: filters.entity_type });
  }

  // Get total count
  const countResult = await countQuery.count('* as count').first();
  const total = countResult?.count ? parseInt(String(countResult.count), 10) : 0;

  // Apply pagination
  if (filters.limit) {
    query = query.limit(filters.limit);
  }
  if (filters.offset) {
    query = query.offset(filters.offset);
  }

  // Order by received_at desc (most recent first)
  query = query.orderBy('received_at', 'desc');

  const events = await query;

  return {
    events: events.map((event) => ({
      ...event,
      payload: typeof event.payload === 'string' ? JSON.parse(event.payload) : event.payload,
    })),
    total,
  };
}

/**
 * Get channel event by ID
 */
export async function getChannelEventById(id: string): Promise<ChannelEvent | null> {
  const event = await db('channel_events').where({ id }).first();

  if (!event) {
    return null;
  }

  return {
    ...event,
    payload: typeof event.payload === 'string' ? JSON.parse(event.payload) : event.payload,
  };
}

/**
 * Reset event for retry (set status to received, reset attempts)
 */
export async function resetChannelEventForRetry(id: string): Promise<ChannelEvent | null> {
  const [event] = await db('channel_events')
    .where({ id })
    .update({
      status: 'received',
      attempts: 0,
      last_error: null,
      updated_at: new Date(),
    })
    .returning('*');

  if (!event) {
    return null;
  }

  return {
    ...event,
    payload: typeof event.payload === 'string' ? JSON.parse(event.payload) : event.payload,
  };
}

