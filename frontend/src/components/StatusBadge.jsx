const StatusBadge = ({ status, type = 'room' }) => {
  const getStatusStyles = () => {
    if (type === 'room') {
      switch (status) {
        case 'Available':
          return 'bg-green-100 text-green-800 border-green-200'
        case 'Occupied':
          return 'bg-red-100 text-red-800 border-red-200'
        case 'Cleaning':
          return 'bg-yellow-100 text-yellow-800 border-yellow-200'
        case 'Out of Service':
          return 'bg-gray-100 text-gray-800 border-gray-200'
        default:
          return 'bg-gray-100 text-gray-800 border-gray-200'
      }
    } else if (type === 'invoice') {
      // Invoice status
      switch (status) {
        case 'Pending':
          return 'bg-yellow-100 text-yellow-800 border-yellow-200'
        case 'Paid':
          return 'bg-green-100 text-green-800 border-green-200'
        case 'Cancelled':
          return 'bg-red-100 text-red-800 border-red-200'
        default:
          return 'bg-gray-100 text-gray-800 border-gray-200'
      }
    } else if (type === 'maintenance') {
      // Maintenance status
      switch (status) {
        case 'Open':
          return 'bg-blue-100 text-blue-800 border-blue-200'
        case 'In Progress':
          return 'bg-yellow-100 text-yellow-800 border-yellow-200'
        case 'Repaired':
          return 'bg-green-100 text-green-800 border-green-200'
        default:
          return 'bg-gray-100 text-gray-800 border-gray-200'
      }
    } else if (type === 'housekeeping') {
      // Housekeeping status
      switch (status) {
        case 'Clean':
          return 'bg-green-100 text-green-800 border-green-200'
        case 'Dirty':
          return 'bg-red-100 text-red-800 border-red-200'
        case 'In Progress':
          return 'bg-yellow-100 text-yellow-800 border-yellow-200'
        default:
          return 'bg-gray-100 text-gray-800 border-gray-200'
      }
    } else {
      // Reservation status
      switch (status) {
        case 'Confirmed':
          return 'bg-blue-100 text-blue-800 border-blue-200'
        case 'Checked-in':
          return 'bg-green-100 text-green-800 border-green-200'
        case 'Checked-out':
          return 'bg-gray-100 text-gray-800 border-gray-200'
        case 'Cancelled':
          return 'bg-red-100 text-red-800 border-red-200'
        default:
          return 'bg-gray-100 text-gray-800 border-gray-200'
      }
    }
  }

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getStatusStyles()}`}
    >
      {status}
    </span>
  )
}

export default StatusBadge

