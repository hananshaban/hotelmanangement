import { create } from 'zustand'

const useConfirmationStore = create((set) => ({
  isOpen: false,
  title: '',
  message: '',
  variant: 'default', // 'default', 'warning', 'danger'
  confirmLabel: 'Confirm',
  cancelLabel: 'Cancel',
  onConfirm: null,
  onCancel: null,
  resolve: null,

  show: (config) => {
    return new Promise((resolve) => {
      set({
        isOpen: true,
        title: config.title || 'Confirm Action',
        message: config.message || '',
        variant: config.variant || 'default',
        confirmLabel: config.confirmLabel || 'Confirm',
        cancelLabel: config.cancelLabel || 'Cancel',
        resolve,
      })
    })
  },

  confirm: () => {
    const { resolve } = useConfirmationStore.getState()
    if (resolve) {
      resolve(true)
    }
    set({
      isOpen: false,
      title: '',
      message: '',
      variant: 'default',
      confirmLabel: 'Confirm',
      cancelLabel: 'Cancel',
      resolve: null,
    })
  },

  cancel: () => {
    const { resolve } = useConfirmationStore.getState()
    if (resolve) {
      resolve(false)
    }
    set({
      isOpen: false,
      title: '',
      message: '',
      variant: 'default',
      confirmLabel: 'Confirm',
      cancelLabel: 'Cancel',
      resolve: null,
    })
  },
}))

export default useConfirmationStore

