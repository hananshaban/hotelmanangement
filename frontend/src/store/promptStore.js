import { create } from 'zustand'

const usePromptStore = create((set) => ({
  isOpen: false,
  title: '',
  message: '',
  placeholder: '',
  validation: null,
  confirmLabel: 'Confirm',
  cancelLabel: 'Cancel',
  resolve: null,
  inputValue: '',
  error: '',

  show: (config) => {
    return new Promise((resolve) => {
      set({
        isOpen: true,
        title: config.title || 'Enter Value',
        message: config.message || '',
        placeholder: config.placeholder || '',
        validation: config.validation || null,
        confirmLabel: config.confirmLabel || 'Confirm',
        cancelLabel: config.cancelLabel || 'Cancel',
        inputValue: '',
        error: '',
        resolve,
      })
    })
  },

  setInputValue: (value) => {
    set({ inputValue: value, error: '' })
  },

  confirm: () => {
    const { inputValue, validation, resolve } = usePromptStore.getState()
    
    // Validate if validation function provided
    if (validation) {
      const validationResult = validation(inputValue)
      if (validationResult !== true) {
        // validationResult is either false or an error message string
        const errorMessage = typeof validationResult === 'string' ? validationResult : 'Invalid input'
        set({ error: errorMessage })
        return
      }
    }

    if (resolve) {
      resolve(inputValue)
    }
    set({
      isOpen: false,
      title: '',
      message: '',
      placeholder: '',
      validation: null,
      confirmLabel: 'Confirm',
      cancelLabel: 'Cancel',
      resolve: null,
      inputValue: '',
      error: '',
    })
  },

  cancel: () => {
    const { resolve } = usePromptStore.getState()
    if (resolve) {
      resolve(null)
    }
    set({
      isOpen: false,
      title: '',
      message: '',
      placeholder: '',
      validation: null,
      confirmLabel: 'Confirm',
      cancelLabel: 'Cancel',
      resolve: null,
      inputValue: '',
      error: '',
    })
  },
}))

export default usePromptStore

