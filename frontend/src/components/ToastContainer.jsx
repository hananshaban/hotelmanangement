import useToastStore from '../store/toastStore'
import ToastNotification from './ToastNotification'

const ToastContainer = () => {
  const { toasts, removeToast } = useToastStore()

  if (toasts.length === 0) return null

  return (
    <div
      className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none"
      aria-live="polite"
      aria-atomic="true"
    >
      {toasts.map((toast) => (
        <div key={toast.id} className="pointer-events-auto">
          <ToastNotification toast={toast} onDismiss={removeToast} />
        </div>
      ))}
    </div>
  )
}

export default ToastContainer

