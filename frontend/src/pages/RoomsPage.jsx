import { useState, useMemo, useEffect } from 'react'
import { format, parseISO } from 'date-fns'
import StatusBadge from '../components/StatusBadge'
import SearchInput from '../components/SearchInput'
import FilterSelect from '../components/FilterSelect'
import Modal from '../components/Modal'
import useRoomTypesStore from '../store/roomTypesStore'
import useRoomsStore from '../store/roomsStore'
import useCheckInsStore from '../store/checkInsStore'
import { api } from '../utils/api'
import { useToast } from '../hooks/useToast'

const RoomsPage = () => {
  const { roomTypes, fetchRoomTypes, isLoading: roomTypesLoading } = useRoomTypesStore()
  const { rooms, housekeeping, fetchRooms, fetchHousekeeping, updateHousekeepingStatus, isLoading: housekeepingLoading } = useRoomsStore()
  const { checkIns, fetchCheckIns, getCheckInByRoom } = useCheckInsStore()
  const [staff, setStaff] = useState([])
  const [staffLoading, setStaffLoading] = useState(false)
  const [roomsLoading, setRoomsLoading] = useState(false)
  const [selectedRoomCheckIn, setSelectedRoomCheckIn] = useState(null)
  const [isCheckInModalOpen, setIsCheckInModalOpen] = useState(false)
  const toast = useToast()

  // Fetch room types, rooms, housekeeping, check-ins, and staff on mount
  useEffect(() => {
    fetchRoomTypes()
    fetchRoomsData()
    fetchHousekeeping()
    fetchCheckIns()
    fetchStaff()
  }, [fetchRoomTypes, fetchHousekeeping, fetchCheckIns])

  // Fetch rooms with loading state
  const fetchRoomsData = async () => {
    try {
      setRoomsLoading(true)
      await fetchRooms()
    } catch (error) {
      console.error('Error fetching rooms:', error)
      toast.error('Failed to load rooms')
    } finally {
      setRoomsLoading(false)
    }
  }

  // Fetch staff members
  const fetchStaff = async () => {
    try {
      setStaffLoading(true)
      const users = await api.users.getAll()
      // Filter to only active staff members and format for display
      const activeStaff = users
        .filter(user => user.is_active)
        .map(user => ({
          id: user.id,
          name: `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email,
          email: user.email,
        }))
      setStaff(activeStaff)
    } catch (error) {
      console.error('Error fetching staff:', error)
      // Fallback to empty array if fetch fails
      setStaff([])
    } finally {
      setStaffLoading(false)
    }
  }

  // Enrich rooms with room type and check-in information
  const enrichedRooms = useMemo(() => {
    return rooms.map((room) => {
      // Find the matching room type by room_type field (lowercase)
      const matchingRoomType = roomTypes.find(
        (rt) => rt.roomType && rt.roomType.toLowerCase() === room.roomType
      )
      
      // Find active check-in for this room
      const checkIn = getCheckInByRoom(room.id)
      
      return {
        ...room,
        roomTypeName: matchingRoomType?.name || `${room.type} Room`,
        maxPeople: matchingRoomType?.maxPeople || room.maxPeople,
        checkIn: checkIn || null,
        guestName: checkIn?.guest_name || null,
      }
    })
  }, [rooms, roomTypes, checkIns, getCheckInByRoom])
  const [activeTab, setActiveTab] = useState('rooms')
  const [searchTerm, setSearchTerm] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [housekeepingFilter, setHousekeepingFilter] = useState('')

  const filteredRooms = useMemo(() => {
    return enrichedRooms.filter((room) => {
      const matchesSearch = room.roomNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           room.roomTypeName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           room.type.toLowerCase().includes(searchTerm.toLowerCase())
      const matchesType = !typeFilter || room.roomType === typeFilter
      const matchesStatus = !statusFilter || room.status === statusFilter
      return matchesSearch && matchesType && matchesStatus
    })
  }, [searchTerm, typeFilter, statusFilter, enrichedRooms])

  // Get unique room types for filter
  const roomTypeOptions = useMemo(() => {
    const types = new Set(roomTypes.map(rt => rt.roomType))
    return Array.from(types).map(type => ({
      value: type,
      label: type.charAt(0).toUpperCase() + type.slice(1)
    }))
  }, [roomTypes])

  const filteredHousekeeping = useMemo(() => {
    return enrichedRooms.map((room) => {
      // Find housekeeping record for this room
      const hk = housekeeping.find((h) => h.roomId === room.id)
      
      // If no housekeeping record exists, create a default one for display
      const housekeepingData = hk || {
        id: null,
        roomId: room.id,
        status: 'Clean',
        assignedStaff: '',
        lastCleaned: null,
        notes: null,
      }

      // Map assignedStaff (could be ID or name) to staff member for display
      // Check if assignedStaff is a UUID (staff ID) or a name
      const isStaffId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(housekeepingData.assignedStaff || '')
      const assignedStaffMember = isStaffId 
        ? staff.find(s => s.id === housekeepingData.assignedStaff)
        : null

      const matchesSearch = room.roomNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           room.roomTypeName.toLowerCase().includes(searchTerm.toLowerCase())
      const matchesStatus = !housekeepingFilter || housekeepingData.status === housekeepingFilter

      if (!matchesSearch || !matchesStatus) return null

      return {
        ...housekeepingData,
        assignedStaffId: isStaffId ? housekeepingData.assignedStaff : null, // Store ID if it's a UUID
        assignedStaffName: assignedStaffMember?.name || (isStaffId ? null : housekeepingData.assignedStaff), // Store name for display
        room,
      }
    }).filter(Boolean)
  }, [housekeeping, enrichedRooms, searchTerm, housekeepingFilter, staff])

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Rooms Management</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">View all room units and manage housekeeping</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-700 mb-6">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('rooms')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'rooms'
                ? 'border-primary-500 text-primary-600'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
            }`}
          >
            Rooms
          </button>
          <button
            onClick={() => setActiveTab('housekeeping')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'housekeeping'
                ? 'border-primary-500 text-primary-600'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
            }`}
          >
            Housekeeping
          </button>
        </nav>
      </div>

      {activeTab === 'rooms' && (
        <>

      {/* Filters */}
      <div className="card mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <SearchInput
            value={searchTerm}
            onChange={setSearchTerm}
            placeholder="Search by room number or type..."
            label="Search"
          />
          <FilterSelect
            value={typeFilter}
            onChange={setTypeFilter}
            options={roomTypeOptions}
            placeholder="All Room Types"
            label="Room Type"
          />
          <FilterSelect
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { value: 'Available', label: 'Available' },
              { value: 'Occupied', label: 'Occupied' },
              { value: 'Cleaning', label: 'Cleaning' },
              { value: 'Out of Service', label: 'Out of Service' },
            ]}
            placeholder="All Statuses"
            label="Status"
          />
        </div>
      </div>

      {/* Rooms Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Room Number
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Room Type Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Guest
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Price/Night
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Floor
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Max People
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Features
                </th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {filteredRooms.map((room) => (
                <tr key={room.id} className="hover:bg-gray-50 dark:hover:bg-gray-700 dark:hover:bg-gray-700">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {room.roomNumber}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900 dark:text-gray-100">{room.type}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900 dark:text-gray-100">{room.roomTypeName}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <StatusBadge status={room.status} type="room" />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {room.checkIn && room.guestName ? (
                      <div>
                        <button
                          onClick={() => {
                            setSelectedRoomCheckIn(room.checkIn);
                            setIsCheckInModalOpen(true);
                          }}
                          className="text-sm font-medium text-blue-600 hover:text-blue-900"
                        >
                          {room.guestName}
                        </button>
                        <div className="text-xs text-gray-500 dark:text-gray-400">Checked-in</div>
                      </div>
                    ) : (
                      <div className="text-sm text-gray-400 dark:text-gray-500">-</div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900 dark:text-gray-100">${room.pricePerNight?.toFixed(2) || '0.00'}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900 dark:text-gray-100">{room.floor || 'N/A'}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900 dark:text-gray-100">{room.maxPeople || 'N/A'}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-gray-500 dark:text-gray-400">
                      {room.features?.length > 0 ? room.features.join(', ') : 'N/A'}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {(roomsLoading || roomTypesLoading || housekeepingLoading) && filteredRooms.length === 0 && (
            <div className="text-center py-12 text-gray-500 dark:text-gray-400">Loading rooms...</div>
          )}
          {!roomsLoading && !roomTypesLoading && !housekeepingLoading && filteredRooms.length === 0 && (
            <div className="text-center py-12 text-gray-500 dark:text-gray-400">No rooms found. Rooms will appear here after syncing from channel manager.</div>
          )}
        </div>
      </div>

      <div className="mt-4 text-sm text-gray-600 dark:text-gray-400">
        Showing {filteredRooms.length} of {enrichedRooms.length} rooms
      </div>
        </>
      )}

      {activeTab === 'housekeeping' && (
        <>
          {/* Housekeeping Filters */}
          <div className="card mb-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <SearchInput
                value={searchTerm}
                onChange={setSearchTerm}
                placeholder="Search by room number..."
                label="Search"
              />
              <FilterSelect
                value={housekeepingFilter}
                onChange={setHousekeepingFilter}
                options={[
                  { value: 'Clean', label: 'Clean' },
                  { value: 'Dirty', label: 'Dirty' },
                  { value: 'In Progress', label: 'In Progress' },
                ]}
                placeholder="All Statuses"
                label="Cleaning Status"
              />
            </div>
          </div>

          {/* Housekeeping Table */}
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50 dark:bg-gray-700">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                      Room Number
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Type
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Cleaning Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">
                      Last Cleaned
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">
                      Assigned Staff
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                  {filteredHousekeeping.map((item) => {
                    const { room, ...hk } = item

                    return (
                      <tr key={room.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100">
                          {room.roomNumber}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100 capitalize">
                          {room.type}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <StatusBadge
                            status={hk.status}
                            type="housekeeping"
                          />
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                          {hk.lastCleaned
                            ? format(parseISO(hk.lastCleaned), 'MMM dd, yyyy HH:mm')
                            : 'Never'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <select
                            value={hk.assignedStaffId || hk.assignedStaff || ''}
                            onChange={async (e) => {
                              try {
                                await updateHousekeepingStatus(room.id, hk.status, e.target.value)
                                await fetchHousekeeping() // Refresh after update
                              } catch (error) {
                                toast.error(error.message || 'Failed to update housekeeping')
                              }
                            }}
                            className="input text-sm"
                            disabled={staffLoading}
                          >
                            <option value="">Unassigned</option>
                            {staffLoading ? (
                              <option disabled>Loading staff...</option>
                            ) : staff.length === 0 ? (
                              <option disabled>No staff members available</option>
                            ) : (
                              staff.map((staffMember) => (
                                <option key={staffMember.id} value={staffMember.id}>
                                  {staffMember.name}
                                </option>
                              ))
                            )}
                          </select>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                          <div className="flex gap-2">
                            {hk.status !== 'Clean' && (
                              <button
                                onClick={async () => {
                                  try {
                                    await updateHousekeepingStatus(room.id, 'Clean', hk.assignedStaffId || hk.assignedStaff)
                                    await fetchHousekeeping() // Refresh after update
                                  } catch (error) {
                                    toast.error(error.message || 'Failed to update housekeeping')
                                  }
                                }}
                                className="text-green-600 hover:text-green-900"
                              >
                                Mark Clean
                              </button>
                            )}
                            {hk.status !== 'Dirty' && (
                              <button
                                onClick={async () => {
                                  try {
                                    await updateHousekeepingStatus(room.id, 'Dirty', hk.assignedStaffId || hk.assignedStaff)
                                    await fetchHousekeeping() // Refresh after update
                                  } catch (error) {
                                    toast.error(error.message || 'Failed to update housekeeping')
                                  }
                                }}
                                className="text-red-600 hover:text-red-900"
                              >
                                Mark Dirty
                              </button>
                            )}
                            {hk.status !== 'In Progress' && (
                              <button
                                onClick={async () => {
                                  try {
                                    await updateHousekeepingStatus(room.id, 'In Progress', hk.assignedStaffId || hk.assignedStaff)
                                    await fetchHousekeeping() // Refresh after update
                                  } catch (error) {
                                    toast.error(error.message || 'Failed to update housekeeping')
                                  }
                                }}
                                className="text-yellow-600 hover:text-yellow-900"
                              >
                                Start Cleaning
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
          {filteredHousekeeping.length === 0 && (
            <div className="text-center py-12 text-gray-500 dark:text-gray-400">No rooms found</div>
          )}
        </>
      )}

      {/* Check-in Details Modal */}
      {isCheckInModalOpen && selectedRoomCheckIn && (
        <Modal
          isOpen={isCheckInModalOpen}
          onClose={() => {
            setIsCheckInModalOpen(false);
            setSelectedRoomCheckIn(null);
          }}
          title="Check-in Details"
        >
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Guest Information</h3>
              <p className="mt-1 text-sm text-gray-900 dark:text-gray-100">{selectedRoomCheckIn.guest_name}</p>
              {selectedRoomCheckIn.guest_email && (
                <p className="text-sm text-gray-500 dark:text-gray-400">{selectedRoomCheckIn.guest_email}</p>
              )}
              {selectedRoomCheckIn.guest_phone && (
                <p className="text-sm text-gray-500 dark:text-gray-400">{selectedRoomCheckIn.guest_phone}</p>
              )}
            </div>

            <div>
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Room Information</h3>
              <p className="mt-1 text-sm text-gray-900 dark:text-gray-100">
                Room {selectedRoomCheckIn.room_number}
              </p>
              {selectedRoomCheckIn.room_type_name && (
                <p className="text-sm text-gray-500 dark:text-gray-400">{selectedRoomCheckIn.room_type_name}</p>
              )}
            </div>

            <div>
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Check-in Details</h3>
              <p className="mt-1 text-sm text-gray-900 dark:text-gray-100">
                Check-in: {selectedRoomCheckIn.check_in_time ? format(parseISO(selectedRoomCheckIn.check_in_time), 'MMM dd, yyyy HH:mm') : 'N/A'}
              </p>
              <p className="text-sm text-gray-900 dark:text-gray-100">
                Expected Checkout: {selectedRoomCheckIn.expected_checkout_time ? format(parseISO(selectedRoomCheckIn.expected_checkout_time), 'MMM dd, yyyy') : 'N/A'}
              </p>
            </div>

            {selectedRoomCheckIn.notes && (
              <div>
                <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Notes</h3>
                <p className="mt-1 text-sm text-gray-900 dark:text-gray-100">{selectedRoomCheckIn.notes}</p>
              </div>
            )}

            <div>
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Status</h3>
              <div className="mt-1">
                <StatusBadge
                  status={selectedRoomCheckIn.status === 'checked_in' ? 'Checked In' : 'Checked Out'}
                />
              </div>
            </div>
          </div>

          <div className="mt-6 flex justify-end">
            <button
              onClick={() => {
                setIsCheckInModalOpen(false);
                setSelectedRoomCheckIn(null);
              }}
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              Close
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}

export default RoomsPage

