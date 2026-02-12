import { useState, useMemo, useEffect, useRef } from 'react'
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isToday, parseISO, isWithinInterval, addDays, startOfWeek, endOfWeek } from 'date-fns'
import Modal from '../components/Modal'
import StatusBadge from '../components/StatusBadge'
import GuestSelect from '../components/GuestSelect'
import useReservationsStore from '../store/reservationsStore'
import useRoomsStore from '../store/roomsStore'
import useRoomTypesStore from '../store/roomTypesStore'
import useGuestsStore from '../store/guestsStore'
import { useToast } from '../hooks/useToast'
import { useConfirmation } from '../hooks/useConfirmation'

const CalendarPage = () => {
  const { reservations, fetchReservations, createReservation } = useReservationsStore()
  const { rooms, fetchRooms } = useRoomsStore()
  const { getAvailableRoomTypes } = useRoomTypesStore()
  const { guests, fetchGuests } = useGuestsStore()
  const toast = useToast()
  const confirmation = useConfirmation()
  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedReservation, setSelectedReservation] = useState(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  
  // Use ref to access latest isModalOpen value without including it in useEffect deps
  const isModalOpenRef = useRef(isModalOpen)
  
  // Update ref when isModalOpen changes
  useEffect(() => {
    isModalOpenRef.current = isModalOpen
  }, [isModalOpen])
  
  // Booking flow state (cm-style) - 2 steps only
  const [bookingStep, setBookingStep] = useState(1) // 1: Dates + Room Type + Room, 2: Guest
  const [checkIn, setCheckIn] = useState('')
  const [checkOut, setCheckOut] = useState('')
  const [availableRoomTypes, setAvailableRoomTypes] = useState([])
  const [loadingAvailability, setLoadingAvailability] = useState(false)
  const [selectedRoomType, setSelectedRoomType] = useState(null)
  const [availableRooms, setAvailableRooms] = useState([])
  const [selectedRoom, setSelectedRoom] = useState(null)
  const [selectedUnit, setSelectedUnit] = useState(null) // Unit index (0-based) or null for auto-assign
  const [unitsRequested, setUnitsRequested] = useState(1)
  const [numGuests, setNumGuests] = useState(1)
  const [guestName, setGuestName] = useState('') // For creating new guest
  const [guest2Name, setGuest2Name] = useState('') // For creating second guest
  
  const [newReservation, setNewReservation] = useState({
    guestId: '',
    guest2Id: '',
    roomId: '',
    roomTypeId: '',
    assignedUnitId: '',
    checkIn: '',
    checkOut: '',
    status: 'Confirmed',
  })

  // Fetch data on mount
  useEffect(() => {
    fetchReservations()
    fetchRooms()
    fetchGuests()
  }, [fetchReservations, fetchRooms, fetchGuests])

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
    setCheckIn(dateStr)
    setCheckOut(format(addDays(date, 1), 'yyyy-MM-dd'))
    setIsModalOpen(true)
  }

  // Check availability when dates change
  useEffect(() => {
    // Early return if dates are invalid or modal is closed
    if (!checkIn || !checkOut || !isModalOpenRef.current) {
      setAvailableRoomTypes([])
      return
    }

    // Validate date strings are not empty and have valid format
    if (checkIn.trim() === '' || checkOut.trim() === '') {
      setAvailableRoomTypes([])
      return
    }

    const checkInDate = parseISO(checkIn)
    const checkOutDate = parseISO(checkOut)

    // Validate parsed dates are valid
    if (isNaN(checkInDate.getTime()) || isNaN(checkOutDate.getTime())) {
      setAvailableRoomTypes([])
      return
    }

    if (checkOutDate <= checkInDate) {
      setAvailableRoomTypes([])
      return
    }

    let isCancelled = false

    const checkAvailability = async () => {
      setLoadingAvailability(true)
      try {
        const available = await getAvailableRoomTypes(checkIn, checkOut, {
          num_guests: numGuests,
          units_requested: unitsRequested,
        })
        
        if (!isCancelled && isModalOpenRef.current) {
          setAvailableRoomTypes(available || [])
          if (available?.length === 0) {
            toast.info('No rooms available for selected dates')
          }
        }
      } catch (error) {
        if (!isCancelled && isModalOpenRef.current) {
          console.error('Error checking availability:', error)
          toast.error('Failed to check room availability')
          setAvailableRoomTypes([])
        }
      } finally {
        if (!isCancelled) {
          setLoadingAvailability(false)
        }
      }
    }

    const timeoutId = setTimeout(checkAvailability, 300)
    
    return () => {
      isCancelled = true
      clearTimeout(timeoutId)
    }
  }, [checkIn, checkOut, numGuests, unitsRequested, getAvailableRoomTypes])

  // Fetch available rooms when room type is selected
  useEffect(() => {
    if (!selectedRoomType || !checkIn || !checkOut) {
      setAvailableRooms([])
      return
    }

    const fetchRoomsForType = async () => {
      try {
        const roomsForType = rooms.filter((r) => {
          if (r.roomTypeId !== selectedRoomType.room_type_id) return false
          
          const hasConflict = reservations.some((res) => {
            if (res.roomId !== r.id || res.status === 'Cancelled') return false
            const resCheckIn = parseISO(res.checkIn)
            const resCheckOut = parseISO(res.checkOut)
            const newCheckIn = parseISO(checkIn)
            const newCheckOut = parseISO(checkOut)
            
            return (
              (newCheckIn >= resCheckIn && newCheckIn < resCheckOut) ||
              (newCheckOut > resCheckIn && newCheckOut <= resCheckOut) ||
              (newCheckIn <= resCheckIn && newCheckOut >= resCheckOut)
            )
          })
          
          return !hasConflict
        })
        
        setAvailableRooms(roomsForType)
      } catch (error) {
        console.error('Error fetching rooms:', error)
        setAvailableRooms([])
      }
    }

    fetchRoomsForType()
  }, [selectedRoomType, checkIn, checkOut, rooms, reservations])

  const handleNextStep = () => {
    if (bookingStep === 1) {
      // Validate step 1
      if (!selectedRoomType) {
        toast.error('Please select a room type')
        return
      }

      // Prepare for step 2
      setNewReservation({
        ...newReservation,
        roomTypeId: selectedRoomType.room_type_id,
        roomId: selectedRoom?.id || '',
        checkIn,
        checkOut,
        assignedUnitId: selectedUnit !== null 
          ? `${selectedRoomType.room_type_id}-unit-${selectedUnit}`
          : '',
      })
      setBookingStep(2)
    }
  }

  const handleBackStep = () => {
    if (bookingStep === 2) {
      setBookingStep(1)
    }
  }

  const handleCreateReservation = async () => {
    // Validation - guest is now optional
    if ((!newReservation.roomId && !newReservation.roomTypeId) || !newReservation.checkIn || !newReservation.checkOut) {
      toast.error('Please complete all required fields')
      return
    }

    const checkInDate = parseISO(newReservation.checkIn)
    const checkOutDate = parseISO(newReservation.checkOut)

    if (checkOutDate <= checkInDate) {
      toast.error('Check-out date must be after check-in date')
      return
    }

    // Handle guest creation or selection
    let guestId = newReservation.guestId
    let guest2Id = newReservation.guest2Id

    // If guest name is provided but no guest is selected, create a new guest
    if (!guestId && guestName && guestName.trim()) {
      try {
        const newGuest = await useGuestsStore.getState().createGuest({ name: guestName.trim() })
        guestId = String(newGuest.id)
        setNewReservation({ ...newReservation, guestId })
      } catch (error) {
        toast.error('Failed to create new guest')
        return
      }
    }

    // If second guest name is provided but no guest is selected, create a new guest
    if (!guest2Id && guest2Name && guest2Name.trim()) {
      try {
        const newGuest = await useGuestsStore.getState().createGuest({ name: guest2Name.trim() })
        guest2Id = String(newGuest.id)
        setNewReservation({ ...newReservation, guest2Id })
      } catch (error) {
        toast.error('Failed to create second guest')
        return
      }
    }

    // Validate second guest for double rooms
    if (selectedRoom?.type === 'Double' && !newReservation.guest2Id) {
      const confirmed = await confirmation({
        title: 'Double Room Selected',
        message: 'Double room selected but no second guest provided. Continue with one guest?',
        variant: 'warning',
      })
      if (!confirmed) {
        return
      }
    }

    // Check for overlapping reservations (only if specific room selected)
    let force = false
    if (newReservation.roomId) {
      const hasOverlap = reservations.some((res) => {
        if (res.roomId !== newReservation.roomId || res.status === 'Cancelled') return false
        const resCheckIn = parseISO(res.checkIn)
        const resCheckOut = parseISO(res.checkOut)
        return (
          (checkInDate >= resCheckIn && checkInDate < resCheckOut) ||
          (checkOutDate > resCheckIn && checkOutDate <= resCheckOut) ||
          (checkInDate <= resCheckIn && checkOutDate >= resCheckOut)
        )
      })

      if (hasOverlap) {
        const confirmed = await confirmation({
          title: 'Overlapping Reservation',
          message: 'Room already has a reservation during this period. Continue anyway?',
          variant: 'warning',
        })
        if (!confirmed) {
          return
        }
        force = true
      }
    }

    try {
      await createReservation({
        roomId: newReservation.roomId || undefined,
        roomTypeId: newReservation.roomTypeId,
        assignedUnitId: newReservation.assignedUnitId || undefined,
        guestId: guestId || undefined,
        guest2Id: guest2Id || undefined,
        checkIn: newReservation.checkIn,
        checkOut: newReservation.checkOut,
        status: newReservation.status,
        unitsRequested,
        force,
      })

      resetModal()
      toast.success('Reservation created successfully!')
    } catch (error) {
      toast.error(error.message || 'Failed to create reservation')
    }
  }

  const resetModal = () => {
    setIsModalOpen(false)
    setBookingStep(1)
    setCheckIn('')
    setCheckOut('')
    setSelectedRoomType(null)
    setSelectedRoom(null)
    setSelectedUnit(null)
    setAvailableRoomTypes([])
    setAvailableRooms([])
    setUnitsRequested(1)
    setNumGuests(1)
    setNewReservation({
      guestId: '',
      guest2Id: '',
      roomId: '',
      roomTypeId: '',
      assignedUnitId: '',
      checkIn: '',
      checkOut: '',
      status: 'Confirmed',
    })
    setGuestName('')
    setGuest2Name('')
  }

  // Reset selected unit when room type changes
  useEffect(() => {
    if (selectedRoomType) {
      setSelectedUnit(null)
    }
  }, [selectedRoomType])

  const getStatusColor = (status) => {
    switch (status) {
      case 'Confirmed':
        return 'bg-blue-500'
      case 'Checked-in':
        return 'bg-green-500'
      case 'Checked-out':
        return 'bg-gray-500 dark:bg-gray-400'
      case 'Cancelled':
        return 'bg-red-500'
      default:
        return 'bg-gray-500 dark:bg-gray-400'
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
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Reservations Calendar</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">View and manage reservations on the calendar</p>
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
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
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
            <div key={day} className="text-center font-semibold text-gray-700 dark:text-gray-300 py-2">
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
                className={`min-h-[100px] border rounded-lg p-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ${
                  !isCurrentMonth ? 'bg-gray-50 dark:bg-gray-700 opacity-50' : 'bg-white dark:bg-gray-800'
                } ${isTodayDate ? 'ring-2 ring-primary-500' : ''}`}
                onClick={() => handleDateClick(day)}
              >
                <div className={`text-sm font-medium mb-1 ${isTodayDate ? 'text-primary-600' : 'text-gray-700 dark:text-gray-300'}`}>
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
                    <div className="text-xs text-gray-500 dark:text-gray-400">
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
            <div className="w-4 h-4 bg-gray-500 dark:bg-gray-400 rounded"></div>
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
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Reservation ID</label>
              <p className="text-gray-900 dark:text-gray-100">{selectedReservation.id}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Guest Name</label>
              <p className="text-gray-900 dark:text-gray-100">{selectedReservation.guestName}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Room Number</label>
              <p className="text-gray-900 dark:text-gray-100">{selectedReservation.roomNumber}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Check-in</label>
              <p className="text-gray-900 dark:text-gray-100">
                {format(parseISO(selectedReservation.checkIn), 'MMM dd, yyyy')}
              </p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Check-out</label>
              <p className="text-gray-900 dark:text-gray-100">
                {format(parseISO(selectedReservation.checkOut), 'MMM dd, yyyy')}
              </p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Status</label>
              <div className="mt-1">
                <StatusBadge status={selectedReservation.status} type="reservation" />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Total Amount</label>
              <p className="text-gray-900 dark:text-gray-100">${selectedReservation.totalAmount?.toLocaleString() || '0'}</p>
            </div>
          </div>
        </Modal>
      )}

      {/* New Reservation Modal - 2-Step Flow */}
      <Modal
        isOpen={isModalOpen}
        onClose={resetModal}
        title="Create New Reservation"
      >
        <div className="space-y-6">
          {/* Progress Steps */}
          <div className="flex items-center justify-center mb-6">
            <div className={`flex items-center ${bookingStep >= 1 ? 'text-primary-600' : 'text-gray-400'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${bookingStep >= 1 ? 'bg-primary-600 text-white' : 'bg-gray-200'}`}>
                1
              </div>
              <span className="ml-2 text-sm font-medium">Dates & Room</span>
            </div>
            <div className={`flex-1 h-0.5 mx-4 max-w-xs ${bookingStep >= 2 ? 'bg-primary-600' : 'bg-gray-200'}`} />
            <div className={`flex items-center ${bookingStep >= 2 ? 'text-primary-600' : 'text-gray-400'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${bookingStep >= 2 ? 'bg-primary-600 text-white' : 'bg-gray-200'}`}>
                2
              </div>
              <span className="ml-2 text-sm font-medium">Guest Details</span>
            </div>
          </div>

          {/* Step 1: Dates + Room Type + Unit Selection */}
          {bookingStep === 1 && (
            <div className="space-y-6">
              {/* Date Selection */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Check-in Date *
                  </label>
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
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Check-out Date *
                  </label>
                  <input
                    type="date"
                    value={checkOut}
                    onChange={(e) => setCheckOut(e.target.value)}
                    min={checkIn || format(new Date(), 'yyyy-MM-dd')}
                    className="input"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Number of Guests
                  </label>
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
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Units Requested
                  </label>
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

              {/* Room Type Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Select Room Type *
                </label>
                {loadingAvailability ? (
                  <div className="text-center py-8 text-gray-500 dark:text-gray-400 border rounded-lg">Checking availability...</div>
                ) : availableRoomTypes.length === 0 ? (
                  <div className="text-center py-8 text-gray-500 dark:text-gray-400 border rounded-lg">
                    {checkIn && checkOut 
                      ? 'No room types available for the selected dates. Please try different dates.'
                      : 'Please select check-in and check-out dates to see available room types'}
                  </div>
                ) : (
                  <div className="space-y-3 max-h-64 overflow-y-auto border rounded-lg p-3">
                    {availableRoomTypes.map((roomType) => {
                      const nights = Math.ceil(
                        (parseISO(checkOut).getTime() - parseISO(checkIn).getTime()) / (1000 * 60 * 60 * 24)
                      )
                      const totalPrice = roomType.price_per_night * nights * unitsRequested
                      const isSelected = selectedRoomType?.room_type_id === roomType.room_type_id

                      return (
                        <div
                          key={roomType.room_type_id}
                          onClick={() => setSelectedRoomType(roomType)}
                          className={`border-2 rounded-lg p-4 cursor-pointer transition-all ${
                            isSelected
                              ? 'border-primary-600 bg-primary-50'
                              : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-md'
                          }`}
                        >
                          <div className="flex justify-between items-start mb-2">
                            <div>
                              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{roomType.room_type_name}</h3>
                              <p className="text-sm text-gray-600 dark:text-gray-400 capitalize">{roomType.room_type}</p>
                            </div>
                            <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                              roomType.available_units >= unitsRequested
                                ? 'bg-green-100 text-green-800'
                                : 'bg-red-100 text-red-800'
                            }`}>
                              {roomType.available_units}/{roomType.total_units} available
                            </span>
                          </div>
                          <div className="space-y-1 text-sm">
                            <div className="flex justify-between">
                              <span className="text-gray-600 dark:text-gray-400">Price per night:</span>
                              <span className="font-medium">${roomType.price_per_night.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-600 dark:text-gray-400">Total ({nights} nights, {unitsRequested} unit{unitsRequested > 1 ? 's' : ''}):</span>
                              <span className="font-semibold text-primary-600">${totalPrice.toFixed(2)}</span>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Unit Selection */}
              {selectedRoomType && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Select Specific Unit (Optional)
                  </label>
                  <div className="p-3 bg-blue-50 border border-blue-200 rounded-md mb-3">
                    <p className="text-sm text-blue-800">
                      You can select a specific unit (1-{selectedRoomType.total_units}) or continue with auto-assignment.
                    </p>
                  </div>
                  {(() => {
                    const totalUnits = selectedRoomType.total_units || 1
                    const units = []
                    
                    for (let unitIndex = 0; unitIndex < totalUnits; unitIndex++) {
                      const unitId = `${selectedRoomType.room_type_id}-unit-${unitIndex}`
                      const isAvailable = !reservations.some((res) => {
                        if (res.assignedUnitId !== unitId || res.status === 'Cancelled') return false
                        const resCheckIn = parseISO(res.checkIn)
                        const resCheckOut = parseISO(res.checkOut)
                        const newCheckIn = parseISO(checkIn)
                        const newCheckOut = parseISO(checkOut)
                        return (
                          (newCheckIn >= resCheckIn && newCheckIn < resCheckOut) ||
                          (newCheckOut > resCheckIn && newCheckOut <= resCheckOut) ||
                          (newCheckIn <= resCheckIn && newCheckOut >= resCheckOut)
                        )
                      })
                      
                      units.push({
                        unitIndex,
                        unitNumber: unitIndex + 1,
                        available: isAvailable,
                      })
                    }
                    
                    return (
                      <div className="space-y-2 max-h-48 overflow-y-auto border rounded-lg p-3">
                        <div
                          onClick={() => setSelectedUnit(null)}
                          className={`border-2 rounded-lg p-3 cursor-pointer transition-all ${
                            selectedUnit === null
                              ? 'border-primary-600 bg-primary-50'
                              : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                          }`}
                        >
                          <div className="flex justify-between items-center">
                            <span className="font-medium">Auto-assign (Recommended)</span>
                            <span className="text-sm text-gray-600 dark:text-gray-400">System will assign best available unit</span>
                          </div>
                        </div>
                        {units.map((unit) => (
                          <div
                            key={unit.unitIndex}
                            onClick={() => unit.available && setSelectedUnit(unit.unitIndex)}
                            className={`border-2 rounded-lg p-3 cursor-pointer transition-all ${
                              !unit.available
                                ? 'border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-700 opacity-50 cursor-not-allowed'
                                : selectedUnit === index
                                ? 'border-primary-500 bg-primary-50'
                                : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                            }`}
                          >
                            <div className="flex justify-between items-center">
                              <div>
                                <span className="font-medium">Unit #{unit.unitNumber}</span>
                                {!unit.available && (
                                  <span className="text-sm text-red-600 ml-2">(Unavailable)</span>
                                )}
                              </div>
                              {unit.available && (
                                <span className="text-sm text-green-600 font-medium">Available</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )
                  })()}
                </div>
              )}

              <div className="flex justify-end gap-3 pt-4 border-t">
                <button onClick={resetModal} className="btn btn-secondary">
                  Cancel
                </button>
                <button
                  onClick={handleNextStep}
                  className="btn btn-primary"
                  disabled={!selectedRoomType || (selectedRoomType && selectedRoomType.available_units < unitsRequested)}
                >
                  {selectedRoomType && selectedRoomType.available_units < unitsRequested
                    ? 'Not Enough Units'
                    : 'Next: Guest Details'}
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Guest Selection */}
          {bookingStep === 2 && (
            <div className="space-y-4">
              <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded-md">
                <div className="text-sm space-y-1">
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Room Type:</span>
                    <span className="font-medium">{selectedRoomType?.room_type_name}</span>
                  </div>
                  {selectedUnit !== null && (
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Unit:</span>
                      <span className="font-medium">#{selectedUnit + 1}</span>
                    </div>
                  )}
                  {selectedUnit === null && (
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Unit:</span>
                      <span className="font-medium text-gray-500 dark:text-gray-400">Auto-assign</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Check-in:</span>
                    <span className="font-medium">{format(parseISO(checkIn), 'MMM dd, yyyy')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Check-out:</span>
                    <span className="font-medium">{format(parseISO(checkOut), 'MMM dd, yyyy')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Units:</span>
                    <span className="font-medium">{unitsRequested}</span>
                  </div>
                  <div className="flex justify-between pt-2 border-t border-gray-200 dark:border-gray-700">
                    <span className="text-gray-900 dark:text-gray-100 font-medium">Total Amount:</span>
                    <span className="font-semibold text-lg text-primary-600">
                      ${(() => {
                        const nights = Math.ceil(
                          (parseISO(checkOut).getTime() - parseISO(checkIn).getTime()) / (1000 * 60 * 60 * 24)
                        )
                        const price = selectedRoom?.pricePerNight || selectedRoomType?.price_per_night || 0
                        return (price * nights * unitsRequested).toFixed(2)
                      })()}
                    </span>
                  </div>
                </div>
              </div>

              <GuestSelect
                value={newReservation.guestId}
                onChange={(guestId) => setNewReservation({ ...newReservation, guestId })}
                guests={guests}
                label="Primary Guest *"
                placeholder="Search for a guest by name, email, or phone..."
              />

              {(selectedRoom?.type === 'Double' || selectedRoomType?.room_type?.toLowerCase() === 'double') && (
                <GuestSelect
                  value={newReservation.guest2Id}
                  onChange={(guest2Id) => {
                    setNewReservation({ ...newReservation, guest2Id })
                    if (guest2Id) {
                      setGuest2Name('')
                    }
                  }}
                  guests={guests.filter((g) => String(g.id) !== String(newReservation.guestId))}
                  label="Second Guest (Optional)"
                  placeholder="Search for a second guest or type a name to create new..."
                  required={false}
                  onCreateGuest={async (name) => {
                    try {
                      const newGuest = await useGuestsStore.getState().createGuest({ name: name.trim() })
                      setNewReservation({ ...newReservation, guest2Id: String(newGuest.id) })
                      setGuest2Name('')
                      toast.success('Guest created successfully!')
                    } catch (error) {
                      toast.error('Failed to create guest')
                    }
                  }}
                  guestName={guest2Name}
                  onGuestNameChange={setGuest2Name}
                />
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Status *
                </label>
                <select
                  value={newReservation.status}
                  onChange={(e) =>
                    setNewReservation({ ...newReservation, status: e.target.value })
                  }
                  className="input"
                  required
                >
                  <option value="Confirmed">Confirmed</option>
                  <option value="Checked-in">Checked-in</option>
                  <option value="Checked-out">Checked-out</option>
                  <option value="Cancelled">Cancelled</option>
                </select>
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <button onClick={handleBackStep} className="btn btn-secondary">
                  Back
                </button>
                <button
                  onClick={handleCreateReservation}
                  className="btn btn-primary"
                >
                  Create Reservation
                </button>
              </div>
            </div>
          )}
        </div>
      </Modal>
    </div>
  )
}

export default CalendarPage

