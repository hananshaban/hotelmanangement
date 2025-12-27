import type { Request, Response, NextFunction } from 'express';
import {
  getFailedChannelEvents,
  getChannelEventById,
  resetChannelEventForRetry,
  type FailedEventFilters,
} from '../../integrations/beds24/repositories/channel_event_repository.js';
import { publishInbound, publishOutbound } from '../../integrations/beds24/queue/rabbitmq_publisher.js';

/**
 * Get channel events (DLQ listing)
 * GET /admin/events?status=failed&direction=outbound&limit=50&offset=0
 */
export async function getChannelEventsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const {
      status = 'failed',
      direction,
      entity_type,
      property_id,
      limit = 50,
      offset = 0,
    } = req.query;

    // Parse pagination
    const limitNum = parseInt(limit as string, 10);
    const offsetNum = parseInt(offset as string, 10);

    // Validate limit
    if (limitNum > 100) {
      res.status(400).json({
        error: 'Limit cannot exceed 100',
      });
      return;
    }

    // Get failed events
    const filters: FailedEventFilters = {
      limit: limitNum,
      offset: offsetNum,
    };
    if (property_id) {
      filters.property_id = property_id as string;
    }
    if (direction) {
      filters.direction = direction as 'inbound' | 'outbound';
    }
    if (entity_type) {
      filters.entity_type = entity_type as string;
    }
    const result = await getFailedChannelEvents(filters);

    res.json({
      events: result.events.map((event) => ({
        id: event.id,
        direction: event.direction,
        event_type: event.event_type,
        entity_type: event.entity_type,
        entity_external_id: event.entity_external_id,
        entity_internal_id: event.entity_internal_id,
        status: event.status,
        attempts: event.attempts,
        max_attempts: event.max_attempts,
        last_error: event.last_error,
        received_at: event.received_at,
        processed_at: event.processed_at,
      })),
      pagination: {
        total: result.total,
        limit: limitNum,
        offset: offsetNum,
        totalPages: Math.ceil(result.total / limitNum),
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get single channel event by ID
 * GET /admin/events/:id
 */
export async function getChannelEventHandler(
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = req.params;

    const event = await getChannelEventById(id);

    if (!event) {
      res.status(404).json({
        error: 'Event not found',
      });
      return;
    }

    res.json({
      id: event.id,
      property_id: event.property_id,
      direction: event.direction,
      source: event.source,
      event_type: event.event_type,
      entity_type: event.entity_type,
      entity_external_id: event.entity_external_id,
      entity_internal_id: event.entity_internal_id,
      idempotency_key: event.idempotency_key,
      payload: event.payload,
      status: event.status,
      attempts: event.attempts,
      max_attempts: event.max_attempts,
      last_error: event.last_error,
      received_at: event.received_at,
      processed_at: event.processed_at,
      created_at: event.created_at,
      updated_at: event.updated_at,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Retry failed event
 * POST /admin/events/:id/retry
 */
export async function retryChannelEventHandler(
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = req.params;

    // Get event
    const event = await getChannelEventById(id);
    if (!event) {
      res.status(404).json({
        error: 'Event not found',
      });
      return;
    }

    // Only retry failed events
    if (event.status !== 'failed') {
      res.status(400).json({
        error: `Event is not in failed status. Current status: ${event.status}`,
      });
      return;
    }

    // Reset event for retry
    const resetEvent = await resetChannelEventForRetry(id);
    if (!resetEvent) {
      res.status(500).json({
        error: 'Failed to reset event',
      });
      return;
    }

    // Republish to appropriate queue based on direction
    if (event.direction === 'inbound') {
      // Republish to inbound queue
      await publishInbound(
        event.event_type,
        {
          channelEventId: event.id,
          ...event.payload,
        },
        {
          messageId: event.id,
          priority: 10,
        }
      );
    } else {
      // Republish to outbound queue
      await publishOutbound(
        event.event_type,
        {
          channelEventId: event.id,
          ...event.payload,
        },
        {
          messageId: event.id,
          priority: 10,
        }
      );
    }

    res.json({
      success: true,
      message: 'Event queued for retry',
      event: {
        id: resetEvent.id,
        status: resetEvent.status,
        attempts: resetEvent.attempts,
      },
    });
  } catch (error) {
    next(error);
  }
}

