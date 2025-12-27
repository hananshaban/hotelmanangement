import type { Request, Response, NextFunction } from 'express';
import db from '../../config/database.js';
import type { GetAuditLogsQuery, AuditLogResponse } from './audit_types.js';

/**
 * Transform database audit log to API response format
 */
function transformAuditLog(log: any): AuditLogResponse {
  // Combine before_state and after_state into details for frontend compatibility
  const details: Record<string, any> = {};
  if (log.before_state) {
    details.before = typeof log.before_state === 'string' 
      ? JSON.parse(log.before_state) 
      : log.before_state;
  }
  if (log.after_state) {
    details.after = typeof log.after_state === 'string'
      ? JSON.parse(log.after_state)
      : log.after_state;
  }

  const result: AuditLogResponse = {
    id: log.id,
    userId: log.user_id,
    action: log.action,
    entityType: log.entity_type,
    entityId: log.entity_id,
    beforeState: log.before_state 
      ? (typeof log.before_state === 'string' ? JSON.parse(log.before_state) : log.before_state)
      : null,
    afterState: log.after_state
      ? (typeof log.after_state === 'string' ? JSON.parse(log.after_state) : log.after_state)
      : null,
    ipAddress: log.ip_address,
    userAgent: log.user_agent,
    timestamp: log.created_at,
  };
  
  if (Object.keys(details).length > 0) {
    result.details = details;
  }
  
  return result;
}

export async function getAuditLogsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const query = req.query as unknown as GetAuditLogsQuery;
    
    let queryBuilder = db('audit_logs').select('*');

    // Apply filters
    if (query.action) {
      queryBuilder = queryBuilder.where('action', query.action);
    }

    if (query.entity_type) {
      queryBuilder = queryBuilder.where('entity_type', query.entity_type);
    }

    if (query.entity_id) {
      queryBuilder = queryBuilder.where('entity_id', query.entity_id);
    }

    if (query.user_id) {
      queryBuilder = queryBuilder.where('user_id', query.user_id);
    }

    // Date range filter
    if (query.start_date) {
      queryBuilder = queryBuilder.where('created_at', '>=', query.start_date);
    }

    if (query.end_date) {
      queryBuilder = queryBuilder.where('created_at', '<=', query.end_date);
    }

    // Search filter (searches in action, entity_type, entity_id)
    if (query.search) {
      const searchTerm = `%${query.search}%`;
      queryBuilder = queryBuilder.where((builder) => {
        builder
          .where('action', 'ilike', searchTerm)
          .orWhere('entity_type', 'ilike', searchTerm)
          .orWhereRaw('CAST(entity_id AS TEXT) ILIKE ?', [searchTerm]);
      });
    }

    // Get total count before pagination
    // Build a separate count query with the same filters
    let countQuery = db('audit_logs');
    
    if (query.action) {
      countQuery = countQuery.where('action', query.action);
    }
    if (query.entity_type) {
      countQuery = countQuery.where('entity_type', query.entity_type);
    }
    if (query.entity_id) {
      countQuery = countQuery.where('entity_id', query.entity_id);
    }
    if (query.user_id) {
      countQuery = countQuery.where('user_id', query.user_id);
    }
    if (query.start_date) {
      countQuery = countQuery.where('created_at', '>=', query.start_date);
    }
    if (query.end_date) {
      countQuery = countQuery.where('created_at', '<=', query.end_date);
    }
    if (query.search) {
      const searchTerm = `%${query.search}%`;
      countQuery = countQuery.where((builder) => {
        builder
          .where('action', 'ilike', searchTerm)
          .orWhere('entity_type', 'ilike', searchTerm)
          .orWhereRaw('CAST(entity_id AS TEXT) ILIKE ?', [searchTerm]);
      });
    }
    
    const countResult = await countQuery.count('* as count').first();
    const total = Number(countResult?.count || 0);

    // Apply sorting
    const sortBy = query.sort_by || 'created_at';
    const sortOrder = query.sort_order || 'desc';
    queryBuilder = queryBuilder.orderBy(sortBy, sortOrder);

    // Apply pagination
    const limit = query.limit ? Math.min(Number(query.limit), 1000) : 100; // Max 1000
    const offset = query.offset ? Number(query.offset) : 0;
    queryBuilder = queryBuilder.limit(limit).offset(offset);

    const logs = await queryBuilder;

    const transformedLogs: AuditLogResponse[] = logs.map(transformAuditLog);

    res.json({
      logs: transformedLogs,
      total,
      limit,
      offset,
    });
  } catch (error) {
    next(error);
  }
}

export async function getAuditLogHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const { id } = req.params;

    const log = await db('audit_logs').where({ id }).first();

    if (!log) {
      res.status(404).json({
        error: 'Audit log not found',
      });
      return;
    }

    res.json({
      log: transformAuditLog(log),
    });
  } catch (error) {
    next(error);
  }
}

