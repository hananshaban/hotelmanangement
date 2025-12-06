import { useState, useRef, useEffect, useMemo } from 'react'

const GuestSelect = ({ value, onChange, guests, placeholder = 'Search for a guest...', label = 'Guest' }) => {
  const [isOpen, setIsOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const dropdownRef = useRef(null)
  const inputRef = useRef(null)

  const selectedGuest = guests.find((g) => String(g.id) === String(value))

  const filteredGuests = useMemo(() => {
    if (!searchTerm.trim()) return guests
    const term = searchTerm.toLowerCase()
    return guests.filter(
      (guest) =>
        guest.name.toLowerCase().includes(term) ||
        guest.email.toLowerCase().includes(term) ||
        guest.phone.toLowerCase().includes(term)
    )
  }, [guests, searchTerm])

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false)
        setSearchTerm('')
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleSelect = (guest) => {
    onChange(String(guest.id))
    setIsOpen(false)
    setSearchTerm('')
  }

  return (
    <div className="relative" ref={dropdownRef}>
      {label && (
        <label className="block text-sm font-medium text-gray-700 mb-1">{label} *</label>
      )}
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={isOpen ? searchTerm : selectedGuest?.name || ''}
          onChange={(e) => {
            setSearchTerm(e.target.value)
            if (!isOpen) setIsOpen(true)
          }}
          onFocus={() => {
            setIsOpen(true)
            setSearchTerm('')
          }}
          placeholder={placeholder}
          className="input w-full pr-10"
        />
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
          {filteredGuests.length === 0 ? (
            <div className="px-4 py-3 text-sm text-gray-500">No guests found</div>
          ) : (
            filteredGuests.map((guest) => (
              <button
                key={guest.id}
                type="button"
                onClick={() => handleSelect(guest)}
                className="w-full text-left px-4 py-2 hover:bg-gray-100 focus:bg-gray-100 focus:outline-none"
              >
                <div className="font-medium text-gray-900">{guest.name}</div>
                <div className="text-sm text-gray-500">
                  {guest.email} • {guest.phone}
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}

export default GuestSelect

