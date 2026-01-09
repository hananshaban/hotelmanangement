const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

// Token refresh state management
let isRefreshing = false;
let refreshPromise = null;
const requestQueue = [];

// Process queued requests after token refresh
function processQueue(error = null) {
  requestQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve();
    }
  });
  requestQueue.length = 0;
}

// Refresh token function
async function refreshAccessToken() {
  const refreshToken = localStorage.getItem('refreshToken');
  
  if (!refreshToken) {
    throw new ApiError('No refresh token available', 401, null);
  }

  try {
    const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ refreshToken }),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      // Refresh token is invalid, clear auth
      localStorage.removeItem('token');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('user');
      throw new ApiError(
        data.error || 'Failed to refresh token',
        response.status,
        data
      );
    }

    // Update tokens
    localStorage.setItem('token', data.token);
    if (data.refreshToken) {
      localStorage.setItem('refreshToken', data.refreshToken);
    }

    return data.token;
  } catch (error) {
    // Clear auth on refresh failure
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    throw error;
  }
}

async function request(endpoint, options = {}) {
  // Skip auth for auth endpoints
  const isAuthEndpoint = endpoint.startsWith('/auth/login') || 
                         endpoint.startsWith('/auth/register') || 
                         endpoint.startsWith('/auth/refresh');

  const url = `${API_BASE_URL}${endpoint}`;
  let token = localStorage.getItem('token');

  // If we're refreshing and this is not an auth endpoint, queue the request
  if (isRefreshing && !isAuthEndpoint) {
    return new Promise((resolve, reject) => {
      requestQueue.push({ resolve, reject });
    }).then(() => request(endpoint, options));
  }

  const config = {
    headers: {
      'Content-Type': 'application/json',
      ...(token && !isAuthEndpoint && { Authorization: `Bearer ${token}` }),
      ...options.headers,
    },
    ...options,
  };

  if (config.body && typeof config.body === 'object') {
    config.body = JSON.stringify(config.body);
  }

  try {
    const response = await fetch(url, config);
    const data = await response.json().catch(() => ({}));

    // Handle 401 errors with automatic token refresh
    if (response.status === 401 && !isAuthEndpoint) {
      const errorCode = data.code || '';
      
      // Only attempt refresh for token expiration, not for invalid tokens
      if (errorCode === 'TOKEN_EXPIRED' || data.error?.toLowerCase().includes('expired')) {
        // If we're already refreshing, wait for it
        if (isRefreshing) {
          return new Promise((resolve, reject) => {
            requestQueue.push({ resolve, reject });
          }).then(() => request(endpoint, options));
        }

        // Start refresh process
        isRefreshing = true;
        refreshPromise = refreshAccessToken()
          .then((newToken) => {
            isRefreshing = false;
            refreshPromise = null;
            processQueue();
            return newToken;
          })
          .catch((error) => {
            isRefreshing = false;
            refreshPromise = null;
            processQueue(error);
            throw error;
          });

        // Wait for refresh and retry request
        try {
          await refreshPromise;
          // Retry the original request with new token
          return request(endpoint, options);
        } catch (refreshError) {
          throw refreshError;
        }
      }
    }

    if (!response.ok) {
      throw new ApiError(
        data.error || `HTTP error! status: ${response.status}`,
        response.status,
        data
      );
    }

    return data;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(error.message || 'Network error', 0, null);
  }
}

export const api = {
  // Auth endpoints
  auth: {
    login: (email, password) =>
      request('/auth/login', {
        method: 'POST',
        body: { email, password },
      }),

    register: (userData) =>
      request('/auth/register', {
        method: 'POST',
        body: userData,
      }),

    refreshToken: (refreshToken) =>
      request('/auth/refresh', {
        method: 'POST',
        body: { refreshToken },
      }),

    me: () => request('/auth/me'),
  },

  // Rooms endpoints (legacy - for backward compatibility)
  rooms: {
    getAll: (params = {}) => {
      const queryString = new URLSearchParams(params).toString();
      return request(`/v1/rooms${queryString ? `?${queryString}` : ''}`);
    },

    getById: (id) => request(`/v1/rooms/${id}`),

    create: (roomData) =>
      request('/v1/rooms', {
        method: 'POST',
        body: roomData,
      }),

    update: (id, roomData) =>
      request(`/v1/rooms/${id}`, {
        method: 'PUT',
        body: roomData,
      }),

    delete: (id) =>
      request(`/v1/rooms/${id}`, {
        method: 'DELETE',
      }),

    getHousekeeping: (id) => request(`/v1/rooms/${id}/housekeeping`),

    updateHousekeeping: (id, housekeepingData) =>
      request(`/v1/rooms/${id}/housekeeping`, {
        method: 'PUT',
        body: housekeepingData,
      }),

    getAllHousekeeping: (params = {}) => {
      const queryString = new URLSearchParams(params).toString();
      return request(`/v1/housekeeping${queryString ? `?${queryString}` : ''}`);
    },
  },

  // Room Types endpoints
  roomTypes: {
    getAll: (params = {}) => {
      const queryString = new URLSearchParams(params).toString();
      return request(`/v1/room-types${queryString ? `?${queryString}` : ''}`);
    },

    getById: (id) => request(`/v1/room-types/${id}`),

    create: (roomTypeData) =>
      request('/v1/room-types', {
        method: 'POST',
        body: roomTypeData,
      }),

    update: (id, roomTypeData) =>
      request(`/v1/room-types/${id}`, {
        method: 'PUT',
        body: roomTypeData,
      }),

    delete: (id) =>
      request(`/v1/room-types/${id}`, {
        method: 'DELETE',
      }),

    getAvailability: (id, startDate, endDate) => {
      const queryString = new URLSearchParams({
        start_date: startDate,
        end_date: endDate,
      }).toString();
      return request(`/v1/room-types/${id}/availability?${queryString}`);
    },

    getAvailable: (checkIn, checkOut, filters = {}) => {
      const params = {
        check_in: checkIn,
        check_out: checkOut,
        ...filters,
      };
      // Filter out undefined values to avoid URLSearchParams converting them to "undefined" strings
      const cleanParams = Object.fromEntries(
        Object.entries(params).filter(([_, value]) => value !== undefined && value !== null && value !== '')
      );
      const queryString = new URLSearchParams(cleanParams).toString();
      return request(`/v1/room-types/available?${queryString}`);
    },
  },

  // Reservations endpoints
  reservations: {
    getAll: (params = {}) => {
      const queryString = new URLSearchParams(params).toString();
      return request(`/v1/reservations${queryString ? `?${queryString}` : ''}`);
    },

    getById: (id) => request(`/v1/reservations/${id}`),

    create: (reservationData) =>
      request('/v1/reservations', {
        method: 'POST',
        body: reservationData,
      }),

    update: (id, reservationData) =>
      request(`/v1/reservations/${id}`, {
        method: 'PUT',
        body: reservationData,
      }),

    delete: (id) =>
      request(`/v1/reservations/${id}`, {
        method: 'DELETE',
      }),

    checkAvailability: (params = {}) => {
      const queryString = new URLSearchParams(params).toString();
      return request(`/v1/reservations/availability/check${queryString ? `?${queryString}` : ''}`);
    },
  },

  // Guests endpoints
  guests: {
    getAll: (params = {}) => {
      const queryString = new URLSearchParams(params).toString();
      return request(`/v1/guests${queryString ? `?${queryString}` : ''}`);
    },

    getById: (id) => request(`/v1/guests/${id}`),

    create: (guestData) =>
      request('/v1/guests', {
        method: 'POST',
        body: guestData,
      }),

    update: (id, guestData) =>
      request(`/v1/guests/${id}`, {
        method: 'PUT',
        body: guestData,
      }),

    delete: (id) =>
      request(`/v1/guests/${id}`, {
        method: 'DELETE',
      }),
  },

  // Invoices endpoints
  invoices: {
    getAll: (params = {}) => {
      const queryString = new URLSearchParams(params).toString();
      return request(`/v1/invoices${queryString ? `?${queryString}` : ''}`);
    },

    getById: (id) => request(`/v1/invoices/${id}`),

    create: (invoiceData) =>
      request('/v1/invoices', {
        method: 'POST',
        body: invoiceData,
      }),

    update: (id, invoiceData) =>
      request(`/v1/invoices/${id}`, {
        method: 'PUT',
        body: invoiceData,
      }),

    delete: (id) =>
      request(`/v1/invoices/${id}`, {
        method: 'DELETE',
      }),
  },

  // Expenses endpoints
  expenses: {
    getAll: (params = {}) => {
      const queryString = new URLSearchParams(params).toString();
      return request(`/v1/expenses${queryString ? `?${queryString}` : ''}`);
    },

    getById: (id) => request(`/v1/expenses/${id}`),

    create: (expenseData) =>
      request('/v1/expenses', {
        method: 'POST',
        body: expenseData,
      }),

    update: (id, expenseData) =>
      request(`/v1/expenses/${id}`, {
        method: 'PUT',
        body: expenseData,
      }),

    delete: (id) =>
      request(`/v1/expenses/${id}`, {
        method: 'DELETE',
      }),

    getStats: (params = {}) => {
      const queryString = new URLSearchParams(params).toString();
      return request(`/v1/expenses/stats${queryString ? `?${queryString}` : ''}`);
    },
  },

  // Maintenance endpoints
  maintenance: {
    getAll: (params = {}) => {
      const queryString = new URLSearchParams(params).toString();
      return request(`/v1/maintenance-requests${queryString ? `?${queryString}` : ''}`);
    },

    getById: (id) => request(`/v1/maintenance-requests/${id}`),

    create: (requestData) =>
      request('/v1/maintenance-requests', {
        method: 'POST',
        body: requestData,
      }),

    update: (id, requestData) =>
      request(`/v1/maintenance-requests/${id}`, {
        method: 'PUT',
        body: requestData,
      }),

    delete: (id) =>
      request(`/v1/maintenance-requests/${id}`, {
        method: 'DELETE',
      }),
  },

  // Reports endpoints
  reports: {
    getStats: (params = {}) => {
      const queryString = new URLSearchParams(params).toString();
      return request(`/v1/reports/stats${queryString ? `?${queryString}` : ''}`);
    },
  },

  // Audit logs endpoints
  auditLogs: {
    getAll: (params = {}) => {
      const queryString = new URLSearchParams(params).toString();
      return request(`/v1/audit-logs${queryString ? `?${queryString}` : ''}`);
    },

    getById: (id) => request(`/v1/audit-logs/${id}`),
  },

  // Settings endpoints
  settings: {
    get: () => request('/v1/settings'),

    update: (settingsData) =>
      request('/v1/settings', {
        method: 'PUT',
        body: settingsData,
      }),

    // Channel Manager endpoints
    getChannelManagerStatus: () => request('/v1/settings/channel-manager'),

    switchChannelManager: (channelManager) =>
      request('/v1/settings/channel-manager/switch', {
        method: 'POST',
        body: { channelManager },
      }),

    testQloAppsConnection: () =>
      request('/v1/settings/channel-manager/test-qloapps', {
        method: 'POST',
      }),

    // Beds24 endpoints
    getBeds24Config: () => request('/v1/settings/beds24'),

    authenticateBeds24: (inviteCode, beds24PropertyId, deviceName) =>
      request('/v1/settings/beds24/authenticate', {
        method: 'POST',
        body: { inviteCode, beds24PropertyId, deviceName },
      }),

    updateBeds24Config: (configData) =>
      request('/v1/settings/beds24', {
        method: 'PUT',
        body: configData,
      }),

    testBeds24Connection: () =>
      request('/v1/settings/beds24/test', {
        method: 'POST',
      }),
    triggerInitialSync: () =>
      request('/v1/settings/beds24/initial-sync', {
        method: 'POST',
      }),

    // Beds24 room mapping endpoints
    getBeds24Rooms: () => request('/v1/settings/beds24/rooms'),
    getUnmappedBeds24Rooms: () => request('/v1/settings/beds24/rooms/unmapped'),
    getPmsRoomsWithMapping: () => request('/v1/settings/beds24/rooms/pms'),
    mapRoom: (pmsRoomId, beds24RoomId) =>
      request('/v1/settings/beds24/rooms/map', {
        method: 'POST',
        body: { pmsRoomId, beds24RoomId },
      }),
    unmapRoom: (roomId) =>
      request(`/v1/settings/beds24/rooms/${roomId}/map`, {
        method: 'DELETE',
      }),
    autoCreateRooms: (options = {}) =>
      request('/v1/settings/beds24/rooms/auto-create', {
        method: 'POST',
        body: options,
      }),

    // Data management endpoints
    clearAllData: () =>
      request('/v1/settings/clear-all-data', {
        method: 'POST',
      }),
  },

  // Users/Staff endpoints
  users: {
    getAll: () => request('/v1/users'),
    getById: (id) => request(`/v1/users/${id}`),
    create: (userData) =>
      request('/v1/users', {
        method: 'POST',
        body: userData,
      }),
    update: (id, userData) =>
      request(`/v1/users/${id}`, {
        method: 'PUT',
        body: userData,
      }),
    delete: (id) =>
      request(`/v1/users/${id}`, {
        method: 'DELETE',
      }),
  },

  // Channel Manager endpoints
  channelManagers: {
    getStatus: () => request('/v1/settings/channel-manager'),
    
    testConnection: () =>
      request('/v1/settings/channel-manager/test-qloapps', {
        method: 'POST',
      }),
    
    setupQloApps: (configData) =>
      request('/v1/settings/channel-manager/setup-qloapps', {
        method: 'POST',
        body: configData,
      }),
    
    getQloAppsConfig: () => request('/v1/qloapps/config'),
    
    deleteQloAppsConfig: () =>
      request('/v1/qloapps/config', {
        method: 'DELETE',
      }),
    
    // Pull sync endpoints
    triggerPullSync: (options = {}) =>
      request('/v1/qloapps/sync', {
        method: 'POST',
        body: {
          syncType: options.fullSync ? 'full' : 'reservations_inbound',
          options,
        },
      }),
    
    getSyncStatus: () => request('/v1/qloapps/sync/status'),
  },
};

export { ApiError };
