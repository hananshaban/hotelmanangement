import useToastStore from '../store/toastStore'

export const useToast = () => {
  const { showToast } = useToastStore()

  return {
    success: (message, duration) => showToast(message, 'success', duration),
    error: (message, duration) => showToast(message, 'error', duration),
    warning: (message, duration) => showToast(message, 'warning', duration),
    info: (message, duration) => showToast(message, 'info', duration),
  }
}

