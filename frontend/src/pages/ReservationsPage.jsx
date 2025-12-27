import { useState, useMemo, useEffect } from 'react'
import { format, parseISO, compareAsc, addDays } from 'date-fns'
import StatusBadge from '../components/StatusBadge'
import SearchInput from '../components/SearchInput'
import FilterSelect from '../components/FilterSelect'
import Modal from '../components/Modal'
import GuestSelect from '../components/GuestSelect'
import useReservationsStore from '../store/reservationsStore'
import useRoomsStore from '../store/roomsStore'
import useGuestsStore from '../store/guestsStore'
import useInvoicesStore from '../store/invoicesStore'
import { useToast } from '../hooks/useToast'
import { useConfirmation } from '../hooks/useConfirmation'

const ReservationsPage = () => {
  const { rooms } = useRoomsStore()
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
  const [newReservation, setNewReservation] = useState({
    guestId: '',
    guest2Id: '',
    roomNumber: '',
    checkIn: '',
    checkOut: '',
    status: 'Confirmed',
  })

  // Fetch reservations and guests on mount
  useEffect(() => {
    fetchReservations()
    fetchGuests()
  }, [fetchReservations, fetchGuests])

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

  const handleAddReservation = async () => {
    // Validation
    if (!newReservation.guestId || !newReservation.roomNumber || !newReservation.checkIn || !newReservation.checkOut) {
      toast.error('Please fill in all required fields')
      return
    }

    const checkIn = parseISO(newReservation.checkIn)
    const checkOut = parseISO(newReservation.checkOut)

    if (checkOut <= checkIn) {
      toast.error('Check-out date must be after check-in date')
      return
    }

    // Find guests and room
    const guest = guests.find((g) => String(g.id) === String(newReservation.guestId))
    const guest2 = newReservation.guest2Id ? guests.find((g) => String(g.id) === String(newReservation.guest2Id)) : null
    const room = rooms.find((r) => r.roomNumber === newReservation.roomNumber)

    if (!guest) {
      toast.error('Primary guest not found')
      return
    }

    if (!room) {
      toast.error('Room not found')
      return
    }

    // Validate second guest for double rooms
    if (room.type === 'Double' && !newReservation.guest2Id) {
      const confirmed = await confirmation({
        title: 'Double Room Selected',
        message: 'Double room selected. Do you want to proceed with only one guest?',
        variant: 'warning',
      })
      if (!confirmed) {
        return
      }
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

    let force = false
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

    try {
      // Create reservation via API
      await createReservation({
        roomId: room.id,
        guestId: String(guest.id),
        guest2Id: guest2 ? String(guest2.id) : undefined,
        checkIn: newReservation.checkIn,
        checkOut: newReservation.checkOut,
        status: newReservation.status,
        force,
      })

      setIsModalOpen(false)
      setNewReservation({
        guestId: '',
        guest2Id: '',
        roomNumber: '',
        checkIn: '',
        checkOut: '',
        status: 'Confirmed',
      })
      toast.success('Reservation created successfully!')
    } catch (error) {
      toast.error(error.message || 'Failed to create reservation')
    }
  }

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

      {/* Add Reservation Modal */}
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
                  {room.roomNumber} - {room.type} (${room.pricePerNight}/night) - {room.status}
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
              required
            />
          </div>

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
            <button onClick={handleAddReservation} className="btn btn-primary">
              Create Reservation
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

export default ReservationsPage

