import { useState, useMemo, useEffect } from 'react'
import { format, parseISO, startOfWeek, endOfWeek, eachDayOfInterval, addDays, isWithinInterval, isSameDay } from 'date-fns'
import useReservationsStore from '../store/reservationsStore'
import useRoomTypesStore from '../store/roomTypesStore'
import useGuestsStore from '../store/guestsStore'
import GuestSelect from './GuestSelect'
import Modal from './Modal'
import { useToast } from '../hooks/useToast'
import { useConfirmation } from '../hooks/useConfirmation'

const BookingTimeline = () => {
  const { reservations, fetchReservations, createReservation } = useReservationsStore()
  const { roomTypes, fetchRoomTypes } = useRoomTypesStore()
  const { guests, fetchGuests } = useGuestsStore()
  const toast = useToast()
  const confirmation = useConfirmation()
  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedSlot, setSelectedSlot] = useState(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [newReservation, setNewReservation] = useState({
    guestId: '',
    guest2Id: '',
    roomTypeId: '',
    unitIndex: null, // Which unit (0-based index) within the room type
    checkIn: '',
    checkOut: '',
    status: 'Confirmed',
    unitsRequested: 1,
  })

  // Fetch data on mount
  useEffect(() => {
    fetchReservations()
    fetchRoomTypes()
    fetchGuests()
  }, [fetchReservations, fetchRoomTypes, fetchGuests])

  // Generate flat list of all individual rooms from room types
  const allRooms = useMemo(() => {
    const rooms = []
    roomTypes.forEach((roomType) => {
      // Create one row for each unit in the room type
      for (let i = 0; i < roomType.qty; i++) {
        rooms.push({
          id: `${roomType.id}-unit-${i}`,
          roomTypeId: roomType.id,
          roomTypeName: roomType.name,
          roomType: roomType.roomType,
          unitIndex: i,
          unitNumber: i + 1,
          totalUnits: roomType.qty,
          pricePerNight: roomType.pricePerNight,
          maxPeople: roomType.maxPeople,
        })
      }
    })
    return rooms
  }, [roomTypes])

  const weekStart = startOfWeek(currentDate, { weekStartsOn: 0 })
  const weekEnd = endOfWeek(currentDate, { weekStartsOn: 0 })
  const days = eachDayOfInterval({ start: weekStart, end: weekEnd })

  // Get reservations for a specific room unit
  const getReservationsForRoom = (roomTypeId, unitIndex) => {
    const unitId = `${roomTypeId}-unit-${unitIndex}`
    return reservations.filter((res) => {
      if (res.status === 'Cancelled') return false
      if (res.roomTypeId !== roomTypeId) return false
      
      // If reservation has assigned_unit_id, only show on that specific unit
      if (res.assignedUnitId) {
        return res.assignedUnitId === unitId
      }
      
      // If no assigned_unit_id (legacy/unassigned reservation), show on first available unit
      // This handles old reservations and CM bookings that don't specify a unit
      // We'll show unassigned reservations on unit 0 (first unit)
      if (unitIndex === 0) {
        return true
      }
      
      return false
    })
  }

  const getReservationForSlot = (roomTypeId, unitIndex, date) => {
    const roomReservations = getReservationsForRoom(roomTypeId, unitIndex)
    return roomReservations.find((res) => {
      const checkIn = parseISO(res.checkIn)
      const checkOut = parseISO(res.checkOut)
      return isWithinInterval(date, { start: checkIn, end: checkOut })
    })
  }

  const handleSlotDoubleClick = (room, date) => {
    setSelectedSlot({ room, date })
    setNewReservation({
      guestId: '',
      guest2Id: '',
      roomTypeId: room.roomTypeId,
      unitIndex: room.unitIndex,
      checkIn: format(date, 'yyyy-MM-dd'),
      checkOut: format(addDays(date, 1), 'yyyy-MM-dd'),
      status: 'Confirmed',
      unitsRequested: 1,
    })
    setIsModalOpen(true)
  }

  const handleCreateReservation = async () => {
    if (!newReservation.guestId || !newReservation.roomTypeId || !newReservation.checkIn || !newReservation.checkOut) {
      toast.error('Please fill in all required fields')
      return
    }

    const checkInDate = parseISO(newReservation.checkIn)
    const checkOutDate = parseISO(newReservation.checkOut)

    if (checkOutDate <= checkInDate) {
      toast.error('Check-out date must be after check-in date')
      return
    }

    const guest = guests.find((g) => String(g.id) === String(newReservation.guestId))
    const guest2 = newReservation.guest2Id ? guests.find((g) => String(g.id) === String(newReservation.guest2Id)) : null

    if (!guest) {
      toast.error('Guest not found')
      return
    }

    const roomType = roomTypes.find((rt) => rt.id === newReservation.roomTypeId)
    if (!roomType) {
      toast.error('Room type not found')
      return
    }

    // Check for overlapping reservations (availability check)
    // Count reserved units for the date range
    const overlappingReservations = reservations.filter((res) => {
      if (res.roomTypeId !== newReservation.roomTypeId || res.status === 'Cancelled') return false
      const resCheckIn = parseISO(res.checkIn)
      const resCheckOut = parseISO(res.checkOut)
      return (
        (checkInDate >= resCheckIn && checkInDate < resCheckOut) ||
        (checkOutDate > resCheckIn && checkOutDate <= resCheckOut) ||
        (checkInDate <= resCheckIn && checkOutDate >= resCheckOut)
      )
    })
    
    const totalReservedUnits = overlappingReservations.reduce((sum, res) => sum + (res.unitsRequested || 1), 0)
    const requestedUnits = newReservation.unitsRequested || 1
    
    let force = false
    if (totalReservedUnits + requestedUnits > roomType.qty) {
      const confirmed = await confirmation({
        title: 'Not Enough Available Units',
        message: 'Not enough available units during this period. Continue anyway?',
        variant: 'warning',
      })
      if (!confirmed) {
        return
      }
      force = true
    }

    try {
      // Create assigned_unit_id from roomTypeId and unitIndex
      const assignedUnitId = newReservation.unitIndex !== null 
        ? `${newReservation.roomTypeId}-unit-${newReservation.unitIndex}`
        : undefined

      await createReservation({
        roomTypeId: newReservation.roomTypeId,
        assignedUnitId: assignedUnitId,
        unitsRequested: newReservation.unitsRequested || 1,
        primary_guest_id: String(guest.id),
        secondary_guest_id: guest2 ? String(guest2.id) : undefined,
        check_in: newReservation.checkIn,
        check_out: newReservation.checkOut,
        status: newReservation.status,
        force,
      })

      setIsModalOpen(false)
      setNewReservation({ guestId: '', guest2Id: '', roomTypeId: '', unitIndex: null, checkIn: '', checkOut: '', status: 'Confirmed', unitsRequested: 1 })
      setSelectedSlot(null)
      toast.success('Reservation created successfully!')
    } catch (error) {
      toast.error(error.message || 'Failed to create reservation')
    }
  }

  const getStatusColor = (status) => {
    switch (status) {
      case 'Confirmed':
        return 'bg-blue-500'
      case 'Checked-in':
        return 'bg-green-500'
      case 'Checked-out':
        return 'bg-gray-500'
      default:
        return 'bg-gray-400'
    }
  }

  const prevWeek = () => {
    setCurrentDate(addDays(currentDate, -7))
  }

  const nextWeek = () => {
    setCurrentDate(addDays(currentDate, 7))
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Booking Timeline</h2>
          <p className="text-gray-600 mt-1">Double-click on empty slots to create reservations</p>
        </div>
        <div className="flex gap-2">
          <button onClick={prevWeek} className="btn btn-secondary">
            ← Previous Week
          </button>
          <button onClick={nextWeek} className="btn btn-secondary">
            Next Week →
          </button>
        </div>
      </div>

      <div className="card overflow-x-auto">
        <div className="min-w-full">
          {/* Header with dates */}
          <div className="flex border-b">
            <div className="w-48 p-3 font-semibold text-gray-700 border-r sticky left-0 bg-white z-10">
              Room
            </div>
            {days.map((day) => (
              <div
                key={day.toISOString()}
                className="flex-1 min-w-[120px] p-3 text-center border-r last:border-r-0"
              >
                <div className="text-sm font-medium text-gray-700">
                  {format(day, 'EEE')}
                </div>
                <div className="text-xs text-gray-500">{format(day, 'MMM dd')}</div>
              </div>
            ))}
          </div>

          {/* Rows for each individual room */}
          {allRooms.map((room) => {
            const roomType = roomTypes.find((rt) => rt.id === room.roomTypeId)
            
            return (
              <div key={room.id} className="flex border-b last:border-b-0 hover:bg-gray-50">
                {/* Room name column */}
                <div className="w-48 p-3 border-r sticky left-0 bg-white z-10">
                  <div className="font-medium text-gray-900">
                    {room.roomTypeName} #{room.unitNumber}
                  </div>
                  <div className="text-xs text-gray-500">
                    {room.roomType} • {room.totalUnits} total
                  </div>
                </div>

                {/* Day cells */}
                {days.map((day) => {
                  const reservation = getReservationForSlot(room.roomTypeId, room.unitIndex, day)
                  const isCheckIn = reservation && isSameDay(parseISO(reservation.checkIn), day)
                  const isCheckOut = reservation && isSameDay(parseISO(reservation.checkOut), day)

                  return (
                    <div
                      key={day.toISOString()}
                      className="flex-1 min-w-[120px] border-r last:border-r-0 relative"
                      onDoubleClick={() => !reservation && handleSlotDoubleClick(room, day)}
                      style={{ cursor: reservation ? 'default' : 'pointer' }}
                    >
                      {reservation ? (
                        <div
                          className={`h-full p-2 text-white text-xs ${getStatusColor(
                            reservation.status
                          )} flex items-center justify-between`}
                          title={`${reservation.guestName} - ${reservation.unitsRequested || 1} unit(s) - ${reservation.id}`}
                        >
                          <span className="truncate">{reservation.guestName}</span>
                          <div className="flex items-center gap-1">
                            {reservation.unitsRequested > 1 && (
                              <span className="text-xs">×{reservation.unitsRequested}</span>
                            )}
                            {isCheckIn && <span>📥</span>}
                            {isCheckOut && <span>📤</span>}
                          </div>
                        </div>
                      ) : (
                        <div className="h-full p-2 hover:bg-blue-50 transition-colors">
                          <div className="text-xs text-gray-400 text-center">Available</div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          })}
          
          {allRooms.length === 0 && (
            <div className="flex border-b">
              <div className="w-full p-8 text-center text-gray-500">
                No rooms available. Please add room types in the Room Types section.
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Legend */}
      <div className="card mt-4">
        <h3 className="font-semibold mb-3">Legend</h3>
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
            <div className="w-4 h-4 bg-blue-50 border border-gray-300 rounded"></div>
            <span className="text-sm">Available (double-click to book)</span>
          </div>
        </div>
      </div>

      {/* Create Reservation Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false)
          setNewReservation({ guestId: '', guest2Id: '', roomTypeId: '', unitIndex: null, checkIn: '', checkOut: '', status: 'Confirmed', unitsRequested: 1 })
          setSelectedSlot(null)
        }}
        title="Create Reservation"
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
            <label className="block text-sm font-medium text-gray-700 mb-1">Room</label>
            <input
              type="text"
              value={
                newReservation.roomTypeId
                  ? (() => {
                      const roomType = roomTypes.find((rt) => rt.id === newReservation.roomTypeId)
                      return roomType
                        ? `${roomType.name} #${(newReservation.unitIndex || 0) + 1}`
                        : 'Room'
                    })()
                  : ''
              }
              disabled
              className="input bg-gray-50"
            />
          </div>
          {newReservation.roomTypeId && (() => {
            const selectedRoomType = roomTypes.find((rt) => rt.id === newReservation.roomTypeId)
            return selectedRoomType ? (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Units Requested</label>
                  <input
                    type="number"
                    min="1"
                    max={selectedRoomType.qty}
                    value={newReservation.unitsRequested || 1}
                    onChange={(e) => setNewReservation({ ...newReservation, unitsRequested: parseInt(e.target.value) || 1 })}
                    className="input"
                  />
                  <div className="text-xs text-gray-500 mt-1">
                    Available: {selectedRoomType.qty} unit{selectedRoomType.qty !== 1 ? 's' : ''}
                  </div>
                </div>
                {selectedRoomType.maxPeople && selectedRoomType.maxPeople >= 2 && (
                  <GuestSelect
                    value={newReservation.guest2Id}
                    onChange={(guest2Id) => setNewReservation({ ...newReservation, guest2Id })}
                    guests={guests.filter((g) => String(g.id) !== String(newReservation.guestId))}
                    label="Second Guest (Optional)"
                    placeholder="Search for a second guest by name, email, or phone..."
                  />
                )}
              </>
            ) : null
          })()}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Check-in Date *</label>
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
            <label className="block text-sm font-medium text-gray-700 mb-1">Check-out Date *</label>
            <input
              type="date"
              value={newReservation.checkOut}
              onChange={(e) =>
                setNewReservation({ ...newReservation, checkOut: e.target.value })
              }
              min={newReservation.checkIn}
              className="input"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
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
          <div className="flex justify-end gap-3 pt-4">
            <button
              onClick={() => {
                setIsModalOpen(false)
                setNewReservation({ guestId: '', guest2Id: '', roomTypeId: '', unitIndex: null, checkIn: '', checkOut: '', status: 'Confirmed', unitsRequested: 1 })
                setSelectedSlot(null)
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

export default BookingTimeline

