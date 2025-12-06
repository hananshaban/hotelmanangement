import { useState, useMemo } from 'react'
import { format, parseISO } from 'date-fns'
import useStore from '../store/useStore'
import StatusBadge from '../components/StatusBadge'
import Modal from '../components/Modal'
import SearchInput from '../components/SearchInput'
import FilterSelect from '../components/FilterSelect'

const MaintenancePage = () => {
  const { rooms, maintenanceRequests, addMaintenanceRequest, updateMaintenanceStatus } = useStore()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [priorityFilter, setPriorityFilter] = useState('')
  const [sortBy, setSortBy] = useState('createdAt')
  const [sortOrder, setSortOrder] = useState('desc')
  const [newRequest, setNewRequest] = useState({
    roomId: '',
    roomNumber: '',
    title: '',
    description: '',
    priority: 'Medium',
  })

  const filteredAndSortedRequests = useMemo(() => {
    let filtered = maintenanceRequests.filter((req) => {
      const matchesSearch =
        req.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        req.roomNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
        req.description.toLowerCase().includes(searchTerm.toLowerCase())
      const matchesStatus = !statusFilter || req.status === statusFilter
      const matchesPriority = !priorityFilter || req.priority === priorityFilter
      return matchesSearch && matchesStatus && matchesPriority
    })

    // Sort
    filtered.sort((a, b) => {
      let comparison = 0
      if (sortBy === 'createdAt') {
        comparison = parseISO(a.createdAt).getTime() - parseISO(b.createdAt).getTime()
      } else if (sortBy === 'roomNumber') {
        comparison = a.roomNumber.localeCompare(b.roomNumber)
      } else if (sortBy === 'title') {
        comparison = a.title.localeCompare(b.title)
      } else if (sortBy === 'priority') {
        const priorityOrder = { Urgent: 4, High: 3, Medium: 2, Low: 1 }
        comparison = (priorityOrder[a.priority] || 0) - (priorityOrder[b.priority] || 0)
      }
      return sortOrder === 'desc' ? -comparison : comparison
    })

    return filtered
  }, [maintenanceRequests, searchTerm, statusFilter, priorityFilter, sortBy, sortOrder])

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

  const handleCreateRequest = () => {
    if (!newRequest.roomNumber || !newRequest.title || !newRequest.description) {
      alert('Please fill in all required fields')
      return
    }

    const room = rooms.find((r) => r.roomNumber === newRequest.roomNumber)
    if (!room) {
      alert('Room not found')
      return
    }

    addMaintenanceRequest({
      ...newRequest,
      roomId: String(room.id),
    })

    setIsModalOpen(false)
    setNewRequest({
      roomId: '',
      roomNumber: '',
      title: '',
      description: '',
      priority: 'Medium',
    })
  }

  const handleStatusChange = (requestId, newStatus) => {
    updateMaintenanceStatus(requestId, newStatus)
  }

  const statusOptions = [
    { value: 'Open', label: 'Open' },
    { value: 'In Progress', label: 'In Progress' },
    { value: 'Repaired', label: 'Repaired' },
  ]

  const priorityOptions = [
    { value: 'Low', label: 'Low' },
    { value: 'Medium', label: 'Medium' },
    { value: 'High', label: 'High' },
    { value: 'Urgent', label: 'Urgent' },
  ]

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'Urgent':
        return 'bg-red-100 text-red-800 border-red-200'
      case 'High':
        return 'bg-orange-100 text-orange-800 border-orange-200'
      case 'Medium':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200'
      case 'Low':
        return 'bg-blue-100 text-blue-800 border-blue-200'
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200'
    }
  }

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Maintenance Requests</h1>
          <p className="text-gray-600 mt-2">Track and manage room maintenance issues</p>
        </div>
        <button onClick={() => setIsModalOpen(true)} className="btn btn-primary">
          + New Request
        </button>
      </div>

      {/* Filters */}
      <div className="card mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <SearchInput
            value={searchTerm}
            onChange={setSearchTerm}
            placeholder="Search by room, title, or description..."
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
            value={priorityFilter}
            onChange={setPriorityFilter}
            options={priorityOptions}
            placeholder="All Priorities"
            label="Priority"
          />
        </div>
      </div>

      {/* Requests Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Request ID
                </th>
                <th 
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('roomNumber')}
                >
                  <div className="flex items-center gap-1">
                    Room
                    <SortIcon column="roomNumber" />
                  </div>
                </th>
                <th 
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('title')}
                >
                  <div className="flex items-center gap-1">
                    Title
                    <SortIcon column="title" />
                  </div>
                </th>
                <th 
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('priority')}
                >
                  <div className="flex items-center gap-1">
                    Priority
                    <SortIcon column="priority" />
                  </div>
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Status
                </th>
                <th 
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('createdAt')}
                >
                  <div className="flex items-center gap-1">
                    Created
                    <SortIcon column="createdAt" />
                  </div>
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredAndSortedRequests.map((request) => (
                <tr key={request.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {request.id}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {request.roomNumber}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900">
                    <div className="font-medium">{request.title}</div>
                    <div className="text-gray-500 text-xs mt-1 truncate max-w-xs">
                      {request.description}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getPriorityColor(
                        request.priority
                      )}`}
                    >
                      {request.priority}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <StatusBadge status={request.status} type="maintenance" />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {format(parseISO(request.createdAt), 'MMM dd, yyyy')}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    {request.status === 'Open' && (
                      <button
                        onClick={() => handleStatusChange(request.id, 'In Progress')}
                        className="text-primary-600 hover:text-primary-900 mr-3"
                      >
                        Start
                      </button>
                    )}
                    {request.status === 'In Progress' && (
                      <button
                        onClick={() => handleStatusChange(request.id, 'Repaired')}
                        className="text-green-600 hover:text-green-900"
                      >
                        Mark Repaired
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredAndSortedRequests.length === 0 && (
            <div className="text-center py-12 text-gray-500">
              {maintenanceRequests.length === 0
                ? 'No maintenance requests yet'
                : 'No requests found matching your filters'}
            </div>
          )}
        </div>
      </div>

      {/* Create Request Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false)
          setNewRequest({
            roomId: '',
            roomNumber: '',
            title: '',
            description: '',
            priority: 'Medium',
          })
        }}
        title="Create Maintenance Request"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Room Number *</label>
            <select
              value={newRequest.roomNumber}
              onChange={(e) => setNewRequest({ ...newRequest, roomNumber: e.target.value })}
              className="input"
              required
            >
              <option value="">Select a room</option>
              {rooms.map((room) => (
                <option key={room.id} value={room.roomNumber}>
                  {room.roomNumber} - {room.type}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
            <input
              type="text"
              value={newRequest.title}
              onChange={(e) => setNewRequest({ ...newRequest, title: e.target.value })}
              className="input"
              placeholder="e.g., AC not working"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description *</label>
            <textarea
              value={newRequest.description}
              onChange={(e) => setNewRequest({ ...newRequest, description: e.target.value })}
              className="input"
              rows="4"
              placeholder="Describe the issue in detail..."
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Priority *</label>
            <select
              value={newRequest.priority}
              onChange={(e) => setNewRequest({ ...newRequest, priority: e.target.value })}
              className="input"
            >
              {priorityOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <button
              onClick={() => {
                setIsModalOpen(false)
                setNewRequest({
                  roomId: '',
                  roomNumber: '',
                  title: '',
                  description: '',
                  priority: 'Medium',
                })
              }}
              className="btn btn-secondary"
            >
              Cancel
            </button>
            <button onClick={handleCreateRequest} className="btn btn-primary">
              Create Request
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

export default MaintenancePage

