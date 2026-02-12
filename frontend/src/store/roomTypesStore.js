import { create } from 'zustand';
import { api } from '../utils/api.js';

const useRoomTypesStore = create((set, get) => ({
  roomTypes: [],
  isLoading: false,
  error: null,

  // Helper function to transform backend format (snake_case) to frontend format (camelCase)
  transformRoomType: (rt) => ({
    id: rt.id,
    name: rt.name,
    roomType: rt.room_type, // snake_case -> camelCase
    qty: rt.qty,
    pricePerNight: parseFloat(rt.price_per_night || 0),
    minPrice: rt.min_price,
    maxPrice: rt.max_price,
    rackRate: rt.rack_rate,
    cleaningFee: rt.cleaning_fee,
    securityDeposit: rt.security_deposit,
    maxPeople: rt.max_people,
    maxAdult: rt.max_adult,
    maxChildren: rt.max_children,
    minStay: rt.min_stay,
    maxStay: rt.max_stay,
    taxPercentage: rt.tax_percentage,
    taxPerPerson: rt.tax_per_person,
    roomSize: rt.room_size,
    floor: rt.floor,
    highlightColor: rt.highlight_color,
    sellPriority: rt.sell_priority,
    includeReports: rt.include_reports,
    restrictionStrategy: rt.restriction_strategy,
    overbookingProtection: rt.overbooking_protection,
    blockAfterCheckoutDays: rt.block_after_checkout_days,
    controlPriority: rt.control_priority,
    unitAllocation: rt.unit_allocation || 'perBooking',
    features: Array.isArray(rt.features) ? rt.features : [],
    description: rt.description,
    units: Array.isArray(rt.units) ? rt.units : [],
    cmRoomId: rt.cm_room_id,
    createdAt: rt.created_at,
    updatedAt: rt.updated_at,
  }),

  // Fetch all room types
  fetchRoomTypes: async (filters = {}) => {
    set({ isLoading: true, error: null });
    try {
      const roomTypes = await api.roomTypes.getAll(filters);
      // Transform backend format (snake_case) to frontend format (camelCase)
      const transformed = roomTypes.map((rt) => get().transformRoomType(rt));
      set({ roomTypes: transformed, isLoading: false });
      return transformed;
    } catch (error) {
      console.error('Failed to fetch room types:', error);
      set({ 
        isLoading: false, 
        error: error.message || 'Failed to fetch room types',
        roomTypes: [] // Ensure empty array on error
      });
      throw error;
    }
  },

  // Get single room type
  getRoomType: async (id) => {
    try {
      const roomType = await api.roomTypes.getById(id);
      // Transform backend format to frontend format
      const transformed = get().transformRoomType(roomType);
      return transformed;
    } catch (error) {
      console.error('Failed to fetch room type:', error);
      set({ error: error.message || 'Failed to fetch room type' });
      throw error;
    }
  },

  // Add room type
  addRoomType: async (roomTypeData) => {
    set({ isLoading: true, error: null });
    try {
      const newRoomType = await api.roomTypes.create(roomTypeData);
      // Transform backend format to frontend format
      const transformed = get().transformRoomType(newRoomType);
      set((state) => ({
        roomTypes: [...state.roomTypes, transformed],
        isLoading: false,
      }));
      return transformed;
    } catch (error) {
      console.error('Failed to create room type:', error);
      set({ isLoading: false, error: error.message || 'Failed to create room type' });
      throw error;
    }
  },

  // Update room type
  updateRoomType: async (id, roomTypeData) => {
    set({ isLoading: true, error: null });
    try {
      const updatedRoomType = await api.roomTypes.update(id, roomTypeData);
      // Transform backend format to frontend format
      const transformed = get().transformRoomType(updatedRoomType);
      set((state) => ({
        roomTypes: state.roomTypes.map((rt) =>
          rt.id === id ? transformed : rt
        ),
        isLoading: false,
      }));
      return transformed;
    } catch (error) {
      console.error('Failed to update room type:', error);
      set({ isLoading: false, error: error.message || 'Failed to update room type' });
      throw error;
    }
  },

  // Delete room type
  deleteRoomType: async (id) => {
    set({ isLoading: true, error: null });
    try {
      await api.roomTypes.delete(id);
      set((state) => ({
        roomTypes: state.roomTypes.filter((rt) => rt.id !== id),
        isLoading: false,
      }));
    } catch (error) {
      set({ isLoading: false, error: error.message || 'Failed to delete room type' });
      throw error;
    }
  },

  // Get availability for room type
  getAvailability: async (id, startDate, endDate) => {
    try {
      const availability = await api.roomTypes.getAvailability(id, startDate, endDate);
      return availability;
    } catch (error) {
      console.error('Failed to fetch availability:', error);
      set({ error: error.message || 'Failed to fetch availability' });
      throw error;
    }
  },

  // Get available room types for date range
  getAvailableRoomTypes: async (checkIn, checkOut, filters = {}) => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.roomTypes.getAvailable(checkIn, checkOut, filters);
      // Backend returns { check_in, check_out, room_types: [...] }
      // Extract the room_types array
      const available = response.room_types || [];
      set({ isLoading: false });
      return available;
    } catch (error) {
      console.error('Failed to fetch available room types:', error);
      set({ isLoading: false, error: error.message || 'Failed to fetch available room types' });
      throw error;
    }
  },

  // Initialize: fetch all room types
  initialize: async () => {
    await get().fetchRoomTypes();
  },
}));

export default useRoomTypesStore;

