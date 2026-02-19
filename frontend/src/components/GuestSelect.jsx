import { useState, useRef, useEffect, useMemo } from 'react'
import GuestFormModal from './GuestFormModal'

const GuestSelect = ({ 
  value, 
  onChange, 
  guests, 
  placeholder = 'Search for a guest or type a name to create new...', 
  label = 'Guest',
  required = false,
  onCreateGuest,
  guestName,
  onGuestNameChange
}) => {
  const [isOpen, setIsOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [isGuestModalOpen, setIsGuestModalOpen] = useState(false)
  const [modalInitialName, setModalInitialName] = useState('')
  const dropdownRef = useRef(null)
  const inputRef = useRef(null)

  const selectedGuest = value ? guests.find((g) => String(g.id) === String(value)) : null

  const filteredGuests = useMemo(() => {
    if (!searchTerm.trim()) return guests
    const term = searchTerm.toLowerCase()
    return guests.filter(
      (guest) =>
        guest.name.toLowerCase().includes(term) ||
        guest.email?.toLowerCase().includes(term) ||
        guest.phone?.toLowerCase().includes(term)
    )
  }, [guests, searchTerm])

  // Check if search term matches any existing guest
  const hasExactMatch = useMemo(() => {
    if (!searchTerm.trim()) return false
    const term = searchTerm.toLowerCase().trim()
    return guests.some(
      (guest) => guest.name.toLowerCase().trim() === term
    )
  }, [guests, searchTerm])

  // Check if we should show "Create new guest" option in dropdown
  const showCreateOption = useMemo(() => {
    // Show create option when user has typed something and onCreateGuest is available
    return searchTerm.trim().length > 0 && !!onCreateGuest
  }, [searchTerm, onCreateGuest])

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false)
        // Don't clear searchTerm if we're using guestName prop
        if (!guestName) {
          setSearchTerm('')
        }
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [guestName])

  const handleSelect = (guest) => {
    onChange(String(guest.id))
    setIsOpen(false)
    setSearchTerm('')
    if (onGuestNameChange) {
      onGuestNameChange('')
    }
  }

  const handleGuestModalSubmit = (guestData) => {
    if (onCreateGuest) {
      onCreateGuest(guestData)
    }
    setIsGuestModalOpen(false)
    setSearchTerm('')
    if (onGuestNameChange) {
      onGuestNameChange('')
    }
  }

  const handleGuestModalClose = () => {
    setIsGuestModalOpen(false)
    setSearchTerm('')
    if (onGuestNameChange) {
      onGuestNameChange('')
    }
  }

  const handleClear = () => {
    onChange('')
    setSearchTerm('')
    if (onGuestNameChange) {
      onGuestNameChange('')
    }
    setIsOpen(false)
  }

  const handleCreateNewGuest = () => {
    if (onCreateGuest && searchTerm.trim()) {
      setModalInitialName(searchTerm.trim())
      setIsGuestModalOpen(true)
      setIsOpen(false)
    }
  }

  // Use guestName prop if provided, otherwise use selectedGuest name or searchTerm
  const displayValue = guestName || (isOpen ? searchTerm : (selectedGuest?.name || ''))

  return (
    <div className="relative" ref={dropdownRef}>
      {label && (
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
      )}
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={displayValue}
          onChange={(e) => {
            const newValue = e.target.value
            setSearchTerm(newValue)
            if (onGuestNameChange) {
              onGuestNameChange(newValue)
            }
            if (!isOpen) setIsOpen(true)
            // Clear selected guest if user starts typing
            if (value && newValue !== selectedGuest?.name) {
              onChange('')
            }
          }}
          onFocus={() => {
            setIsOpen(true)
            if (!value) {
              setSearchTerm('')
            }
          }}
          placeholder={placeholder}
          className="input w-full pr-10"
        />
        {value && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute inset-y-0 right-8 flex items-center pr-2 text-gray-400 hover:text-gray-600"
            title="Clear selection"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
        <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
          <svg
            className="h-5 w-5 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </div>
      </div>

      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-auto">
          {!required && (
            <button
              type="button"
              onClick={handleClear}
              className="w-full text-left px-4 py-2 hover:bg-gray-100 focus:bg-gray-100 focus:outline-none border-b border-gray-200"
            >
              <div className="font-medium text-gray-600">No guest (optional)</div>
            </button>
          )}
          {filteredGuests.length > 0 && (
            <>
              {filteredGuests.map((guest) => (
                <button
                  key={guest.id}
                  type="button"
                  onClick={() => handleSelect(guest)}
                  className="w-full text-left px-4 py-2 hover:bg-gray-100 focus:bg-gray-100 focus:outline-none"
                >
                  <div className="font-medium text-gray-900">{guest.name}</div>
                  <div className="text-sm text-gray-500">
                    {guest.email || 'No email'} • {guest.phone || 'No phone'}
                  </div>
                </button>
              ))}
              {showCreateOption && (
                <div className="border-t border-gray-200">
                  <button
                    type="button"
                    onClick={handleCreateNewGuest}
                    className="w-full text-left px-4 py-2 hover:bg-blue-50 focus:bg-blue-50 focus:outline-none"
                  >
                    <div className="flex items-center gap-2">
                      <svg
                        className="h-5 w-5 text-blue-600"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 4v16m8-8H4"
                        />
                      </svg>
                      <div>
                        <div className="font-medium text-blue-600">
                          Create new guest: "{searchTerm.trim()}"
                        </div>
                        <div className="text-sm text-gray-500">Click to create a new guest</div>
                      </div>
                    </div>
                  </button>
                </div>
              )}
            </>
          )}
          {filteredGuests.length === 0 && (
            <>
              {showCreateOption ? (
                <button
                  type="button"
                  onClick={handleCreateNewGuest}
                  className="w-full text-left px-4 py-2 hover:bg-blue-50 focus:bg-blue-50 focus:outline-none"
                >
                  <div className="flex items-center gap-2">
                    <svg
                      className="h-5 w-5 text-blue-600"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 4v16m8-8H4"
                      />
                    </svg>
                    <div>
                      <div className="font-medium text-blue-600">
                        Create new guest: "{searchTerm.trim()}"
                      </div>
                      <div className="text-sm text-gray-500">No matching guests found. Click to create a new guest.</div>
                    </div>
                  </div>
                </button>
              ) : (
                <div className="px-4 py-3 text-sm text-gray-500">
                  No guests found
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Guest Form Modal */}
      <GuestFormModal
        isOpen={isGuestModalOpen}
        onClose={handleGuestModalClose}
        onSubmit={handleGuestModalSubmit}
        initialName={modalInitialName}
        existingGuests={guests}
      />
    </div>
  )
}

export default GuestSelect

