import { useEffect, useRef } from 'react'
import usePromptStore from '../store/promptStore'

const PromptDialog = () => {
  const {
    isOpen,
    title,
    message,
    placeholder,
    confirmLabel,
    cancelLabel,
    inputValue,
    error,
    setInputValue,
    confirm,
    cancel,
  } = usePromptStore()

  const inputRef = useRef(null)

  // Focus input when dialog opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isOpen])

  // Handle Escape key
  useEffect(() => {
    if (!isOpen) return

    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        cancel()
      }
    }

    const handleEnter = (e) => {
      if (e.key === 'Enter' && !error) {
        confirm()
      }
    }

    document.addEventListener('keydown', handleEscape)
    document.addEventListener('keydown', handleEnter)
    return () => {
      document.removeEventListener('keydown', handleEscape)
      document.removeEventListener('keydown', handleEnter)
    }
  }, [isOpen, cancel, confirm, error])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[10000] overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        {/* Background overlay */}
        <div
          className="fixed inset-0 transition-opacity bg-gray-500 bg-opacity-75"
          onClick={cancel}
          aria-hidden="true"
        />

        {/* Center modal */}
        <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
          <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
            <div className="sm:flex sm:items-start">
              <div className="mt-3 text-center sm:mt-0 sm:text-left w-full">
                <h3 className="text-lg leading-6 font-medium text-gray-900 mb-2">
                  {title}
                </h3>
                {message && (
                  <div className="mt-2 mb-4">
                    {typeof message === 'string' ? (
                      <p className="text-sm text-gray-500 whitespace-pre-line">{message}</p>
                    ) : (
                      message
                    )}
                  </div>
                )}
                <div>
                  <input
                    ref={inputRef}
                    type="text"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    placeholder={placeholder}
                    className={`mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm ${
                      error ? 'border-red-300 focus:border-red-500 focus:ring-red-500' : ''
                    }`}
                    aria-invalid={error ? 'true' : 'false'}
                    aria-describedby={error ? 'prompt-error' : undefined}
                  />
                  {error && (
                    <p id="prompt-error" className="mt-2 text-sm text-red-600">
                      {error}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
          <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse gap-3">
            <button
              type="button"
              onClick={confirm}
              disabled={!!error}
              className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-primary-600 text-base font-medium text-white hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed sm:ml-3 sm:w-auto sm:text-sm"
            >
              {confirmLabel}
            </button>
            <button
              type="button"
              onClick={cancel}
              className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
            >
              {cancelLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default PromptDialog

