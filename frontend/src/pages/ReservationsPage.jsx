import { useState, useMemo, useEffect, useRef } from 'react'
import { format, parseISO, compareAsc, addDays } from 'date-fns'
import StatusBadge from '../components/StatusBadge'
import SearchInput from '../components/SearchInput'
import FilterSelect from '../components/FilterSelect'
import Modal from '../components/Modal'
import GuestSelect from '../components/GuestSelect'
import useReservationsStore from '../store/reservationsStore'
import useRoomsStore from '../store/roomsStore'
import useRoomTypesStore from '../store/roomTypesStore'
import useGuestsStore from '../store/guestsStore'
import useInvoicesStore from '../store/invoicesStore'
import { useToast } from '../hooks/useToast'
import { useConfirmation } from '../hooks/useConfirmation'
import { api } from '../utils/api'

const ReservationsPage = () => {
  const { rooms, fetchRooms } = useRoomsStore()
  const { getAvailableRoomTypes } = useRoomTypesStore()
  const { guests, fetchGuests } = useGuestsStore()
  const { createInvoice } = useInvoicesStore()
  const toast = useToast()
  const confirmation = useConfirmation()
  const {
    reservations,
    loading: reservationsLoading,
    error: reservationsError,
    fetchReservations,
    createReservation,
  } = useReservationsStore()
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [sortBy, setSortBy] = useState('createdAt')
  const [sortOrder, setSortOrder] = useState('desc')
  const [isModalOpen, setIsModalOpen] = useState(false)
  // Use ref to access latest isModalOpen value without including it in useEffect deps
  const isModalOpenRef = useRef(isModalOpen)
  
  // Update ref when isModalOpen changes
  useEffect(() => {
    isModalOpenRef.current = isModalOpen
  }, [isModalOpen])
  
  // Booking flow state (beds24-style) - 2 steps only
  const [bookingStep, setBookingStep] = useState(1) // 1: Dates + Room Type + Room, 2: Guest
  const [checkIn, setCheckIn] = useState(format(addDays(new Date(), 1), 'yyyy-MM-dd'))
  const [checkOut, setCheckOut] = useState(format(addDays(new Date(), 2), 'yyyy-MM-dd'))
  const [availableRoomTypes, setAvailableRoomTypes] = useState([])
  const [loadingAvailability, setLoadingAvailability] = useState(false)
  const [selectedRoomType, setSelectedRoomType] = useState(null)
  const [availableRooms, setAvailableRooms] = useState([])
  const [selectedRoom, setSelectedRoom] = useState(null)
  const [unitsRequested, setUnitsRequested] = useState(1)
  const [numGuests, setNumGuests] = useState(1)
  
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

  // Fetch reservations, guests, and rooms on mount
  useEffect(() => {
    fetchReservations()
    fetchGuests()
    fetchRooms()
  }, [fetchReservations, fetchGuests, fetchRooms])

  // Check availability when dates change - runs immediately when dates are valid
  useEffect(() => {
    // Early return if dates are invalid
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

    // Abort controller for cleanup
    let isCancelled = false

    const checkAvailability = async () => {
      setLoadingAvailability(true)
      try {
        const result = await getAvailableRoomTypes(checkIn, checkOut, {
          max_people: numGuests > 0 ? numGuests : undefined,
          units_requested: unitsRequested,
        })
        
        // Only update state if effect hasn't been cancelled (e.g., dates changed during request)
        if (!isCancelled) {
          // Handle both possible response structures
          const roomTypes = result?.room_types || result || []
          setAvailableRoomTypes(Array.isArray(roomTypes) ? roomTypes : [])
        }
      } catch (error) {
        console.error('Error checking availability:', error)
        // Only update state and show error if effect hasn't been cancelled
        if (!isCancelled) {
          setAvailableRoomTypes([])
          // Only show error toast if modal is open and user is actively using it
          // Use ref to get latest value without including in dependencies
          if (isModalOpenRef.current) {
            toast.error('Failed to check room availability')
          }
        }
      } finally {
        if (!isCancelled) {
          setLoadingAvailability(false)
        }
      }
    }

    // Debounce the API call
    const timeoutId = setTimeout(checkAvailability, 300)
    
    // Cleanup function
    return () => {
      isCancelled = true
      clearTimeout(timeoutId)
    }
    // Only include actual data dependencies that affect the availability check
    // Exclude toast and isModalOpen as they don't affect the API call logic
    // getAvailableRoomTypes is stable from Zustand store, but we include it for completeness
  }, [checkIn, checkOut, numGuests, unitsRequested, getAvailableRoomTypes])

  // Fetch available rooms when room type is selected - runs immediately when room type is selected
  useEffect(() => {
    if (!selectedRoomType || !checkIn || !checkOut) {
      setAvailableRooms([])
      return
    }

    const fetchRoomsForType = async () => {
      try {
        // Get rooms that match the selected room type
        // Match by room_type_id (UUID), room_type name, or legacy type
        const roomsForType = rooms.filter((room) => {
          const roomTypeMatch = room.roomType === selectedRoomType.room_type_id || 
                               room.roomType === selectedRoomType.room_type ||
                               room.roomType?.toLowerCase() === selectedRoomType.room_type?.toLowerCase()
          const legacyTypeMatch = room.type?.toLowerCase() === selectedRoomType.room_type?.toLowerCase()
          return roomTypeMatch || legacyTypeMatch
        })
        
        // Check availability for each room
        const availableRoomsList = []
        for (const room of roomsForType) {
          try {
            const availability = await api.reservations.checkAvailability({
              check_in: checkIn,
              check_out: checkOut,
              room_id: room.id,
            })
            
            if (availability.available) {
              availableRoomsList.push({
                ...room,
                available: true,
              })
            }
          } catch (error) {
            console.error(`Error checking availability for room ${room.roomNumber}:`, error)
          }
        }
        
        setAvailableRooms(availableRoomsList)
      } catch (error) {
        console.error('Error fetching rooms:', error)
        // Don't show error toast - it's okay if no specific rooms are available
        // User can still proceed with auto-assignment
        setAvailableRooms([])
      }
    }

    fetchRoomsForType()
  }, [selectedRoomType, checkIn, checkOut, rooms])

  const filteredAndSortedReservations = useMemo(() => {
    let filtered = reservations.filter((res) => {
      const matchesSearch =
        res.guestName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        res.roomNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
        res.id.toLowerCase().includes(searchTerm.toLowerCase())
      const matchesStatus = !statusFilter || res.status === statusFilter
      return matchesSearch && matchesStatus
    })

    // Sort
    filtered.sort((a, b) => {
      let comparison = 0
      if (sortBy === 'checkIn') {
        comparison = compareAsc(parseISO(a.checkIn), parseISO(b.checkIn))
      } else if (sortBy === 'checkOut') {
        comparison = compareAsc(parseISO(a.checkOut), parseISO(b.checkOut))
      } else if (sortBy === 'guestName') {
        comparison = a.guestName.localeCompare(b.guestName)
      } else if (sortBy === 'createdAt') {
        const dateA = a.createdAt ? parseISO(a.createdAt) : parseISO(a.checkIn)
        const dateB = b.createdAt ? parseISO(b.createdAt) : parseISO(b.checkIn)
        comparison = compareAsc(dateA, dateB)
      } else if (sortBy === 'totalAmount') {
        comparison = (a.totalAmount || 0) - (b.totalAmount || 0)
      } else if (sortBy === 'roomNumber') {
        comparison = a.roomNumber.localeCompare(b.roomNumber)
      } else if (sortBy === 'id') {
        comparison = a.id.localeCompare(b.id)
      }
      return sortOrder === 'desc' ? -comparison : comparison
    })

    return filtered
  }, [searchTerm, statusFilter, sortBy, reservations])

  const handleCreateInvoice = async (reservation) => {
    // Find guest by name or ID
    const guest = guests.find(
      (g) => g.name === reservation.guestName || String(g.id) === String(reservation.guestId)
    )

    if (!guest) {
      toast.error('Guest not found. Please ensure the guest exists in the system.')
      return
    }

    const today = new Date()
    const dueDate = addDays(today, 30) // 30 days from today

    try {
      await createInvoice({
        reservationId: reservation.id,
        guestId: String(guest.id),
        issueDate: format(today, 'yyyy-MM-dd'),
        dueDate: format(dueDate, 'yyyy-MM-dd'),
        amount: reservation.totalAmount || 0,
        status: 'Pending',
        notes: `Invoice for reservation ${reservation.id}`,
      })

      toast.success(`Invoice created successfully for reservation ${reservation.id}`)
    } catch (error) {
      toast.error(error.message || 'Failed to create invoice')
    }
  }

  const handleNextStep = () => {
    if (bookingStep === 1) {
      // Validate dates
      const checkInDate = parseISO(checkIn)
      const checkOutDate = parseISO(checkOut)
      if (checkOutDate <= checkInDate) {
        toast.error('Check-out date must be after check-in date')
        return
      }
      
      // Validate room type selection
      if (!selectedRoomType) {
        toast.error('Please select a room type')
        return
      }
      
      // Room selection is optional (can use auto-assign)
      // Update reservation with selected data
      setNewReservation({
        ...newReservation,
        checkIn,
        checkOut,
        roomId: selectedRoom?.id,
        roomTypeId: selectedRoomType?.room_type_id,
        assignedUnitId: selectedRoom ? `${selectedRoomType?.room_type_id}-unit-${selectedRoom.id}` : undefined,
      })
      
      setBookingStep(2)
    }
  }

  const handleBackStep = () => {
    if (bookingStep === 2) {
      setBookingStep(1)
    }
  }

  const handleAddReservation = async () => {
    // Validation
    if (!newReservation.guestId || (!newReservation.roomId && !newReservation.roomTypeId) || !newReservation.checkIn || !newReservation.checkOut) {
      toast.error('Please fill in all required fields')
      return
    }

    const checkInDate = parseISO(newReservation.checkIn)
    const checkOutDate = parseISO(newReservation.checkOut)

    if (checkOutDate <= checkInDate) {
      toast.error('Check-out date must be after check-in date')
      return
    }

    // Find guests
    const guest = guests.find((g) => String(g.id) === String(newReservation.guestId))
    const guest2 = newReservation.guest2Id ? guests.find((g) => String(g.id) === String(newReservation.guest2Id)) : null

    if (!guest) {
      toast.error('Primary guest not found')
      return
    }

    // Validate second guest for double rooms
    if (selectedRoom?.type === 'Double' && !newReservation.guest2Id) {
      const confirmed = await confirmation({
        title: 'Double Room Selected',
        message: 'Double room selected. Do you want to proceed with only one guest?',
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
      // Create reservation via API
      await createReservation({
        roomId: newReservation.roomId,
        roomTypeId: newReservation.roomTypeId,
        assignedUnitId: newReservation.assignedUnitId,
        unitsRequested: unitsRequested,
        guestId: String(guest.id),
        guest2Id: guest2 ? String(guest2.id) : undefined,
        checkIn: newReservation.checkIn,
        checkOut: newReservation.checkOut,
        status: newReservation.status,
        force,
      })

      // Reset all state
      setIsModalOpen(false)
      setBookingStep(1)
      setCheckIn(format(addDays(new Date(), 1), 'yyyy-MM-dd'))
      setCheckOut(format(addDays(new Date(), 2), 'yyyy-MM-dd'))
      setSelectedRoomType(null)
      setSelectedRoom(null)
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
      toast.success('Reservation created successfully!')
    } catch (error) {
      toast.error(error.message || 'Failed to create reservation')
    }
  }

  const resetModal = () => {
    setIsModalOpen(false)
    setBookingStep(1)
    setCheckIn(format(addDays(new Date(), 1), 'yyyy-MM-dd'))
    setCheckOut(format(addDays(new Date(), 2), 'yyyy-MM-dd'))
    setSelectedRoomType(null)
    setSelectedRoom(null)
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
  }

  // Reset selected room when room type changes
  useEffect(() => {
    if (selectedRoomType) {
      // Clear selected room when room type changes to allow fresh selection
      const currentRoomTypeId = selectedRoomType?.room_type_id
      if (selectedRoom && selectedRoom.roomType !== currentRoomTypeId) {
        setSelectedRoom(null)
      }
    }
  }, [selectedRoomType, selectedRoom])

  const statusOptions = [
    { value: 'Confirmed', label: 'Confirmed' },
    { value: 'Checked-in', label: 'Checked-in' },
    { value: 'Checked-out', label: 'Checked-out' },
    { value: 'Cancelled', label: 'Cancelled' },
  ]

  const handleSort = (column) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(column)
      setSortOrder('desc')
    }
  }

  const SortIcon = ({ column }) => {
    if (sortBy !== column) return <span className="text-gray-400">↕</span>
    return sortOrder === 'asc' ? <span>↑</span> : <span>↓</span>
  }

  const sortOptions = [
    { value: 'checkIn', label: 'Check-in Date' },
    { value: 'checkOut', label: 'Check-out Date' },
    { value: 'guestName', label: 'Guest Name' },
  ]

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Reservations</h1>
          <p className="text-gray-600 mt-2">View and manage all hotel reservations</p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="btn btn-primary"
        >
          + Add Reservation
        </button>
      </div>

      {/* Filters */}
      <div className="card mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <SearchInput
            value={searchTerm}
            onChange={setSearchTerm}
            placeholder="Search by guest, room, or ID..."
            label="Search"
          />
          <FilterSelect
            value={statusFilter}
            onChange={setStatusFilter}
            options={statusOptions}
            placeholder="All Statuses"
            label="Status"
          />
        </div>
      </div>

      {/* Error message */}
      {reservationsError && (
        <div className="mb-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative" role="alert">
          <span className="block sm:inline">{reservationsError}</span>
        </div>
      )}

      {/* Loading state */}
      {reservationsLoading && (
        <div className="mb-4 text-center text-gray-600">Loading reservations...</div>
      )}

      {/* Reservations Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th 
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('id')}
                >
                  <div className="flex items-center gap-1">
                    Reservation ID
                    <SortIcon column="id" />
                  </div>
                </th>
                <th 
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('guestName')}
                >
                  <div className="flex items-center gap-1">
                    Guest Name
                    <SortIcon column="guestName" />
                  </div>
                </th>
                <th 
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('roomNumber')}
                >
                  <div className="flex items-center gap-1">
                    Room
                    <SortIcon column="roomNumber" />
                  </div>
                </th>
                <th 
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('checkIn')}
                >
                  <div className="flex items-center gap-1">
                    Check-in
                    <SortIcon column="checkIn" />
                  </div>
                </th>
                <th 
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('checkOut')}
                >
                  <div className="flex items-center gap-1">
                    Check-out
                    <SortIcon column="checkOut" />
                  </div>
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th 
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('totalAmount')}
                >
                  <div className="flex items-center gap-1">
                    Total Amount
                    <SortIcon column="totalAmount" />
                  </div>
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredAndSortedReservations.map((reservation) => (
                <tr key={reservation.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">{reservation.id}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">{reservation.guestName}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">{reservation.roomNumber}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      {format(parseISO(reservation.checkIn), 'MMM dd, yyyy')}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      {format(parseISO(reservation.checkOut), 'MMM dd, yyyy')}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <StatusBadge status={reservation.status} type="reservation" />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">
                      ${reservation.totalAmount?.toLocaleString() || '0'}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <button
                      onClick={() => handleCreateInvoice(reservation)}
                      className="text-primary-600 hover:text-primary-900"
                    >
                      Create Invoice
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredAndSortedReservations.length === 0 && (
            <div className="text-center py-12 text-gray-500">No reservations found</div>
          )}
        </div>
      </div>

      <div className="mt-4 text-sm text-gray-600">
        Showing {filteredAndSortedReservations.length} of {reservations.length} reservations
      </div>

      {/* Add Reservation Modal - Beds24 Style Booking Flow */}
      <Modal
        isOpen={isModalOpen}
        onClose={resetModal}
        title="Create New Reservation"
      >
        <div className="space-y-6">
          {/* Progress Steps - 2 Steps Only */}
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

          {/* Step 1: Dates + Room Type + Room Selection (Combined) */}
          {bookingStep === 1 && (
            <div className="space-y-6">
              {/* Date Selection */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
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
                  <label className="block text-sm font-medium text-gray-700 mb-1">
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
                  <label className="block text-sm font-medium text-gray-700 mb-1">
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
                  <label className="block text-sm font-medium text-gray-700 mb-1">
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
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select Room Type *
                </label>
                {loadingAvailability ? (
                  <div className="text-center py-8 text-gray-500 border rounded-lg">Checking availability...</div>
                ) : availableRoomTypes.length === 0 ? (
                  <div className="text-center py-8 text-gray-500 border rounded-lg">
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
                              : 'border-gray-200 hover:border-gray-300 hover:shadow-md'
                          }`}
                        >
                          <div className="flex justify-between items-start mb-2">
                            <div>
                              <h3 className="text-lg font-semibold text-gray-900">{roomType.room_type_name}</h3>
                              <p className="text-sm text-gray-600 capitalize">{roomType.room_type}</p>
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
                              <span className="text-gray-600">Price per night:</span>
                              <span className="font-medium">${roomType.price_per_night.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-600">Total ({nights} nights, {unitsRequested} unit{unitsRequested > 1 ? 's' : ''}):</span>
                              <span className="font-semibold text-primary-600">${totalPrice.toFixed(2)}</span>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Room Selection (Optional - shown when room type is selected) */}
              {selectedRoomType && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Select Specific Room (Optional)
                  </label>
                  <div className="p-3 bg-blue-50 border border-blue-200 rounded-md mb-3">
                    <p className="text-sm text-blue-800">
                      You can select a specific room or continue with auto-assignment (system will assign best available room).
                    </p>
                  </div>
                  {availableRooms.length > 0 ? (
                    <div className="space-y-2 max-h-48 overflow-y-auto border rounded-lg p-3">
                      <div
                        onClick={() => setSelectedRoom(null)}
                        className={`border-2 rounded-lg p-3 cursor-pointer transition-all ${
                          !selectedRoom
                            ? 'border-primary-600 bg-primary-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <div className="flex justify-between items-center">
                          <span className="font-medium">Auto-assign (Recommended)</span>
                          <span className="text-sm text-gray-600">System will assign best available room</span>
                        </div>
                      </div>
                      {availableRooms.map((room) => {
                        const isSelected = selectedRoom?.id === room.id
                        const nights = Math.ceil(
                          (parseISO(checkOut).getTime() - parseISO(checkIn).getTime()) / (1000 * 60 * 60 * 24)
                        )
                        const totalPrice = room.pricePerNight * nights * unitsRequested

                        return (
                          <div
                            key={room.id}
                            onClick={() => setSelectedRoom(room)}
                            className={`border-2 rounded-lg p-3 cursor-pointer transition-all ${
                              isSelected
                                ? 'border-primary-600 bg-primary-50'
                                : 'border-gray-200 hover:border-gray-300'
                            }`}
                          >
                            <div className="flex justify-between items-center">
                              <div>
                                <span className="font-medium">{room.roomNumber}</span>
                                <span className="text-sm text-gray-600 ml-2">- {room.type}</span>
                              </div>
                              <div className="text-right">
                                <div className="text-sm font-medium">${room.pricePerNight}/night</div>
                                <div className="text-xs text-gray-600">${totalPrice.toFixed(2)} total</div>
                              </div>
                            </div>
                            {room.features && room.features.length > 0 && (
                              <div className="mt-2 text-xs text-gray-500">
                                {room.features.join(', ')}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="text-center py-4 text-gray-500 border rounded-lg text-sm">
                      No specific rooms available. Auto-assignment will be used.
                    </div>
                  )}
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
              <div className="p-3 bg-gray-50 rounded-md">
                <div className="text-sm space-y-1">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Room Type:</span>
                    <span className="font-medium">{selectedRoomType?.room_type_name}</span>
                  </div>
                  {selectedRoom && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Room:</span>
                      <span className="font-medium">{selectedRoom.roomNumber}</span>
                    </div>
                  )}
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
                  <div className="flex justify-between pt-2 border-t border-gray-200">
                    <span className="text-gray-900 font-medium">Total Amount:</span>
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
                  onChange={(guest2Id) => setNewReservation({ ...newReservation, guest2Id })}
                  guests={guests.filter((g) => String(g.id) !== String(newReservation.guestId))}
                  label="Second Guest (Optional)"
                  placeholder="Search for a second guest by name, email, or phone..."
                />
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
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
                  onClick={handleAddReservation}
                  className="btn btn-primary"
                  disabled={!newReservation.guestId}
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

export default ReservationsPage

