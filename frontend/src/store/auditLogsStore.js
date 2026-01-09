import { create } from 'zustand';
import { api } from '../utils/api';

const useAuditLogsStore = create((set, get) => ({
  auditLogs: [],
  loading: false,
  error: null,
  total: 0,

  // Fetch audit logs with optional filters
  fetchAuditLogs: async (filters = {}) => {
    set({ loading: true, error: null });
    try {
      const params = {};
      
      if (filters.action) params.action = filters.action;
      if (filters.entityType) params.entity_type = filters.entityType;
      if (filters.entityId) params.entity_id = filters.entityId;
      if (filters.userId) params.user_id = filters.userId;
      if (filters.search) params.search = filters.search;
      if (filters.startDate) params.start_date = filters.startDate;
      if (filters.endDate) params.end_date = filters.endDate;
      if (filters.sortBy) params.sort_by = filters.sortBy;
      if (filters.sortOrder) params.sort_order = filters.sortOrder;
      if (filters.limit) params.limit = filters.limit;
      if (filters.offset) params.offset = filters.offset;

      const response = await api.auditLogs.getAll(params);
      
      // Transform API response to match frontend format
      const transformed = response.logs.map((log) => ({
        id: log.id,
        action: log.action,
        entityType: log.entityType,
        entityId: log.entityId,
        entityName: log.entityName,
        userId: log.userId,
        userName: log.userName,
        timestamp: log.timestamp,
        details: log.details || (log.afterState ? { after: log.afterState } : {}),
      }));

      set({ 
        auditLogs: transformed, 
        total: response.total || transformed.length,
        loading: false 
      });
      return transformed;
    } catch (error) {
      console.error('Failed to fetch audit logs:', error);
      set({ 
        error: error.message || 'Failed to fetch audit logs', 
        loading: false 
      });
      throw error;
    }
  },

  // Fetch single audit log
  fetchAuditLog: async (id) => {
    set({ loading: true, error: null });
    try {
      const response = await api.auditLogs.getById(id);
      
      const log = response.log;
      const transformed = {
        id: log.id,
        action: log.action,
        entityType: log.entityType,
        entityId: log.entityId,
        userId: log.userId,
        timestamp: log.timestamp,
        details: log.details || (log.afterState ? { after: log.afterState } : {}),
      };

      set({ loading: false });
      return transformed;
    } catch (error) {
      console.error('Failed to fetch audit log:', error);
      set({ 
        error: error.message || 'Failed to fetch audit log', 
        loading: false 
      });
      throw error;
    }
  },
}));

export default useAuditLogsStore;



