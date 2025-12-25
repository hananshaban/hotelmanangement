import { useState, useMemo } from 'react'
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isToday, parseISO, isWithinInterval, addDays, startOfWeek, endOfWeek } from 'date-fns'
import Modal from '../components/Modal'
import StatusBadge from '../components/StatusBadge'
import GuestSelect from '../components/GuestSelect'
import useStore from '../store/useStore'

const CalendarPage = () => {
  const { reservations, rooms, guests, addReservation } = useStore()
  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedReservation, setSelectedReservation] = useState(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [newReservation, setNewReservation] = useState({
    guestId: '',
    guest2Id: '',
    roomNumber: '',
    checkIn: '',
    checkOut: '',
    status: 'Confirmed',
  })

  const monthStart = startOfMonth(currentDate)
  const monthEnd = endOfMonth(currentDate)
  const calendarStart = startOfWeek(monthStart)
  const calendarEnd = endOfWeek(monthEnd)
  const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd })

  const getReservationsForDate = (date) => {
    return reservations.filter((res) => {
      const checkIn = parseISO(res.checkIn)
      const checkOut = parseISO(res.checkOut)
      return isWithinInterval(date, { start: checkIn, end: checkOut })
    })
  }

  const handleDateClick = (date) => {
    const dateStr = format(date, 'yyyy-MM-dd')
    setNewReservation({
      ...newReservation,
      checkIn: dateStr,
      checkOut: format(addDays(date, 1), 'yyyy-MM-dd'),
    })
    setIsModalOpen(true)
  }

  const handleCreateReservation = () => {
    // Validation
    if (!newReservation.guestId || !newReservation.roomNumber || !newReservation.checkIn || !newReservation.checkOut) {
      alert('Please fill in all required fields')
      return
    }

    const checkIn = parseISO(newReservation.checkIn)
    const checkOut = parseISO(newReservation.checkOut)

    if (checkOut <= checkIn) {
      alert('Check-out date must be after check-in date')
      return
    }

    // Check for overlapping reservations
    const hasOverlap = reservations.some((res) => {
      if (res.roomNumber !== newReservation.roomNumber || res.status === 'Cancelled') return false
      const resCheckIn = parseISO(res.checkIn)
      const resCheckOut = parseISO(res.checkOut)
      return (
        (checkIn >= resCheckIn && checkIn < resCheckOut) ||
        (checkOut > resCheckIn && checkOut <= resCheckOut) ||
        (checkIn <= resCheckIn && checkOut >= resCheckOut)
      )
    })

    if (hasOverlap) {
      if (!confirm('Room already has a reservation during this period. Continue anyway?')) {
        return
      }
    }

    // Find guests and room
    const guest = guests.find((g) => String(g.id) === String(newReservation.guestId))
    const guest2 = newReservation.guest2Id ? guests.find((g) => String(g.id) === String(newReservation.guest2Id)) : null
    const room = rooms.find((r) => r.roomNumber === newReservation.roomNumber)

    if (!guest) {
      alert('Primary guest not found')
      return
    }

    if (!room) {
      alert('Room not found')
      return
    }

    // Validate second guest for double rooms
    if (room.type === 'Double' && !newReservation.guest2Id) {
      if (!confirm('Double room selected. Do you want to proceed with only one guest?')) {
        return
      }
    }

    // Calculate total amount
    const nights = Math.ceil((checkOut - checkIn) / (1000 * 60 * 60 * 24))
    const totalAmount = room.pricePerNight * nights

    // Create new reservation
    const newRes = {
      guestId: String(guest.id),
      guestName: guest.name,
      guestEmail: guest.email,
      guestPhone: guest.phone,
      roomNumber: newReservation.roomNumber,
      checkIn: newReservation.checkIn,
      checkOut: newReservation.checkOut,
      status: newReservation.status,
      totalAmount,
    }

    // Add second guest if provided
    if (guest2) {
      newRes.guest2Id = String(guest2.id)
      newRes.guest2Name = guest2.name
      newRes.guest2Email = guest2.email
      newRes.guest2Phone = guest2.phone
    }

    addReservation(newRes)
    setIsModalOpen(false)
    setNewReservation({
      guestId: '',
      guest2Id: '',
      roomNumber: '',
      checkIn: '',
      checkOut: '',
      status: 'Confirmed',
    })
  }

  const getStatusColor = (status) => {
    switch (status) {
      case 'Confirmed':
        return 'bg-blue-500'
      case 'Checked-in':
        return 'bg-green-500'
      case 'Checked-out':
        return 'bg-gray-500'
      case 'Cancelled':
        return 'bg-red-500'
      default:
        return 'bg-gray-500'
    }
  }

  const prevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1))
  }

  const nextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1))
  }

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Reservations Calendar</h1>
          <p className="text-gray-600 mt-2">View and manage reservations on the calendar</p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="btn btn-primary"
        >
          + New Reservation
        </button>
      </div>

      {/* Calendar Header */}
      <div className="card mb-6">
        <div className="flex items-center justify-between mb-6">
          <button onClick={prevMonth} className="btn btn-secondary">
            ← Previous
          </button>
          <h2 className="text-2xl font-bold text-gray-900">
            {format(currentDate, 'MMMM yyyy')}
          </h2>
          <button onClick={nextMonth} className="btn btn-secondary">
            Next →
          </button>
        </div>

        {/* Calendar Grid */}
        <div className="grid grid-cols-7 gap-2">
          {/* Day Headers */}
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
            <div key={day} className="text-center font-semibold text-gray-700 py-2">
              {day}
            </div>
          ))}

          {/* Calendar Days */}
          {days.map((day) => {
            const dayReservations = getReservationsForDate(day)
            const isCurrentMonth = isSameMonth(day, currentDate)
            const isTodayDate = isToday(day)

            return (
              <div
                key={day.toISOString()}
                className={`min-h-[100px] border rounded-lg p-2 cursor-pointer hover:bg-gray-50 transition-colors ${
                  !isCurrentMonth ? 'bg-gray-50 opacity-50' : 'bg-white'
                } ${isTodayDate ? 'ring-2 ring-primary-500' : ''}`}
                onClick={() => handleDateClick(day)}
              >
                <div className={`text-sm font-medium mb-1 ${isTodayDate ? 'text-primary-600' : 'text-gray-700'}`}>
                  {format(day, 'd')}
                </div>
                <div className="space-y-1">
                  {dayReservations.slice(0, 3).map((res) => (
                    <div
                      key={res.id}
                      className={`text-xs p-1 rounded text-white truncate ${getStatusColor(res.status)}`}
                      onClick={(e) => {
                        e.stopPropagation()
                        setSelectedReservation(res)
                      }}
                      title={`${res.guestName} - Room ${res.roomNumber}`}
                    >
                      {res.guestName} - {res.roomNumber}
                    </div>
                  ))}
                  {dayReservations.length > 3 && (
                    <div className="text-xs text-gray-500">
                      +{dayReservations.length - 3} more
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="card">
        <h3 className="font-semibold mb-3">Status Legend</h3>
        <div className="flex flex-wrap gap-4">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-blue-500 rounded"></div>
            <span className="text-sm">Confirmed</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-green-500 rounded"></div>
            <span className="text-sm">Checked-in</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-gray-500 rounded"></div>
            <span className="text-sm">Checked-out</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-red-500 rounded"></div>
            <span className="text-sm">Cancelled</span>
          </div>
        </div>
      </div>

      {/* Reservation Detail Modal */}
      {selectedReservation && (
        <Modal
          isOpen={!!selectedReservation}
          onClose={() => setSelectedReservation(null)}
          title="Reservation Details"
        >
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-700">Reservation ID</label>
              <p className="text-gray-900">{selectedReservation.id}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Guest Name</label>
              <p className="text-gray-900">{selectedReservation.guestName}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Room Number</label>
              <p className="text-gray-900">{selectedReservation.roomNumber}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Check-in</label>
              <p className="text-gray-900">
                {format(parseISO(selectedReservation.checkIn), 'MMM dd, yyyy')}
              </p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Check-out</label>
              <p className="text-gray-900">
                {format(parseISO(selectedReservation.checkOut), 'MMM dd, yyyy')}
              </p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Status</label>
              <div className="mt-1">
                <StatusBadge status={selectedReservation.status} type="reservation" />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Total Amount</label>
              <p className="text-gray-900">${selectedReservation.totalAmount?.toLocaleString() || '0'}</p>
            </div>
          </div>
        </Modal>
      )}

      {/* New Reservation Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false)
          setNewReservation({
            guestId: '',
            guest2Id: '',
            roomNumber: '',
            checkIn: '',
            checkOut: '',
            status: 'Confirmed',
          })
        }}
        title="Create New Reservation"
      >
        <div className="space-y-4">
          <GuestSelect
            value={newReservation.guestId}
            onChange={(guestId) => setNewReservation({ ...newReservation, guestId })}
            guests={guests}
            label="Primary Guest"
            placeholder="Search for a guest by name, email, or phone..."
          />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Room *
            </label>
            <select
              value={newReservation.roomNumber}
              onChange={(e) =>
                setNewReservation({ ...newReservation, roomNumber: e.target.value, guest2Id: '' })
              }
              className="input"
              required
            >
              <option value="">Select a room</option>
              {rooms.map((room) => (
                <option key={room.id} value={room.roomNumber}>
                  {room.roomNumber} - {room.type} (${room.pricePerNight}/night)
                </option>
              ))}
            </select>
          </div>
          {newReservation.roomNumber && (() => {
            const selectedRoom = rooms.find((r) => r.roomNumber === newReservation.roomNumber)
            return selectedRoom && selectedRoom.type === 'Double' ? (
              <GuestSelect
                value={newReservation.guest2Id}
                onChange={(guest2Id) => setNewReservation({ ...newReservation, guest2Id })}
                guests={guests.filter((g) => String(g.id) !== String(newReservation.guestId))}
                label="Second Guest (Optional)"
                placeholder="Search for a second guest by name, email, or phone..."
              />
            ) : null
          })()}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Check-in Date *
            </label>
            <input
              type="date"
              value={newReservation.checkIn}
              onChange={(e) =>
                setNewReservation({ ...newReservation, checkIn: e.target.value })
              }
              className="input"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Check-out Date *
            </label>
            <input
              type="date"
              value={newReservation.checkOut}
              onChange={(e) =>
                setNewReservation({ ...newReservation, checkOut: e.target.value })
              }
              className="input"
              min={newReservation.checkIn}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Status
            </label>
            <select
              value={newReservation.status}
              onChange={(e) =>
                setNewReservation({ ...newReservation, status: e.target.value })
              }
              className="input"
            >
              <option value="Confirmed">Confirmed</option>
              <option value="Checked-in">Checked-in</option>
              <option value="Checked-out">Checked-out</option>
              <option value="Cancelled">Cancelled</option>
            </select>
          </div>
          {newReservation.guestId && newReservation.roomNumber && newReservation.checkIn && newReservation.checkOut && (
            <div className="p-3 bg-gray-50 rounded-md">
              <div className="text-sm text-gray-600">
                <div>
                  <strong>Estimated Total:</strong>{' '}
                  {(() => {
                    const room = rooms.find((r) => r.roomNumber === newReservation.roomNumber)
                    if (!room) return '$0'
                    const checkIn = parseISO(newReservation.checkIn)
                    const checkOut = parseISO(newReservation.checkOut)
                    const nights = Math.ceil((checkOut - checkIn) / (1000 * 60 * 60 * 24))
                    return `$${(room.pricePerNight * nights).toLocaleString()} (${nights} night${nights !== 1 ? 's' : ''})`
                  })()}
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4">
            <button
              onClick={() => {
                setIsModalOpen(false)
                setNewReservation({
                  guestId: '',
                  guest2Id: '',
                  roomNumber: '',
                  checkIn: '',
                  checkOut: '',
                  status: 'Confirmed',
                })
              }}
              className="btn btn-secondary"
            >
              Cancel
            </button>
            <button onClick={handleCreateReservation} className="btn btn-primary">
              Create Reservation
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

export default CalendarPage

