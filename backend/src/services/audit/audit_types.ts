export interface AuditLog {
  id: string;
  user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string;
  before_state: Record<string, any> | null;
  after_state: Record<string, any> | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

export interface CreateAuditLogRequest {
  user_id?: string | null;
  action: string;
  entity_type: string;
  entity_id: string;
  before_state?: Record<string, any> | null;
  after_state?: Record<string, any> | null;
  ip_address?: string | null;
  user_agent?: string | null;
}

export interface AuditLogResponse {
  id: string;
  userId: string | null;
  userName: string | null;
  action: string;
  entityType: string;
  entityId: string;
  entityName: string | null;
  beforeState: Record<string, any> | null;
  afterState: Record<string, any> | null;
  ipAddress: string | null;
  userAgent: string | null;
  timestamp: string;
  details?: Record<string, any>; // Computed field combining before/after states
}

export interface GetAuditLogsQuery {
  action?: string;
  entity_type?: string;
  entity_id?: string;
  user_id?: string;
  search?: string;
  start_date?: string;
  end_date?: string;
  limit?: number;
  offset?: number;
  sort_by?: 'created_at' | 'action' | 'entity_type' | 'entity_id';
  sort_order?: 'asc' | 'desc';
}

