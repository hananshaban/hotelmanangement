import { create } from 'zustand'

let toastIdCounter = 0

const useToastStore = create((set) => ({
  toasts: [],

  showToast: (message, type = 'info', duration = 5000) => {
    const id = `toast-${++toastIdCounter}`
    const toast = {
      id,
      message,
      type, // 'success', 'error', 'warning', 'info'
      duration,
    }

    set((state) => ({
      toasts: [...state.toasts, toast],
    }))

    // Auto-dismiss
    if (duration > 0) {
      setTimeout(() => {
        set((state) => ({
          toasts: state.toasts.filter((t) => t.id !== id),
        }))
      }, duration)
    }

    return id
  },

  removeToast: (id) => {
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    }))
  },

  clearAll: () => {
    set({ toasts: [] })
  },
}))

export default useToastStore



