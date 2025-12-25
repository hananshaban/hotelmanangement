import { useState, useMemo } from 'react'
import { format, parseISO, isWithinInterval, addDays } from 'date-fns'
import useStore from '../store/useStore'
import StatusBadge from '../components/StatusBadge'
import Modal from '../components/Modal'

const AvailabilityPage = () => {
  const { rooms, reservations, addReservation, guests } = useStore()
  const [checkIn, setCheckIn] = useState(format(addDays(new Date(), 1), 'yyyy-MM-dd'))
  const [checkOut, setCheckOut] = useState(format(addDays(new Date(), 2), 'yyyy-MM-dd'))
  const [roomType, setRoomType] = useState('')
  const [numGuests, setNumGuests] = useState(1)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [selectedRoom, setSelectedRoom] = useState(null)
  const [guestName, setGuestName] = useState('')

  const availableRooms = useMemo(() => {
    if (!checkIn || !checkOut) return []

    const checkInDate = parseISO(checkIn)
    const checkOutDate = parseISO(checkOut)

    if (checkOutDate <= checkInDate) return []

    return rooms.filter((room) => {
      // Filter by type
      if (roomType && room.type !== roomType) return false

      // Check if room is available (not out of service)
      if (room.status === 'Out of Service') return false

      // Check for overlapping reservations
      const hasConflict = reservations.some((res) => {
        if (res.status === 'Cancelled') return false
        if (res.roomNumber !== room.roomNumber) return false

        const resCheckIn = parseISO(res.checkIn)
        const resCheckOut = parseISO(res.checkOut)

        return (
          isWithinInterval(checkInDate, { start: resCheckIn, end: resCheckOut }) ||
          isWithinInterval(checkOutDate, { start: resCheckIn, end: resCheckOut }) ||
          (checkInDate <= resCheckIn && checkOutDate >= resCheckOut)
        )
      })

      return !hasConflict
    })
  }, [checkIn, checkOut, roomType, rooms, reservations])

  const handleBookRoom = (room) => {
    setSelectedRoom(room)
    setIsModalOpen(true)
  }

  const handleCreateReservation = () => {
    if (!guestName.trim()) {
      alert('Please enter guest name')
      return
    }

    const checkInDate = parseISO(checkIn)
    const checkOutDate = parseISO(checkOut)
    const nights = Math.ceil((checkOutDate - checkInDate) / (1000 * 60 * 60 * 24))
    const totalAmount = selectedRoom.pricePerNight * nights

    // Try to find guest
    const guest = guests.find((g) => g.name === guestName)

    const newReservation = {
      guestName,
      roomNumber: selectedRoom.roomNumber,
      checkIn,
      checkOut,
      status: 'Confirmed',
      totalAmount,
      guestEmail: guest?.email || '',
      guestPhone: guest?.phone || '',
      guestId: guest ? String(guest.id) : '',
    }

    addReservation(newReservation)
    setIsModalOpen(false)
    setGuestName('')
    setSelectedRoom(null)
    alert(`Reservation created successfully for ${selectedRoom.roomNumber}`)
  }

  const roomTypes = ['Single', 'Double', 'Suite']

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
            <select value={roomType} onChange={(e) => setRoomType(e.target.value)} className="input">
              <option value="">All Types</option>
              {roomTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Number of Guests</label>
            <input
              type="number"
              min="1"
              max="10"
              value={numGuests}
              onChange={(e) => setNumGuests(parseInt(e.target.value) || 1)}
              className="input"
            />
          </div>
        </div>
      </div>

      {/* Results */}
      <div className="card">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">
          Available Rooms ({availableRooms.length})
        </h2>

        {availableRooms.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            {!checkIn || !checkOut
              ? 'Please select check-in and check-out dates'
              : 'No rooms available for the selected dates'}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {availableRooms.map((room) => {
              const nights = Math.ceil(
                (parseISO(checkOut) - parseISO(checkIn)) / (1000 * 60 * 60 * 24)
              )
              const totalPrice = room.pricePerNight * nights

              return (
                <div key={room.id} className="border rounded-lg p-4 hover:shadow-md transition-shadow">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">Room {room.roomNumber}</h3>
                      <p className="text-sm text-gray-600">{room.type}</p>
                    </div>
                    <StatusBadge status={room.status} type="room" />
                  </div>

                  <div className="space-y-2 mb-4">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Price per night:</span>
                      <span className="font-medium">${room.pricePerNight}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Total ({nights} nights):</span>
                      <span className="font-semibold text-primary-600">${totalPrice}</span>
                    </div>
                    <div className="text-sm text-gray-600">
                      Floor: {room.floor} | Features: {room.features?.join(', ') || 'N/A'}
                    </div>
                  </div>

                  <button
                    onClick={() => handleBookRoom(room)}
                    className="w-full btn btn-primary"
                  >
                    Book Now
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
          setGuestName('')
          setSelectedRoom(null)
        }}
        title={`Book Room ${selectedRoom?.roomNumber}`}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Guest Name *</label>
            <input
              type="text"
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              className="input"
              placeholder="Enter guest name"
              required
            />
          </div>
          <div className="bg-gray-50 p-4 rounded-lg">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Room:</span>
                <span className="font-medium">{selectedRoom?.roomNumber} - {selectedRoom?.type}</span>
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
                <span className="text-gray-600">Total Amount:</span>
                <span className="font-semibold text-lg">
                  ${selectedRoom ? selectedRoom.pricePerNight * Math.ceil((parseISO(checkOut) - parseISO(checkIn)) / (1000 * 60 * 60 * 24)) : 0}
                </span>
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <button
              onClick={() => {
                setIsModalOpen(false)
                setGuestName('')
                setSelectedRoom(null)
              }}
              className="btn btn-secondary"
            >
              Cancel
            </button>
            <button onClick={handleCreateReservation} className="btn btn-primary">
              Confirm Booking
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

export default AvailabilityPage

