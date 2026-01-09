import { create } from 'zustand';
import { api } from '../utils/api';

const useInvoicesStore = create((set, get) => ({
  invoices: [],
  loading: false,
  error: null,

  // Fetch all invoices
  fetchInvoices: async (filters = {}) => {
    set({ loading: true, error: null });
    try {
      const data = await api.invoices.getAll(filters);
      
      // Transform API response to match frontend format
      const transformed = data.map((invoice) => ({
        id: invoice.id,
        reservationId: invoice.reservation_id || invoice.reservation_number || '',
        guestId: invoice.guest_id,
        guestName: invoice.guest_name,
        guestEmail: invoice.guest_email || '',
        guestPhone: invoice.guest_phone || '',
        issueDate: invoice.issue_date,
        dueDate: invoice.due_date,
        amount: invoice.amount,
        status: invoice.status,
        paymentMethod: invoice.payment_method || '',
        notes: invoice.notes || '',
        paidAt: invoice.paid_at,
        createdAt: invoice.created_at,
        updatedAt: invoice.updated_at,
      }));

      set({ invoices: transformed, loading: false });
      return transformed;
    } catch (error) {
      set({ error: error.message || 'Failed to fetch invoices', loading: false });
      throw error;
    }
  },

  // Fetch single invoice
  fetchInvoice: async (id) => {
    set({ loading: true, error: null });
    try {
      const data = await api.invoices.getById(id);
      
      // Transform API response
      const transformed = {
        id: data.id,
        reservationId: data.reservation_id || data.reservation_number || '',
        guestId: data.guest_id,
        guestName: data.guest_name,
        guestEmail: data.guest_email || '',
        guestPhone: data.guest_phone || '',
        issueDate: data.issue_date,
        dueDate: data.due_date,
        amount: data.amount,
        status: data.status,
        paymentMethod: data.payment_method || '',
        notes: data.notes || '',
        paidAt: data.paid_at,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      };

      // Update in list if exists
      set((state) => ({
        invoices: state.invoices.map((inv) =>
          inv.id === id ? transformed : inv
        ),
        loading: false,
      }));

      return transformed;
    } catch (error) {
      set({ error: error.message || 'Failed to fetch invoice', loading: false });
      throw error;
    }
  },

  // Create invoice
  createInvoice: async (invoiceData) => {
    set({ loading: true, error: null });
    try {
      const payload = {
        reservation_id: invoiceData.reservationId || invoiceData.reservation_id || undefined,
        guest_id: invoiceData.guestId || invoiceData.guest_id,
        issue_date: invoiceData.issueDate || invoiceData.issue_date,
        due_date: invoiceData.dueDate || invoiceData.due_date,
        amount: invoiceData.amount,
        status: invoiceData.status || 'Pending',
        payment_method: invoiceData.paymentMethod || invoiceData.payment_method || undefined,
        notes: invoiceData.notes || undefined,
      };

      const data = await api.invoices.create(payload);

      // Transform API response
      const transformed = {
        id: data.id,
        reservationId: data.reservation_id || data.reservation_number || '',
        guestId: data.guest_id,
        guestName: data.guest_name,
        guestEmail: data.guest_email || '',
        guestPhone: data.guest_phone || '',
        issueDate: data.issue_date,
        dueDate: data.due_date,
        amount: data.amount,
        status: data.status,
        paymentMethod: data.payment_method || '',
        notes: data.notes || '',
        paidAt: data.paid_at,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      };

      set((state) => ({
        invoices: [transformed, ...state.invoices],
        loading: false,
      }));

      return transformed;
    } catch (error) {
      set({ error: error.message || 'Failed to create invoice', loading: false });
      throw error;
    }
  },

  // Update invoice
  updateInvoice: async (id, updates) => {
    set({ loading: true, error: null });
    try {
      const payload = {};
      if (updates.reservationId !== undefined || updates.reservation_id !== undefined) {
        payload.reservation_id = updates.reservationId || updates.reservation_id || null;
      }
      if (updates.guestId !== undefined || updates.guest_id !== undefined) {
        payload.guest_id = updates.guestId || updates.guest_id;
      }
      if (updates.issueDate !== undefined || updates.issue_date !== undefined) {
        payload.issue_date = updates.issueDate || updates.issue_date;
      }
      if (updates.dueDate !== undefined || updates.due_date !== undefined) {
        payload.due_date = updates.dueDate || updates.due_date;
      }
      if (updates.amount !== undefined) {
        payload.amount = updates.amount;
      }
      if (updates.status !== undefined) {
        payload.status = updates.status;
      }
      if (updates.paymentMethod !== undefined || updates.payment_method !== undefined) {
        payload.payment_method = updates.paymentMethod || updates.payment_method || null;
      }
      if (updates.notes !== undefined) {
        payload.notes = updates.notes || null;
      }

      const data = await api.invoices.update(id, payload);

      // Transform API response
      const transformed = {
        id: data.id,
        reservationId: data.reservation_id || data.reservation_number || '',
        guestId: data.guest_id,
        guestName: data.guest_name,
        guestEmail: data.guest_email || '',
        guestPhone: data.guest_phone || '',
        issueDate: data.issue_date,
        dueDate: data.due_date,
        amount: data.amount,
        status: data.status,
        paymentMethod: data.payment_method || '',
        notes: data.notes || '',
        paidAt: data.paid_at,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      };

      set((state) => ({
        invoices: state.invoices.map((inv) =>
          inv.id === id ? transformed : inv
        ),
        loading: false,
      }));

      return transformed;
    } catch (error) {
      set({ error: error.message || 'Failed to update invoice', loading: false });
      throw error;
    }
  },

  // Delete invoice
  deleteInvoice: async (id) => {
    set({ loading: true, error: null });
    try {
      await api.invoices.delete(id);

      set((state) => ({
        invoices: state.invoices.filter((inv) => inv.id !== id),
        loading: false,
      }));
    } catch (error) {
      set({ error: error.message || 'Failed to delete invoice', loading: false });
      throw error;
    }
  },
}));

export default useInvoicesStore;



