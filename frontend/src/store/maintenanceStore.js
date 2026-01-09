import { create } from 'zustand';
import { api } from '../utils/api';

const useMaintenanceStore = create((set, get) => ({
  maintenanceRequests: [],
  loading: false,
  error: null,

  // Fetch all maintenance requests
  fetchMaintenanceRequests: async (filters = {}) => {
    set({ loading: true, error: null });
    try {
      const data = await api.maintenance.getAll(filters);
      
      // Transform API response to match frontend format
      const transformed = data.map((request) => ({
        id: request.id,
        roomId: request.room_id,
        roomNumber: request.room_number,
        title: request.title,
        description: request.description,
        priority: request.priority,
        status: request.status,
        assignedTo: request.assigned_to,
        assignedToName: request.assigned_to_name || '',
        completedAt: request.completed_at,
        createdAt: request.created_at,
        updatedAt: request.updated_at,
      }));

      set({ maintenanceRequests: transformed, loading: false });
      return transformed;
    } catch (error) {
      set({ error: error.message || 'Failed to fetch maintenance requests', loading: false });
      throw error;
    }
  },

  // Fetch single maintenance request
  fetchMaintenanceRequest: async (id) => {
    set({ loading: true, error: null });
    try {
      const data = await api.maintenance.getById(id);
      
      // Transform API response
      const transformed = {
        id: data.id,
        roomId: data.room_id,
        roomNumber: data.room_number,
        title: data.title,
        description: data.description,
        priority: data.priority,
        status: data.status,
        assignedTo: data.assigned_to,
        assignedToName: data.assigned_to_name || '',
        completedAt: data.completed_at,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      };

      // Update in list if exists
      set((state) => ({
        maintenanceRequests: state.maintenanceRequests.map((req) =>
          req.id === id ? transformed : req
        ),
        loading: false,
      }));

      return transformed;
    } catch (error) {
      set({ error: error.message || 'Failed to fetch maintenance request', loading: false });
      throw error;
    }
  },

  // Create maintenance request
  createMaintenanceRequest: async (requestData) => {
    set({ loading: true, error: null });
    try {
      const payload = {
        room_id: requestData.roomId || requestData.room_id,
        title: requestData.title,
        description: requestData.description,
        priority: requestData.priority || 'Medium',
        status: requestData.status || 'Open',
        assigned_to: requestData.assignedTo || requestData.assigned_to || undefined,
      };

      const data = await api.maintenance.create(payload);

      // Transform API response
      const transformed = {
        id: data.id,
        roomId: data.room_id,
        roomNumber: data.room_number,
        title: data.title,
        description: data.description,
        priority: data.priority,
        status: data.status,
        assignedTo: data.assigned_to,
        assignedToName: data.assigned_to_name || '',
        completedAt: data.completed_at,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      };

      set((state) => ({
        maintenanceRequests: [transformed, ...state.maintenanceRequests],
        loading: false,
      }));

      return transformed;
    } catch (error) {
      set({ error: error.message || 'Failed to create maintenance request', loading: false });
      throw error;
    }
  },

  // Update maintenance request
  updateMaintenanceRequest: async (id, updates) => {
    set({ loading: true, error: null });
    try {
      const payload = {};
      if (updates.roomId !== undefined || updates.room_id !== undefined) {
        payload.room_id = updates.roomId || updates.room_id;
      }
      if (updates.title !== undefined) payload.title = updates.title;
      if (updates.description !== undefined) payload.description = updates.description;
      if (updates.priority !== undefined) payload.priority = updates.priority;
      if (updates.status !== undefined) payload.status = updates.status;
      if (updates.assignedTo !== undefined || updates.assigned_to !== undefined) {
        payload.assigned_to = updates.assignedTo || updates.assigned_to || null;
      }

      const data = await api.maintenance.update(id, payload);

      // Transform API response
      const transformed = {
        id: data.id,
        roomId: data.room_id,
        roomNumber: data.room_number,
        title: data.title,
        description: data.description,
        priority: data.priority,
        status: data.status,
        assignedTo: data.assigned_to,
        assignedToName: data.assigned_to_name || '',
        completedAt: data.completed_at,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      };

      set((state) => ({
        maintenanceRequests: state.maintenanceRequests.map((req) =>
          req.id === id ? transformed : req
        ),
        loading: false,
      }));

      return transformed;
    } catch (error) {
      set({ error: error.message || 'Failed to update maintenance request', loading: false });
      throw error;
    }
  },

  // Delete maintenance request
  deleteMaintenanceRequest: async (id) => {
    set({ loading: true, error: null });
    try {
      await api.maintenance.delete(id);

      set((state) => ({
        maintenanceRequests: state.maintenanceRequests.filter((req) => req.id !== id),
        loading: false,
      }));
    } catch (error) {
      set({ error: error.message || 'Failed to delete maintenance request', loading: false });
      throw error;
    }
  },
}));

export default useMaintenanceStore;



