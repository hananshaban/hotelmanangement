import { useState, useMemo, useEffect } from 'react'
import { format, parseISO, addDays } from 'date-fns'
import useReservationsStore from '../store/reservationsStore'
import useRoomTypesStore from '../store/roomTypesStore'
import useGuestsStore from '../store/guestsStore'
import { api } from '../utils/api'
import StatusBadge from '../components/StatusBadge'
import GuestSelect from '../components/GuestSelect'
import Modal from '../components/Modal'
import { useToast } from '../hooks/useToast'

const AvailabilityPage = () => {
  const { createReservation } = useReservationsStore()
  const { getAvailableRoomTypes } = useRoomTypesStore()
  const { guests, fetchGuests } = useGuestsStore()
  const toast = useToast()
  const [checkIn, setCheckIn] = useState(format(addDays(new Date(), 1), 'yyyy-MM-dd'))
  const [checkOut, setCheckOut] = useState(format(addDays(new Date(), 2), 'yyyy-MM-dd'))
  const [roomTypeFilter, setRoomTypeFilter] = useState('')
  const [numGuests, setNumGuests] = useState(1)
  const [unitsRequested, setUnitsRequested] = useState(1)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [selectedRoomType, setSelectedRoomType] = useState(null)
  const [guestId, setGuestId] = useState('')
  const [guest2Id, setGuest2Id] = useState('')
  const [availableRoomTypes, setAvailableRoomTypes] = useState([])
  const [loading, setLoading] = useState(false)

  // Fetch data on mount
  useEffect(() => {
    fetchGuests()
  }, [fetchGuests])

  // Check availability when dates change
  useEffect(() => {
    const checkRoomTypeAvailability = async () => {
      if (!checkIn || !checkOut) {
        setAvailableRoomTypes([])
        return
      }

      const checkInDate = parseISO(checkIn)
      const checkOutDate = parseISO(checkOut)

      if (checkOutDate <= checkInDate) {
        setAvailableRoomTypes([])
        return
      }

      setLoading(true)
      try {
        const result = await getAvailableRoomTypes(checkIn, checkOut, {
          room_type: roomTypeFilter || undefined,
          max_people: numGuests > 0 ? numGuests : undefined,
          units_requested: unitsRequested,
        })

        // Extract room_types from result (already transformed by store)
        let filtered = result.room_types || []

        setAvailableRoomTypes(filtered)
      } catch (error) {
        console.error('Error checking availability:', error)
        setAvailableRoomTypes([])
      } finally {
        setLoading(false)
      }
    }

    const timeoutId = setTimeout(checkRoomTypeAvailability, 300) // Debounce
    return () => clearTimeout(timeoutId)
  }, [checkIn, checkOut, roomTypeFilter, numGuests, unitsRequested])

  const handleBookRoomType = (roomType) => {
    setSelectedRoomType(roomType)
    setIsModalOpen(true)
  }

  const handleCreateReservation = async () => {
    if (!guestId) {
      toast.error('Please select a guest')
      return
    }

    const checkInDate = parseISO(checkIn)
    const checkOutDate = parseISO(checkOut)

    if (checkOutDate <= checkInDate) {
      toast.error('Check-out date must be after check-in date')
      return
    }

    const guest = guests.find((g) => String(g.id) === String(guestId))
    const guest2 = guest2Id ? guests.find((g) => String(g.id) === String(guest2Id)) : null

    if (!guest) {
      toast.error('Guest not found')
      return
    }

    if (!selectedRoomType) {
      toast.error('Room type not found')
      return
    }

    try {
      await createReservation({
        room_type_id: selectedRoomType.room_type_id,
        units_requested: unitsRequested,
        guestId: String(guest.id),
        guest2Id: guest2 ? String(guest2.id) : undefined,
        checkIn,
        checkOut,
        status: 'Confirmed',
      })

      setIsModalOpen(false)
      setGuestId('')
      setGuest2Id('')
      setSelectedRoomType(null)
      toast.success(`Reservation created successfully for ${selectedRoomType.room_type_name}`)
      
      // Refresh availability
      const result = await api.roomTypes.getAvailable(checkIn, checkOut, {
        room_type: roomTypeFilter || undefined,
        max_people: numGuests > 0 ? numGuests : undefined,
        units_requested: unitsRequested,
      })
      setAvailableRoomTypes(result.room_types || [])
    } catch (error) {
      toast.error(error.message || 'Failed to create reservation')
    }
  }

  const beds24RoomTypeOptions = [
    { value: '', label: 'All Types' },
    { value: 'single', label: 'Single' },
    { value: 'double', label: 'Double' },
    { value: 'twin', label: 'Twin' },
    { value: 'twinDouble', label: 'Twin Double' },
    { value: 'triple', label: 'Triple' },
    { value: 'quadruple', label: 'Quadruple' },
    { value: 'apartment', label: 'Apartment' },
    { value: 'family', label: 'Family' },
    { value: 'suite', label: 'Suite' },
    { value: 'studio', label: 'Studio' },
  ]

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Room Availability</h1>
        <p className="text-gray-600 mt-2">Search for available rooms by date and preferences</p>
      </div>

      {/* Search Filters */}
      <div className="card mb-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Check-in Date *</label>
            <input
              type="date"
              value={checkIn}
              onChange={(e) => setCheckIn(e.target.value)}
              min={format(new Date(), 'yyyy-MM-dd')}
              className="input"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Check-out Date *</label>
            <input
              type="date"
              value={checkOut}
              onChange={(e) => setCheckOut(e.target.value)}
              min={checkIn || format(new Date(), 'yyyy-MM-dd')}
              className="input"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Room Type</label>
            <select value={roomTypeFilter} onChange={(e) => setRoomTypeFilter(e.target.value)} className="input">
              {beds24RoomTypeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Number of Guests</label>
            <input
              type="number"
              min="1"
              max="20"
              value={numGuests}
              onChange={(e) => setNumGuests(parseInt(e.target.value) || 1)}
              className="input"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Units Requested</label>
            <input
              type="number"
              min="1"
              max="10"
              value={unitsRequested}
              onChange={(e) => setUnitsRequested(parseInt(e.target.value) || 1)}
              className="input"
            />
          </div>
        </div>
      </div>

      {/* Results */}
      <div className="card">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">
          Available Room Types ({availableRoomTypes.length})
        </h2>

        {loading ? (
          <div className="text-center py-12 text-gray-500">Checking availability...</div>
        ) : availableRoomTypes.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            {!checkIn || !checkOut
              ? 'Please select check-in and check-out dates'
              : 'No room types available for the selected dates'}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {availableRoomTypes.map((roomType) => {
              const nights = Math.ceil(
                (parseISO(checkOut).getTime() - parseISO(checkIn).getTime()) / (1000 * 60 * 60 * 24)
              )
              const totalPrice = roomType.price_per_night * nights * unitsRequested

              return (
                <div key={roomType.room_type_id} className="border rounded-lg p-4 hover:shadow-md transition-shadow">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">{roomType.room_type_name}</h3>
                      <p className="text-sm text-gray-600 capitalize">{roomType.room_type}</p>
                    </div>
                    <span className="px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800">
                      {roomType.available_units}/{roomType.total_units} available
                    </span>
                  </div>

                  <div className="space-y-2 mb-4">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Price per night:</span>
                      <span className="font-medium">${roomType.price_per_night.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Total ({nights} nights, {unitsRequested} unit{unitsRequested > 1 ? 's' : ''}):</span>
                      <span className="font-semibold text-primary-600">${totalPrice.toFixed(2)}</span>
                    </div>
                    <div className="text-sm text-gray-600">
                      Available: {roomType.available_units} / {roomType.total_units} units
                    </div>
                  </div>

                  <button
                    onClick={() => handleBookRoomType(roomType)}
                    className="w-full btn btn-primary"
                    disabled={roomType.available_units < unitsRequested}
                  >
                    {roomType.available_units >= unitsRequested ? 'Book Now' : 'Not Enough Units'}
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Booking Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false)
          setGuestId('')
          setGuest2Id('')
          setSelectedRoomType(null)
        }}
        title={`Book ${selectedRoomType?.room_type_name || 'Room Type'}`}
      >
        <div className="space-y-4">
          <GuestSelect
            value={guestId}
            onChange={setGuestId}
            guests={guests}
            label="Primary Guest"
            placeholder="Search for a guest by name, email, or phone..."
          />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Units Requested
            </label>
            <input
              type="number"
              min="1"
              max={selectedRoomType?.available_units || 1}
              value={unitsRequested}
              onChange={(e) => setUnitsRequested(parseInt(e.target.value) || 1)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="mt-1 text-sm text-gray-500">
              Available: {selectedRoomType?.available_units || 0} units
            </p>
          </div>
          <div className="bg-gray-50 p-4 rounded-lg">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Room Type:</span>
                <span className="font-medium">{selectedRoomType?.room_type_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Check-in:</span>
                <span className="font-medium">{format(parseISO(checkIn), 'MMM dd, yyyy')}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Check-out:</span>
                <span className="font-medium">{format(parseISO(checkOut), 'MMM dd, yyyy')}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Units:</span>
                <span className="font-medium">{unitsRequested}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Total Amount:</span>
                <span className="font-semibold text-lg">
                  ${selectedRoomType ? (selectedRoomType.price_per_night * Math.ceil((parseISO(checkOut).getTime() - parseISO(checkIn).getTime()) / (1000 * 60 * 60 * 24)) * unitsRequested).toFixed(2) : '0.00'}
                </span>
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <button
              onClick={() => {
                setIsModalOpen(false)
                setGuestId('')
                setGuest2Id('')
                setSelectedRoomType(null)
              }}
              className="btn btn-secondary"
            >
              Cancel
            </button>
            <button 
              onClick={handleCreateReservation} 
              className="btn btn-primary"
              disabled={!selectedRoomType || selectedRoomType.available_units < unitsRequested}
            >
              Confirm Booking
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

export default AvailabilityPage

