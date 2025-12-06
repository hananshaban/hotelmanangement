import { useState, useMemo } from 'react'
import Modal from '../components/Modal'
import { format, parseISO, addDays } from 'date-fns'
import StatusBadge from '../components/StatusBadge'
import SearchInput from '../components/SearchInput'
import FilterSelect from '../components/FilterSelect'
import useStore from '../store/useStore'

const InvoicesPage = () => {
  const { invoices, reservations, guests, updateInvoiceStatus } = useStore()
  const [paymentModalOpen, setPaymentModalOpen] = useState(false)
  const [selectedInvoice, setSelectedInvoice] = useState(null)
  const [paymentMethod, setPaymentMethod] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [sortBy, setSortBy] = useState('issueDate')
  const [sortOrder, setSortOrder] = useState('desc')

  const filteredAndSortedInvoices = useMemo(() => {
    let filtered = invoices.filter((invoice) => {
      const matchesSearch =
        invoice.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        invoice.reservationId?.toLowerCase().includes(searchTerm.toLowerCase())
      const matchesStatus = !statusFilter || invoice.status === statusFilter
      return matchesSearch && matchesStatus
    })

    // Sort
    filtered.sort((a, b) => {
      let comparison = 0
      if (sortBy === 'issueDate') {
        comparison = parseISO(a.issueDate).getTime() - parseISO(b.issueDate).getTime()
      } else if (sortBy === 'dueDate') {
        comparison = parseISO(a.dueDate).getTime() - parseISO(b.dueDate).getTime()
      } else if (sortBy === 'amount') {
        comparison = a.amount - b.amount
      } else if (sortBy === 'id') {
        comparison = a.id.localeCompare(b.id)
      }
      return sortOrder === 'desc' ? -comparison : comparison
    })

    return filtered
  }, [searchTerm, statusFilter, invoices, sortBy, sortOrder])

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

  const getGuestName = (guestId) => {
    const guest = guests.find((g) => String(g.id) === String(guestId))
    return guest ? guest.name : 'Unknown Guest'
  }

  const getReservationInfo = (reservationId) => {
    const reservation = reservations.find((r) => r.id === reservationId)
    return reservation
  }

  const handleStatusChange = (invoiceId, newStatus) => {
    if (newStatus === 'Paid') {
      const invoice = invoices.find((inv) => inv.id === invoiceId)
      setSelectedInvoice(invoice)
      setPaymentMethod(invoice?.paymentMethod || '')
      setPaymentModalOpen(true)
    } else {
      if (window.confirm(`Are you sure you want to mark this invoice as ${newStatus}?`)) {
        updateInvoiceStatus(invoiceId, newStatus)
      }
    }
  }

  const handleMarkAsPaid = () => {
    if (!paymentMethod) {
      alert('Please select a payment method')
      return
    }
    updateInvoiceStatus(selectedInvoice.id, 'Paid', paymentMethod)
    setPaymentModalOpen(false)
    setSelectedInvoice(null)
    setPaymentMethod('')
  }

  const statusOptions = [
    { value: 'Pending', label: 'Pending' },
    { value: 'Paid', label: 'Paid' },
    { value: 'Cancelled', label: 'Cancelled' },
  ]

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Invoices / Accounting</h1>
        <p className="text-gray-600 mt-2">View and manage all invoices</p>
      </div>

      {/* Filters */}
      <div className="card mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <SearchInput
            value={searchTerm}
            onChange={setSearchTerm}
            placeholder="Search by invoice ID or reservation ID..."
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

      {/* Invoices Table */}
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
                    Invoice ID
                    <SortIcon column="id" />
                  </div>
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Reservation ID
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Guest
                </th>
                <th 
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('issueDate')}
                >
                  <div className="flex items-center gap-1">
                    Issue Date
                    <SortIcon column="issueDate" />
                  </div>
                </th>
                <th 
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('dueDate')}
                >
                  <div className="flex items-center gap-1">
                    Due Date
                    <SortIcon column="dueDate" />
                  </div>
                </th>
                <th 
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('amount')}
                >
                  <div className="flex items-center gap-1">
                    Amount
                    <SortIcon column="amount" />
                  </div>
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Payment Method
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredAndSortedInvoices.map((invoice) => {
                const reservation = getReservationInfo(invoice.reservationId)
                return (
                  <tr key={invoice.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{invoice.id}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{invoice.reservationId || '-'}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{getGuestName(invoice.guestId)}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {format(parseISO(invoice.issueDate), 'MMM dd, yyyy')}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {format(parseISO(invoice.dueDate), 'MMM dd, yyyy')}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        ${invoice.amount.toLocaleString()}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <StatusBadge
                        status={invoice.status}
                        type="invoice"
                      />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {invoice.paymentMethod || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      {invoice.status === 'Pending' && (
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleStatusChange(invoice.id, 'Paid')}
                            className="text-green-600 hover:text-green-900"
                          >
                            Mark Paid
                          </button>
                          <button
                            onClick={() => handleStatusChange(invoice.id, 'Cancelled')}
                            className="text-red-600 hover:text-red-900"
                          >
                            Cancel
                          </button>
                        </div>
                      )}
                      {invoice.status === 'Paid' && (
                        <span className="text-gray-400">-</span>
                      )}
                      {invoice.status === 'Cancelled' && (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {filteredAndSortedInvoices.length === 0 && (
            <div className="text-center py-12 text-gray-500">
              {invoices.length === 0
                ? 'No invoices yet. Create invoices from reservations.'
                : 'No invoices found matching your filters.'}
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 text-sm text-gray-600">
        Showing {filteredAndSortedInvoices.length} of {invoices.length} invoices
      </div>

      {/* Payment Method Modal */}
      <Modal
        isOpen={paymentModalOpen}
        onClose={() => {
          setPaymentModalOpen(false)
          setSelectedInvoice(null)
          setPaymentMethod('')
        }}
        title="Mark Invoice as Paid"
      >
        <div className="space-y-4">
          {selectedInvoice && (
            <>
              <div className="bg-gray-50 p-4 rounded-lg">
                <div className="text-sm space-y-2">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Invoice ID:</span>
                    <span className="font-medium">{selectedInvoice.id}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Amount:</span>
                    <span className="font-semibold">${selectedInvoice.amount.toLocaleString()}</span>
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Payment Method *
                </label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="input"
                  required
                >
                  <option value="">Select payment method</option>
                  <option value="Cash">Cash</option>
                  <option value="Card">Card</option>
                  <option value="Online">Online</option>
                </select>
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <button
                  onClick={() => {
                    setPaymentModalOpen(false)
                    setSelectedInvoice(null)
                    setPaymentMethod('')
                  }}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
                <button onClick={handleMarkAsPaid} className="btn btn-primary">
                  Mark as Paid
                </button>
              </div>
            </>
          )}
        </div>
      </Modal>
    </div>
  )
}

export default InvoicesPage

