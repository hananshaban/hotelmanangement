import { useState, useMemo } from 'react'
import { format, parseISO } from 'date-fns'
import StatusBadge from '../components/StatusBadge'
import SearchInput from '../components/SearchInput'
import FilterSelect from '../components/FilterSelect'
import Modal from '../components/Modal'
import useStore from '../store/useStore'

const RoomsPage = () => {
  const { rooms, addRoom, housekeeping, updateHousekeepingStatus } = useStore()
  const [activeTab, setActiveTab] = useState('rooms')
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [housekeepingFilter, setHousekeepingFilter] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [newRoom, setNewRoom] = useState({
    roomNumber: '',
    type: 'Single',
    status: 'Available',
    pricePerNight: '',
    floor: '',
    features: [],
  })
  const [featureInput, setFeatureInput] = useState('')

  const filteredRooms = useMemo(() => {
    return rooms.filter((room) => {
      const matchesSearch = room.roomNumber.toLowerCase().includes(searchTerm.toLowerCase())
      const matchesStatus = !statusFilter || room.status === statusFilter
      const matchesType = !typeFilter || room.type === typeFilter
      return matchesSearch && matchesStatus && matchesType
    })
  }, [searchTerm, statusFilter, typeFilter, rooms])

  const handleAddRoom = () => {
    // Validation
    if (!newRoom.roomNumber || !newRoom.pricePerNight || !newRoom.floor) {
      alert('Please fill in all required fields (Room Number, Price/Night, Floor)')
      return
    }

    const price = parseFloat(newRoom.pricePerNight)
    if (isNaN(price) || price <= 0) {
      alert('Please enter a valid price (must be a positive number)')
      return
    }

    const floor = parseInt(newRoom.floor)
    if (isNaN(floor) || floor <= 0) {
      alert('Please enter a valid floor number (must be a positive number)')
      return
    }

    // Check if room number already exists
    if (rooms.some((r) => r.roomNumber === newRoom.roomNumber)) {
      alert('A room with this number already exists')
      return
    }

    addRoom({
      ...newRoom,
      pricePerNight: price,
      floor: floor,
    })

    setIsModalOpen(false)
    setNewRoom({
      roomNumber: '',
      type: 'Single',
      status: 'Available',
      pricePerNight: '',
      floor: '',
      features: [],
    })
    setFeatureInput('')
  }

  const handleAddFeature = () => {
    if (featureInput.trim() && !newRoom.features.includes(featureInput.trim())) {
      setNewRoom({
        ...newRoom,
        features: [...newRoom.features, featureInput.trim()],
      })
      setFeatureInput('')
    }
  }

  const handleRemoveFeature = (feature) => {
    setNewRoom({
      ...newRoom,
      features: newRoom.features.filter((f) => f !== feature),
    })
  }

  const statusOptions = [
    { value: 'Available', label: 'Available' },
    { value: 'Occupied', label: 'Occupied' },
    { value: 'Cleaning', label: 'Cleaning' },
    { value: 'Out of Service', label: 'Out of Service' },
  ]

  const typeOptions = [
    { value: 'Single', label: 'Single' },
    { value: 'Double', label: 'Double' },
    { value: 'Suite', label: 'Suite' },
  ]

  const filteredHousekeeping = useMemo(() => {
    return housekeeping.filter((hk) => {
      const room = rooms.find((r) => String(r.id) === hk.roomId)
      if (!room) return false
      const matchesSearch = room.roomNumber.toLowerCase().includes(searchTerm.toLowerCase())
      const matchesStatus = !housekeepingFilter || hk.status === housekeepingFilter
      return matchesSearch && matchesStatus
    })
  }, [housekeeping, rooms, searchTerm, housekeepingFilter])

  const staffMembers = ['John Doe', 'Jane Smith', 'Mike Johnson', 'Sarah Williams']

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Rooms Management</h1>
          <p className="text-gray-600 mt-2">Manage and view all hotel rooms</p>
        </div>
        {activeTab === 'rooms' && (
          <button
            onClick={() => setIsModalOpen(true)}
            className="btn btn-primary"
          >
            + Add Room
          </button>
        )}
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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <SearchInput
            value={searchTerm}
            onChange={setSearchTerm}
            placeholder="Search by room number..."
            label="Search"
          />
          <FilterSelect
            value={statusFilter}
            onChange={setStatusFilter}
            options={statusOptions}
            placeholder="All Statuses"
            label="Status"
          />
          <FilterSelect
            value={typeFilter}
            onChange={setTypeFilter}
            options={typeOptions}
            placeholder="All Types"
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
                  Room Number
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Price/Night
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Floor
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
                    <div className="text-sm font-medium text-gray-900">{room.roomNumber}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">{room.type}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <StatusBadge status={room.status} type="room" />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">${room.pricePerNight}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">{room.floor}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-gray-500">
                      {room.features?.join(', ') || 'N/A'}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredRooms.length === 0 && (
            <div className="text-center py-12 text-gray-500">No rooms found</div>
          )}
        </div>
      </div>

      <div className="mt-4 text-sm text-gray-600">
        Showing {filteredRooms.length} of {rooms.length} rooms
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
                  {filteredHousekeeping.map((hk) => {
                    const room = rooms.find((r) => String(r.id) === hk.roomId)
                    if (!room) return null

                    return (
                      <tr key={hk.roomId} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {room.roomNumber}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {room.type}
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
                            value={hk.assignedStaff}
                            onChange={(e) =>
                              updateHousekeepingStatus(hk.roomId, hk.status, e.target.value)
                            }
                            className="input text-sm"
                          >
                            <option value="">Unassigned</option>
                            {staffMembers.map((staff) => (
                              <option key={staff} value={staff}>
                                {staff}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                          <div className="flex gap-2">
                            {hk.status !== 'Clean' && (
                              <button
                                onClick={() => updateHousekeepingStatus(hk.roomId, 'Clean', hk.assignedStaff)}
                                className="text-green-600 hover:text-green-900"
                              >
                                Mark Clean
                              </button>
                            )}
                            {hk.status !== 'Dirty' && (
                              <button
                                onClick={() => updateHousekeepingStatus(hk.roomId, 'Dirty', hk.assignedStaff)}
                                className="text-red-600 hover:text-red-900"
                              >
                                Mark Dirty
                              </button>
                            )}
                            {hk.status !== 'In Progress' && (
                              <button
                                onClick={() => updateHousekeepingStatus(hk.roomId, 'In Progress', hk.assignedStaff)}
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
        </>
      )}

      {/* Add Room Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false)
          setNewRoom({
            roomNumber: '',
            type: 'Single',
            status: 'Available',
            pricePerNight: '',
            floor: '',
            features: [],
          })
          setFeatureInput('')
        }}
        title="Add New Room"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Room Number *
            </label>
            <input
              type="text"
              value={newRoom.roomNumber}
              onChange={(e) => setNewRoom({ ...newRoom, roomNumber: e.target.value })}
              className="input"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Room Type *
            </label>
            <select
              value={newRoom.type}
              onChange={(e) => setNewRoom({ ...newRoom, type: e.target.value })}
              className="input"
            >
              <option value="Single">Single</option>
              <option value="Double">Double</option>
              <option value="Suite">Suite</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Status *
            </label>
            <select
              value={newRoom.status}
              onChange={(e) => setNewRoom({ ...newRoom, status: e.target.value })}
              className="input"
            >
              <option value="Available">Available</option>
              <option value="Occupied">Occupied</option>
              <option value="Cleaning">Cleaning</option>
              <option value="Out of Service">Out of Service</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Price per Night ($) *
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={newRoom.pricePerNight}
              onChange={(e) => setNewRoom({ ...newRoom, pricePerNight: e.target.value })}
              className="input"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Floor *
            </label>
            <input
              type="number"
              min="1"
              value={newRoom.floor}
              onChange={(e) => setNewRoom({ ...newRoom, floor: e.target.value })}
              className="input"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Features
            </label>
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={featureInput}
                onChange={(e) => setFeatureInput(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    handleAddFeature()
                  }
                }}
                className="input flex-1"
                placeholder="Add a feature (e.g., WiFi, TV)"
              />
              <button
                type="button"
                onClick={handleAddFeature}
                className="btn btn-secondary"
              >
                Add
              </button>
            </div>
            {newRoom.features.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {newRoom.features.map((feature) => (
                  <span
                    key={feature}
                    className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-primary-100 text-primary-800"
                  >
                    {feature}
                    <button
                      type="button"
                      onClick={() => handleRemoveFeature(feature)}
                      className="ml-2 text-primary-600 hover:text-primary-800"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <button
              onClick={() => {
                setIsModalOpen(false)
                setNewRoom({
                  roomNumber: '',
                  type: 'Single',
                  status: 'Available',
                  pricePerNight: '',
                  floor: '',
                  features: [],
                })
                setFeatureInput('')
              }}
              className="btn btn-secondary"
            >
              Cancel
            </button>
            <button onClick={handleAddRoom} className="btn btn-primary">
              Add Room
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

export default RoomsPage

