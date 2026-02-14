import type { Request } from 'express';
import db from '../../config/database.js';
import type { CreateAuditLogRequest } from './audit_types.js';

// Default hotel ID for single-hotel installations (Phase 1)
// TODO: In Phase 2, this will be replaced by hotelContext middleware
const DEFAULT_HOTEL_ID = '00000000-0000-0000-0000-000000000000';

/**
 * Create an audit log entry
 */
export async function createAuditLog(
  logData: CreateAuditLogRequest,
): Promise<void> {
  try {
    await db('audit_logs').insert({
      user_id: logData.user_id || null,
      hotel_id: logData.hotel_id || DEFAULT_HOTEL_ID,
      action: logData.action,
      entity_type: logData.entity_type,
      entity_id: logData.entity_id,
      before_state: logData.before_state ? JSON.stringify(logData.before_state) : null,
      after_state: logData.after_state ? JSON.stringify(logData.after_state) : null,
      ip_address: logData.ip_address || null,
      user_agent: logData.user_agent || null,
    });
  } catch (error) {
    // Don't throw - audit logging should never break the main flow
    console.error('Failed to create audit log:', error);
  }
}

/**
 * Extract request metadata for audit logging
 */
export function getRequestMetadata(req: Request): {
  ip_address: string | null;
  user_agent: string | null;
} {
  const ip_address =
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    (req.headers['x-real-ip'] as string) ||
    req.socket.remoteAddress ||
    null;

  const user_agent = (req.headers['user-agent'] as string) || null;

  return { ip_address, user_agent };
}

/**
 * Helper to log CREATE actions
 */
export async function logCreate(
  req: Request,
  entityType: string,
  entityId: string,
  afterState: Record<string, any>,
): Promise<void> {
  const userId = (req as any).user?.userId || null;
  const hotelId = (req as any).hotelId || DEFAULT_HOTEL_ID;
  const { ip_address, user_agent } = getRequestMetadata(req);

  await createAuditLog({
    user_id: userId,
    hotel_id: hotelId,
    action: `CREATE_${entityType.toUpperCase()}`,
    entity_type: entityType,
    entity_id: entityId,
    after_state: afterState,
    ip_address,
    user_agent,
  });
}

/**
 * Helper to log UPDATE actions
 */
export async function logUpdate(
  req: Request,
  entityType: string,
  entityId: string,
  beforeState: Record<string, any>,
  afterState: Record<string, any>,
): Promise<void> {
  const userId = (req as any).user?.userId || null;
  const hotelId = (req as any).hotelId || DEFAULT_HOTEL_ID;
  const { ip_address, user_agent } = getRequestMetadata(req);

  await createAuditLog({
    user_id: userId,
    hotel_id: hotelId,
    action: `UPDATE_${entityType.toUpperCase()}`,
    entity_type: entityType,
    entity_id: entityId,
    before_state: beforeState,
    after_state: afterState,
    ip_address,
    user_agent,
  });
}

/**
 * Helper to log DELETE actions
 */
export async function logDelete(
  req: Request,
  entityType: string,
  entityId: string,
  beforeState: Record<string, any>,
): Promise<void> {
  const userId = (req as any).user?.userId || null;
  const hotelId = (req as any).hotelId || DEFAULT_HOTEL_ID;
  const { ip_address, user_agent } = getRequestMetadata(req);

  await createAuditLog({
    user_id: userId,
    hotel_id: hotelId,
    action: `DELETE_${entityType.toUpperCase()}`,
    entity_type: entityType,
    entity_id: entityId,
    before_state: beforeState,
    ip_address,
    user_agent,
  });
}

/**
 * Helper to log custom actions
 */
export async function logAction(
  req: Request,
  action: string,
  entityType: string,
  entityId: string,
  details?: Record<string, any>,
): Promise<void> {
  const userId = (req as any).user?.userId || null;
  const hotelId = (req as any).hotelId || DEFAULT_HOTEL_ID;
  const { ip_address, user_agent } = getRequestMetadata(req);

  await createAuditLog({
    user_id: userId,
    hotel_id: hotelId,
    action,
    entity_type: entityType,
    entity_id: entityId,
    after_state: details || null,
    ip_address,
    user_agent,
  });
}

