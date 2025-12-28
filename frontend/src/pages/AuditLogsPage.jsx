import { useMemo, useState, useEffect } from 'react'
import { format, parseISO } from 'date-fns'
import useAuditLogsStore from '../store/auditLogsStore'
import SearchInput from '../components/SearchInput'
import FilterSelect from '../components/FilterSelect'

const AuditLogsPage = () => {
  const { auditLogs, loading, error, fetchAuditLogs, total } = useAuditLogsStore()
  const [searchTerm, setSearchTerm] = useState('')
  const [actionFilter, setActionFilter] = useState('')
  const [entityFilter, setEntityFilter] = useState('')
  const [sortBy, setSortBy] = useState('created_at')
  const [sortOrder, setSortOrder] = useState('desc')

  // Fetch audit logs on mount and when filters change
  useEffect(() => {
    const filters = {};
    if (actionFilter) filters.action = actionFilter;
    if (entityFilter) filters.entityType = entityFilter;
    if (searchTerm) filters.search = searchTerm;
    if (sortBy) filters.sortBy = sortBy;
    if (sortOrder) filters.sortOrder = sortOrder;
    filters.limit = 1000; // Get all logs for client-side filtering/sorting
    
    const timeoutId = setTimeout(() => {
      fetchAuditLogs(filters);
    }, searchTerm ? 300 : 0); // Debounce search

    return () => clearTimeout(timeoutId);
  }, [actionFilter, entityFilter, searchTerm, sortBy, sortOrder, fetchAuditLogs])

  const filteredAndSortedLogs = useMemo(() => {
    // Server-side filtering is already done, but we can do additional client-side filtering if needed
    let filtered = [...auditLogs];

    // Additional client-side search (if server search doesn't cover everything)
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      filtered = filtered.filter((log) => {
        return (
          log.action.toLowerCase().includes(searchLower) ||
          log.entityType.toLowerCase().includes(searchLower) ||
          log.entityId.toLowerCase().includes(searchLower) ||
          (log.userName && log.userName.toLowerCase().includes(searchLower)) ||
          (log.entityName && log.entityName.toLowerCase().includes(searchLower)) ||
          (log.userId && log.userId.toLowerCase().includes(searchLower))
        );
      });
    }

    // Additional client-side filtering
    if (actionFilter) {
      filtered = filtered.filter((log) => log.action === actionFilter);
    }

    if (entityFilter) {
      filtered = filtered.filter((log) => log.entityType === entityFilter);
    }

    // Client-side sorting (server already sorts, but we can re-sort if needed)
    filtered.sort((a, b) => {
      let comparison = 0;
      if (sortBy === 'created_at' || sortBy === 'timestamp') {
        comparison = parseISO(a.timestamp).getTime() - parseISO(b.timestamp).getTime();
      } else if (sortBy === 'action') {
        comparison = a.action.localeCompare(b.action);
      } else if (sortBy === 'entity_type' || sortBy === 'entityType') {
        comparison = a.entityType.localeCompare(b.entityType);
      } else if (sortBy === 'entity_id' || sortBy === 'entityId') {
        comparison = a.entityId.localeCompare(b.entityId);
      }
      return sortOrder === 'desc' ? -comparison : comparison;
    });

    return filtered;
  }, [auditLogs, searchTerm, actionFilter, entityFilter, sortBy, sortOrder])

  const handleSort = (column) => {
    // Map frontend column names to backend sort_by values
    const columnMap = {
      'timestamp': 'created_at',
      'action': 'action',
      'entityType': 'entity_type',
      'entityId': 'entity_id',
    };
    
    const backendColumn = columnMap[column] || column;
    
    if (sortBy === backendColumn) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(backendColumn)
      setSortOrder('desc')
    }
  }

  const SortIcon = ({ column }) => {
    // Map frontend column names to backend sort_by values
    const columnMap = {
      'timestamp': 'created_at',
      'action': 'action',
      'entityType': 'entity_type',
      'entityId': 'entity_id',
    };
    
    const backendColumn = columnMap[column] || column;
    
    if (sortBy !== backendColumn) return <span className="text-gray-400">↕</span>
    return sortOrder === 'asc' ? <span>↑</span> : <span>↓</span>
  }

  const uniqueActions = useMemo(() => {
    const actions = [...new Set(auditLogs.map((log) => log.action))]
    return actions.map((action) => ({ value: action, label: action }))
  }, [auditLogs])

  const uniqueEntities = useMemo(() => {
    const entities = [...new Set(auditLogs.map((log) => log.entityType))]
    return entities.map((entity) => ({ value: entity, label: entity }))
  }, [auditLogs])

  const getActionColor = (action) => {
    if (action.includes('CREATE')) return 'bg-green-100 text-green-800'
    if (action.includes('UPDATE')) return 'bg-blue-100 text-blue-800'
    if (action.includes('DELETE')) return 'bg-red-100 text-red-800'
    if (action.includes('LOGIN')) return 'bg-purple-100 text-purple-800'
    if (action.includes('PAYMENT')) return 'bg-yellow-100 text-yellow-800'
    if (action.includes('CLEAR')) return 'bg-orange-100 text-orange-800'
    return 'bg-gray-100 text-gray-800'
  }

  // Format action for better readability
  const formatAction = (action) => {
    return action.replace(/_/g, ' ')
  }

  // Format entity type for better readability
  const formatEntityType = (entityType) => {
    return entityType
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (char) => char.toUpperCase())
  }

  // Truncate UUID for display
  const truncateId = (id) => {
    if (!id || id.length <= 12) return id
    return `${id.substring(0, 8)}...`
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Audit Logs</h1>
        <p className="text-gray-600 mt-2">Track all system actions and changes</p>
      </div>

      {/* Filters */}
      <div className="card mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <SearchInput
            value={searchTerm}
            onChange={setSearchTerm}
            placeholder="Search by action, entity type, or ID..."
            label="Search"
          />
          <FilterSelect
            value={actionFilter}
            onChange={setActionFilter}
            options={uniqueActions}
            placeholder="All Actions"
            label="Action"
          />
          <FilterSelect
            value={entityFilter}
            onChange={setEntityFilter}
            options={uniqueEntities}
            placeholder="All Entity Types"
            label="Entity Type"
          />
        </div>
      </div>

      {/* Loading/Error States */}
      {loading && (
        <div className="card text-center py-12">
          <p className="text-gray-500">Loading audit logs...</p>
        </div>
      )}

      {error && (
        <div className="card bg-red-50 border border-red-200 text-red-700 p-4 mb-6">
          <p>Error loading audit logs: {error}</p>
        </div>
      )}

      {/* Logs Table */}
      {!loading && !error && (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th 
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('timestamp')}
                >
                  <div className="flex items-center gap-1">
                    Timestamp
                    <SortIcon column="timestamp" />
                  </div>
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Staff
                </th>
                <th 
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('action')}
                >
                  <div className="flex items-center gap-1">
                    Action
                    <SortIcon column="action" />
                  </div>
                </th>
                <th 
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('entityType')}
                >
                  <div className="flex items-center gap-1">
                    Entity
                    <SortIcon column="entityType" />
                  </div>
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Name / ID
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredAndSortedLogs.map((log) => (
                <tr key={log.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <div className="flex flex-col">
                      <span className="font-medium text-gray-900">
                        {format(parseISO(log.timestamp), 'MMM dd, yyyy')}
                      </span>
                      <span className="text-xs text-gray-500">
                        {format(parseISO(log.timestamp), 'HH:mm:ss')}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="text-sm font-medium text-gray-900">
                      {log.userName || 'System'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getActionColor(log.action)}`}>
                      {formatAction(log.action)}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {formatEntityType(log.entityType)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex flex-col">
                      {log.entityName && (
                        <span className="text-sm font-medium text-gray-900">
                          {log.entityName}
                        </span>
                      )}
                      <span className="text-xs text-gray-500 font-mono" title={log.entityId}>
                        {truncateId(log.entityId)}
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredAndSortedLogs.length === 0 && (
            <div className="text-center py-12 text-gray-500">
              {auditLogs.length === 0
                ? 'No audit logs yet'
                : 'No logs found matching your filters'}
            </div>
          )}
        </div>
      </div>
      )}

      {!loading && (
        <div className="mt-4 text-sm text-gray-600">
          Showing {filteredAndSortedLogs.length} of {total} audit logs
        </div>
      )}
    </div>
  )
}

export default AuditLogsPage

