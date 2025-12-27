import { useState, useMemo, useEffect } from 'react'
import { format, parseISO } from 'date-fns'
import StatusBadge from '../components/StatusBadge'
import SearchInput from '../components/SearchInput'
import FilterSelect from '../components/FilterSelect'
import Modal from '../components/Modal'
import useRoomTypesStore from '../store/roomTypesStore'
import useRoomsStore from '../store/roomsStore'
import { api } from '../utils/api'
import { useToast } from '../hooks/useToast'

const RoomsPage = () => {
  const { roomTypes, fetchRoomTypes, isLoading: roomTypesLoading } = useRoomTypesStore()
  const { housekeeping, fetchHousekeeping, updateHousekeepingStatus, isLoading: housekeepingLoading } = useRoomsStore()
  const [staff, setStaff] = useState([])
  const [staffLoading, setStaffLoading] = useState(false)
  const toast = useToast()

  // Fetch room types, housekeeping, and staff on mount
  useEffect(() => {
    fetchRoomTypes()
    fetchHousekeeping()
    fetchStaff()
  }, [fetchRoomTypes, fetchHousekeeping])

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

  // Generate flat list of all individual room units from room types
  const allRooms = useMemo(() => {
    const rooms = []
    roomTypes.forEach((roomType) => {
      // Create one row for each unit in the room type
      for (let i = 0; i < roomType.qty; i++) {
        rooms.push({
          id: `${roomType.id}-unit-${i}`, // Unit ID format
          roomTypeId: roomType.id,
          roomTypeName: roomType.name,
          roomType: roomType.roomType,
          unitIndex: i,
          unitNumber: i + 1,
          totalUnits: roomType.qty,
          pricePerNight: roomType.pricePerNight,
          floor: roomType.floor,
          maxPeople: roomType.maxPeople,
          features: roomType.features || [],
        })
      }
    })
    return rooms
  }, [roomTypes])
  const [activeTab, setActiveTab] = useState('rooms')
  const [searchTerm, setSearchTerm] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [housekeepingFilter, setHousekeepingFilter] = useState('')

  const filteredRooms = useMemo(() => {
    return allRooms.filter((room) => {
      const roomDisplayName = `${room.roomTypeName} #${room.unitNumber}`
      const matchesSearch = roomDisplayName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           room.roomTypeName.toLowerCase().includes(searchTerm.toLowerCase())
      const matchesType = !typeFilter || room.roomType === typeFilter
      return matchesSearch && matchesType
    })
  }, [searchTerm, typeFilter, allRooms])

  // Get unique room types for filter
  const roomTypeOptions = useMemo(() => {
    const types = new Set(roomTypes.map(rt => rt.roomType))
    return Array.from(types).map(type => ({
      value: type,
      label: type.charAt(0).toUpperCase() + type.slice(1)
    }))
  }, [roomTypes])

  const filteredHousekeeping = useMemo(() => {
    return allRooms.map((room) => {
      // Find housekeeping record for this unit (using unit ID format)
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

      const roomDisplayName = `${room.roomTypeName} #${room.unitNumber}`
      const matchesSearch = roomDisplayName.toLowerCase().includes(searchTerm.toLowerCase()) ||
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
  }, [housekeeping, allRooms, searchTerm, housekeepingFilter, staff])

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Rooms Management</h1>
          <p className="text-gray-600 mt-2">View all room units and manage housekeeping</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('rooms')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'rooms'
                ? 'border-primary-500 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Rooms
          </button>
          <button
            onClick={() => setActiveTab('housekeeping')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'housekeeping'
                ? 'border-primary-500 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <SearchInput
            value={searchTerm}
            onChange={setSearchTerm}
            placeholder="Search by room name or type..."
            label="Search"
          />
          <FilterSelect
            value={typeFilter}
            onChange={setTypeFilter}
            options={roomTypeOptions}
            placeholder="All Room Types"
            label="Room Type"
          />
        </div>
      </div>

      {/* Rooms Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Room
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Room Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Unit
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
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredRooms.map((room) => (
                <tr key={room.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">
                      {room.roomTypeName} #{room.unitNumber}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900 capitalize">{room.roomType}</div>
                    <div className="text-xs text-gray-500">{room.totalUnits} total units</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">Unit {room.unitNumber} of {room.totalUnits}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">${room.pricePerNight?.toFixed(2) || '0.00'}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">{room.floor || 'N/A'}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">{room.maxPeople || 'N/A'}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-gray-500">
                      {room.features?.length > 0 ? room.features.join(', ') : 'N/A'}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {(roomTypesLoading || housekeepingLoading) && filteredRooms.length === 0 && (
            <div className="text-center py-12 text-gray-500">Loading rooms...</div>
          )}
          {!roomTypesLoading && !housekeepingLoading && filteredRooms.length === 0 && (
            <div className="text-center py-12 text-gray-500">No rooms found. Please add room types in the Room Types section.</div>
          )}
        </div>
      </div>

      <div className="mt-4 text-sm text-gray-600">
        Showing {filteredRooms.length} of {allRooms.length} room units
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
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Room Number
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Type
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Cleaning Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Last Cleaned
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Assigned Staff
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredHousekeeping.map((item) => {
                    const { room, ...hk } = item
                    const roomDisplayName = `${room.roomTypeName} #${room.unitNumber}`

                    return (
                      <tr key={room.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {roomDisplayName}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 capitalize">
                          {room.roomType}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <StatusBadge
                            status={hk.status}
                            type="housekeeping"
                          />
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
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
            <div className="text-center py-12 text-gray-500">No rooms found</div>
          )}
        </>
      )}
    </div>
  )
}

export default RoomsPage

