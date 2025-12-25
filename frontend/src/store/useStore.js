import { create } from 'zustand'
import guestsData from '../data/guests.json'
import roomsData from '../data/rooms.json'
import reservationsData from '../data/reservations.json'

/**
 * @typedef {Object} Room
 * @property {string|number} id
 * @property {string} roomNumber
 * @property {string} type - 'Single' | 'Double' | 'Suite'
 * @property {string} status - 'Available' | 'Occupied' | 'Cleaning' | 'Out of Service'
 * @property {number} pricePerNight
 * @property {number} floor
 * @property {string[]} features
 */

/**
 * @typedef {Object} Guest
 * @property {string|number} id
 * @property {string} name
 * @property {string} phone
 * @property {string} email
 * @property {number} pastStays
 * @property {string} notes
 */

/**
 * @typedef {Object} Reservation
 * @property {string} id
 * @property {string} guestName
 * @property {string} guestId
 * @property {string} roomNumber
 * @property {string} checkIn - ISO date string
 * @property {string} checkOut - ISO date string
 * @property {string} status - 'Confirmed' | 'Checked-in' | 'Checked-out' | 'Cancelled'
 * @property {number} totalAmount
 * @property {string} guestEmail
 * @property {string} guestPhone
 */

/**
 * @typedef {Object} Invoice
 * @property {string} id
 * @property {string} reservationId
 * @property {string} guestId
 * @property {string} issueDate - ISO date string
 * @property {string} dueDate - ISO date string
 * @property {number} amount
 * @property {string} status - 'Pending' | 'Paid' | 'Cancelled'
 * @property {string} notes
 * @property {string} paymentMethod - 'Cash' | 'Card' | 'Online'
 */

/**
 * @typedef {Object} Housekeeping
 * @property {string} roomId
 * @property {string} status - 'Clean' | 'Dirty' | 'In Progress'
 * @property {string} lastCleaned - ISO date string
 * @property {string} assignedStaff
 */

/**
 * @typedef {Object} MaintenanceRequest
 * @property {string} id
 * @property {string} roomId
 * @property {string} roomNumber
 * @property {string} title
 * @property {string} description
 * @property {string} priority - 'Low' | 'Medium' | 'High' | 'Urgent'
 * @property {string} status - 'Open' | 'In Progress' | 'Repaired'
 * @property {string} createdAt - ISO date string
 * @property {string} updatedAt - ISO date string
 */

/**
 * @typedef {Object} Expense
 * @property {string} id
 * @property {string} category
 * @property {number} amount
 * @property {string} date - ISO date string
 * @property {string} notes
 */

/**
 * @typedef {Object} AuditLog
 * @property {string} id
 * @property {string} action - e.g., 'ADD_GUEST', 'UPDATE_RESERVATION_STATUS'
 * @property {string} entityType - 'Guest' | 'Room' | 'Reservation' | 'Invoice' | etc.
 * @property {string} entityId
 * @property {string} userId - 'System' or user ID
 * @property {string} timestamp - ISO date string
 * @property {Object} details
 */

/**
 * @typedef {Object} Notification
 * @property {string} id
 * @property {string} type - 'checkin' | 'checkout' | 'invoice' | 'cleaning' | 'maintenance'
 * @property {string} title
 * @property {string} message
 * @property {string} timestamp - ISO date string
 * @property {boolean} read
 * @property {string} link - optional route
 */

const useStore = create((set, get) => ({
  // Initial state loaded from JSON files
  rooms: roomsData,
  guests: guestsData.map((g, index) => ({
    ...g,
    tags: g.tags || (index < 3 ? ['VIP'] : index < 6 ? ['Returning'] : index === 7 ? ['Corporate'] : []),
    notes: g.notes || '',
  })),
  reservations: reservationsData.map(res => ({
    ...res,
    createdAt: res.createdAt || new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString(),
  })),
  invoices: [
    {
      id: 'INV-001',
      reservationId: 'RES-001',
      guestId: '1',
      issueDate: '2024-01-15',
      dueDate: '2024-02-14',
      amount: 360,
      status: 'Paid',
      notes: 'Invoice for reservation RES-001',
      paymentMethod: 'Card',
    },
    {
      id: 'INV-002',
      reservationId: 'RES-002',
      guestId: '2',
      issueDate: '2024-01-16',
      dueDate: '2024-02-15',
      amount: 720,
      status: 'Paid',
      notes: 'Invoice for reservation RES-002',
      paymentMethod: 'Online',
    },
    {
      id: 'INV-003',
      reservationId: 'RES-003',
      guestId: '3',
      issueDate: '2024-01-10',
      dueDate: '2024-02-09',
      amount: 2450,
      status: 'Pending',
      notes: 'Invoice for reservation RES-003',
      paymentMethod: '',
    },
  ],
  housekeeping: roomsData.map(room => ({
    roomId: String(room.id),
    status: room.status === 'Cleaning' ? 'In Progress' : room.status === 'Occupied' ? 'Dirty' : 'Clean',
    lastCleaned: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString(),
    assignedStaff: room.status === 'Cleaning' ? 'John Doe' : '',
  })),
  maintenanceRequests: [
    {
      id: 'MNT-001',
      roomId: '2',
      roomNumber: '102',
      title: 'AC Not Working',
      description: 'Air conditioning unit in room 102 is not cooling properly. Guest reported issue.',
      priority: 'High',
      status: 'Open',
      createdAt: '2024-01-20T10:00:00Z',
      updatedAt: '2024-01-20T10:00:00Z',
    },
    {
      id: 'MNT-002',
      roomId: '5',
      roomNumber: '105',
      title: 'Leaky Faucet',
      description: 'Bathroom faucet in suite 105 has a slow leak. Needs repair.',
      priority: 'Medium',
      status: 'In Progress',
      createdAt: '2024-01-18T14:30:00Z',
      updatedAt: '2024-01-19T09:00:00Z',
    },
    {
      id: 'MNT-003',
      roomId: '22',
      roomNumber: '502',
      title: 'TV Remote Not Working',
      description: 'TV remote control needs battery replacement or repair.',
      priority: 'Low',
      status: 'Repaired',
      createdAt: '2024-01-15T08:00:00Z',
      updatedAt: '2024-01-15T16:00:00Z',
    },
  ],
  expenses: [
    {
      id: 'EXP-001',
      category: 'Utilities',
      amount: 2500,
      date: '2024-01-01',
      notes: 'Monthly electricity bill',
    },
    {
      id: 'EXP-002',
      category: 'Staff',
      amount: 12000,
      date: '2024-01-05',
      notes: 'Monthly staff salaries',
    },
    {
      id: 'EXP-003',
      category: 'Supplies',
      amount: 800,
      date: '2024-01-10',
      notes: 'Cleaning supplies and toiletries',
    },
    {
      id: 'EXP-004',
      category: 'Maintenance',
      amount: 1500,
      date: '2024-01-12',
      notes: 'HVAC system maintenance',
    },
    {
      id: 'EXP-005',
      category: 'Marketing',
      amount: 2000,
      date: '2024-01-15',
      notes: 'Online advertising campaign',
    },
    {
      id: 'EXP-006',
      category: 'Insurance',
      amount: 3500,
      date: '2024-01-01',
      notes: 'Quarterly insurance payment',
    },
  ],
  auditLogs: [
    {
      id: 'LOG-001',
      action: 'ADD_GUEST',
      entityType: 'Guest',
      entityId: '1',
      userId: 'System',
      timestamp: '2024-01-01T08:00:00Z',
      details: { name: 'John Smith' },
    },
    {
      id: 'LOG-002',
      action: 'ADD_RESERVATION',
      entityType: 'Reservation',
      entityId: 'RES-001',
      userId: 'System',
      timestamp: '2024-01-10T10:00:00Z',
      details: { guestName: 'John Smith', roomNumber: '101' },
    },
    {
      id: 'LOG-003',
      action: 'UPDATE_RESERVATION_STATUS',
      entityType: 'Reservation',
      entityId: 'RES-001',
      userId: 'System',
      timestamp: '2024-01-15T14:00:00Z',
      details: { oldStatus: 'Confirmed', newStatus: 'Checked-in' },
    },
    {
      id: 'LOG-004',
      action: 'ADD_INVOICE',
      entityType: 'Invoice',
      entityId: 'INV-001',
      userId: 'System',
      timestamp: '2024-01-15T15:00:00Z',
      details: { amount: 360, reservationId: 'RES-001' },
    },
    {
      id: 'LOG-005',
      action: 'UPDATE_INVOICE_STATUS',
      entityType: 'Invoice',
      entityId: 'INV-001',
      userId: 'System',
      timestamp: '2024-01-16T09:00:00Z',
      details: { status: 'Paid', paymentMethod: 'Card' },
    },
    {
      id: 'LOG-006',
      action: 'ADD_MAINTENANCE_REQUEST',
      entityType: 'Maintenance',
      entityId: 'MNT-001',
      userId: 'System',
      timestamp: '2024-01-20T10:00:00Z',
      details: { roomNumber: '102', title: 'AC Not Working' },
    },
    {
      id: 'LOG-007',
      action: 'ADD_EXPENSE',
      entityType: 'Expense',
      entityId: 'EXP-001',
      userId: 'System',
      timestamp: '2024-01-01T08:00:00Z',
      details: { category: 'Utilities', amount: 2500 },
    },
  ],
  notifications: [
    {
      id: 'NOTIF-001',
      type: 'checkin',
      title: 'Check-in Today',
      message: 'John Smith - Room 101',
      timestamp: new Date().toISOString(),
      read: false,
      link: '/reservations',
    },
    {
      id: 'NOTIF-002',
      type: 'cleaning',
      title: 'Room Requires Cleaning',
      message: 'Room 102 is marked as dirty',
      timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      read: false,
      link: '/rooms?tab=housekeeping',
    },
    {
      id: 'NOTIF-003',
      type: 'maintenance',
      title: 'New Maintenance Request',
      message: 'AC Not Working - Room 102',
      timestamp: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
      read: true,
      link: '/maintenance',
    },
  ],
  darkMode: localStorage.getItem('darkMode') === 'true',

  // Actions
  addRoom: (room) => {
    const newRoom = {
      ...room,
      id: room.id || get().rooms.length + 1,
    }
    set((state) => ({
      rooms: [...state.rooms, newRoom],
    }))
    return newRoom
  },

  addGuest: (guest) => {
    const newGuest = {
      ...guest,
      id: guest.id || get().guests.length + 1,
      pastStays: guest.pastStays || 0,
      notes: guest.notes || '',
      tags: guest.tags || [],
    }
    set((state) => ({
      guests: [...state.guests, newGuest],
      auditLogs: [...state.auditLogs, {
        id: `LOG-${Date.now()}`,
        action: 'ADD_GUEST',
        entityType: 'Guest',
        entityId: String(newGuest.id),
        userId: 'System',
        timestamp: new Date().toISOString(),
        details: { name: newGuest.name },
      }],
    }))
    return newGuest
  },

  updateGuest: (guestId, updates) => {
    set((state) => ({
      guests: state.guests.map((g) =>
        String(g.id) === String(guestId) ? { ...g, ...updates } : g
      ),
      auditLogs: [...state.auditLogs, {
        id: `LOG-${Date.now()}`,
        action: 'UPDATE_GUEST',
        entityType: 'Guest',
        entityId: String(guestId),
        userId: 'System',
        timestamp: new Date().toISOString(),
        details: updates,
      }],
    }))
  },

  addReservation: (reservation) => {
    const newReservation = {
      ...reservation,
      id: reservation.id || `RES-${String(get().reservations.length + 1).padStart(3, '0')}`,
      createdAt: reservation.createdAt || new Date().toISOString(),
    }
    set((state) => ({
      reservations: [...state.reservations, newReservation],
      auditLogs: [...state.auditLogs, {
        id: `LOG-${Date.now()}`,
        action: 'ADD_RESERVATION',
        entityType: 'Reservation',
        entityId: newReservation.id,
        userId: 'System',
        timestamp: new Date().toISOString(),
        details: { guestName: newReservation.guestName, roomNumber: newReservation.roomNumber },
      }],
    }))
    return newReservation
  },

  updateReservationStatus: (reservationId, status) => {
    const reservation = get().reservations.find(r => r.id === reservationId)
    const wasCheckedOut = reservation?.status === 'Checked-out'
    
    set((state) => {
      const updatedReservations = state.reservations.map((res) =>
        res.id === reservationId ? { ...res, status } : res
      )
      
      // Auto-generate invoice when status changes to Checked-out
      const updatedReservation = updatedReservations.find(r => r.id === reservationId)
      let newInvoices = [...state.invoices]
      
      if (status === 'Checked-out' && !wasCheckedOut && updatedReservation) {
        const today = new Date()
        const dueDate = new Date(today)
        dueDate.setDate(dueDate.getDate() + 30)
        
        const guest = state.guests.find(g => 
          String(g.id) === String(updatedReservation.guestId) || 
          g.name === updatedReservation.guestName
        )
        
        if (guest) {
          const newInvoice = {
            id: `INV-${String(state.invoices.length + 1).padStart(3, '0')}`,
            reservationId: reservationId,
            guestId: String(guest.id),
            issueDate: today.toISOString().split('T')[0],
            dueDate: dueDate.toISOString().split('T')[0],
            amount: updatedReservation.totalAmount || 0,
            status: 'Pending',
            notes: `Auto-generated invoice for reservation ${reservationId}`,
            paymentMethod: '',
          }
          newInvoices.push(newInvoice)
        }
      }
      
      return {
        reservations: updatedReservations,
        invoices: newInvoices,
        auditLogs: [...state.auditLogs, {
          id: `LOG-${Date.now()}`,
          action: 'UPDATE_RESERVATION_STATUS',
          entityType: 'Reservation',
          entityId: reservationId,
          userId: 'System',
          timestamp: new Date().toISOString(),
          details: { oldStatus: reservation?.status, newStatus: status },
        }],
      }
    })
  },

  addInvoice: (invoice) => {
    const newInvoice = {
      ...invoice,
      id: invoice.id || `INV-${String(get().invoices.length + 1).padStart(3, '0')}`,
      status: invoice.status || 'Pending',
      notes: invoice.notes || '',
      paymentMethod: invoice.paymentMethod || '',
    }
    set((state) => ({
      invoices: [...state.invoices, newInvoice],
      auditLogs: [...state.auditLogs, {
        id: `LOG-${Date.now()}`,
        action: 'ADD_INVOICE',
        entityType: 'Invoice',
        entityId: newInvoice.id,
        userId: 'System',
        timestamp: new Date().toISOString(),
        details: { amount: newInvoice.amount, reservationId: newInvoice.reservationId },
      }],
    }))
    return newInvoice
  },

  updateInvoiceStatus: (invoiceId, status, paymentMethod = '') => {
    set((state) => ({
      invoices: state.invoices.map((inv) =>
        inv.id === invoiceId ? { ...inv, status, paymentMethod: paymentMethod || inv.paymentMethod } : inv
      ),
      auditLogs: [...state.auditLogs, {
        id: `LOG-${Date.now()}`,
        action: 'UPDATE_INVOICE_STATUS',
        entityType: 'Invoice',
        entityId: invoiceId,
        userId: 'System',
        timestamp: new Date().toISOString(),
        details: { status, paymentMethod },
      }],
    }))
  },

  // Housekeeping actions
  updateHousekeepingStatus: (roomId, status, assignedStaff = '') => {
    set((state) => ({
      housekeeping: state.housekeeping.map((hk) =>
        hk.roomId === String(roomId)
          ? {
              ...hk,
              status,
              lastCleaned: status === 'Clean' ? new Date().toISOString() : hk.lastCleaned,
              assignedStaff: assignedStaff || hk.assignedStaff,
            }
          : hk
      ),
      auditLogs: [...state.auditLogs, {
        id: `LOG-${Date.now()}`,
        action: 'UPDATE_HOUSEKEEPING_STATUS',
        entityType: 'Room',
        entityId: String(roomId),
        userId: 'System',
        timestamp: new Date().toISOString(),
        details: { status, assignedStaff },
      }],
    }))
  },

  // Maintenance actions
  addMaintenanceRequest: (request) => {
    const newRequest = {
      ...request,
      id: request.id || `MNT-${String(get().maintenanceRequests.length + 1).padStart(3, '0')}`,
      status: request.status || 'Open',
      createdAt: request.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    set((state) => ({
      maintenanceRequests: [...state.maintenanceRequests, newRequest],
      auditLogs: [...state.auditLogs, {
        id: `LOG-${Date.now()}`,
        action: 'ADD_MAINTENANCE_REQUEST',
        entityType: 'Maintenance',
        entityId: newRequest.id,
        userId: 'System',
        timestamp: new Date().toISOString(),
        details: { roomNumber: newRequest.roomNumber, title: newRequest.title },
      }],
    }))
    return newRequest
  },

  updateMaintenanceStatus: (requestId, status) => {
    set((state) => ({
      maintenanceRequests: state.maintenanceRequests.map((req) =>
        req.id === requestId ? { ...req, status, updatedAt: new Date().toISOString() } : req
      ),
      auditLogs: [...state.auditLogs, {
        id: `LOG-${Date.now()}`,
        action: 'UPDATE_MAINTENANCE_STATUS',
        entityType: 'Maintenance',
        entityId: requestId,
        userId: 'System',
        timestamp: new Date().toISOString(),
        details: { status },
      }],
    }))
  },

  // Expense actions
  addExpense: (expense) => {
    const newExpense = {
      ...expense,
      id: expense.id || `EXP-${String(get().expenses.length + 1).padStart(3, '0')}`,
      date: expense.date || new Date().toISOString().split('T')[0],
      notes: expense.notes || '',
    }
    set((state) => ({
      expenses: [...state.expenses, newExpense],
      auditLogs: [...state.auditLogs, {
        id: `LOG-${Date.now()}`,
        action: 'ADD_EXPENSE',
        entityType: 'Expense',
        entityId: newExpense.id,
        userId: 'System',
        timestamp: new Date().toISOString(),
        details: { category: newExpense.category, amount: newExpense.amount },
      }],
    }))
    return newExpense
  },

  // Notification actions
  addNotification: (notification) => {
    const newNotification = {
      ...notification,
      id: notification.id || `NOTIF-${Date.now()}`,
      timestamp: notification.timestamp || new Date().toISOString(),
      read: false,
    }
    set((state) => ({
      notifications: [newNotification, ...state.notifications],
    }))
    return newNotification
  },

  markNotificationAsRead: (notificationId) => {
    set((state) => ({
      notifications: state.notifications.map((notif) =>
        notif.id === notificationId ? { ...notif, read: true } : notif
      ),
    }))
  },

  markAllNotificationsAsRead: () => {
    set((state) => ({
      notifications: state.notifications.map((notif) => ({ ...notif, read: true })),
    }))
  },

  // Dark mode
  toggleDarkMode: () => {
    const newMode = !get().darkMode
    localStorage.setItem('darkMode', String(newMode))
    set({ darkMode: newMode })
  },
}))

export default useStore

