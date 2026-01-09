import { create } from 'zustand';
import { api } from '../utils/api';

const useExpensesStore = create((set, get) => ({
  expenses: [],
  loading: false,
  error: null,

  // Fetch all expenses
  fetchExpenses: async (filters = {}) => {
    set({ loading: true, error: null });
    try {
      const data = await api.expenses.getAll(filters);
      
      // Transform API response to match frontend format
      const transformed = data.map((expense) => ({
        id: expense.id,
        category: expense.category,
        amount: expense.amount,
        date: expense.expense_date,
        notes: expense.notes || '',
        createdAt: expense.created_at,
        updatedAt: expense.updated_at,
      }));

      set({ expenses: transformed, loading: false });
      return transformed;
    } catch (error) {
      set({ error: error.message || 'Failed to fetch expenses', loading: false });
      throw error;
    }
  },

  // Fetch single expense
  fetchExpense: async (id) => {
    set({ loading: true, error: null });
    try {
      const data = await api.expenses.getById(id);
      
      // Transform API response
      const transformed = {
        id: data.id,
        category: data.category,
        amount: data.amount,
        date: data.expense_date,
        notes: data.notes || '',
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      };

      // Update in list if exists
      set((state) => ({
        expenses: state.expenses.map((exp) =>
          exp.id === id ? transformed : exp
        ),
        loading: false,
      }));

      return transformed;
    } catch (error) {
      set({ error: error.message || 'Failed to fetch expense', loading: false });
      throw error;
    }
  },

  // Create expense
  createExpense: async (expenseData) => {
    set({ loading: true, error: null });
    try {
      const payload = {
        category: expenseData.category,
        amount: expenseData.amount,
        expense_date: expenseData.date || expenseData.expense_date,
        notes: expenseData.notes || undefined,
      };

      const data = await api.expenses.create(payload);

      // Transform API response
      const transformed = {
        id: data.id,
        category: data.category,
        amount: data.amount,
        date: data.expense_date,
        notes: data.notes || '',
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      };

      set((state) => ({
        expenses: [transformed, ...state.expenses],
        loading: false,
      }));

      return transformed;
    } catch (error) {
      set({ error: error.message || 'Failed to create expense', loading: false });
      throw error;
    }
  },

  // Update expense
  updateExpense: async (id, updates) => {
    set({ loading: true, error: null });
    try {
      const payload = {};
      if (updates.category !== undefined) payload.category = updates.category;
      if (updates.amount !== undefined) payload.amount = updates.amount;
      if (updates.date !== undefined || updates.expense_date !== undefined) {
        payload.expense_date = updates.date || updates.expense_date;
      }
      if (updates.notes !== undefined) payload.notes = updates.notes || null;

      const data = await api.expenses.update(id, payload);

      // Transform API response
      const transformed = {
        id: data.id,
        category: data.category,
        amount: data.amount,
        date: data.expense_date,
        notes: data.notes || '',
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      };

      set((state) => ({
        expenses: state.expenses.map((exp) =>
          exp.id === id ? transformed : exp
        ),
        loading: false,
      }));

      return transformed;
    } catch (error) {
      set({ error: error.message || 'Failed to update expense', loading: false });
      throw error;
    }
  },

  // Delete expense
  deleteExpense: async (id) => {
    set({ loading: true, error: null });
    try {
      await api.expenses.delete(id);

      set((state) => ({
        expenses: state.expenses.filter((exp) => exp.id !== id),
        loading: false,
      }));
    } catch (error) {
      set({ error: error.message || 'Failed to delete expense', loading: false });
      throw error;
    }
  },

  // Get expense statistics
  fetchExpenseStats: async (filters = {}) => {
    try {
      const data = await api.expenses.getStats(filters);
      return data;
    } catch (error) {
      throw error;
    }
  },
}));

export default useExpensesStore;



