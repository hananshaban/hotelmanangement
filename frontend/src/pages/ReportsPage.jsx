import { useMemo } from 'react'
import { format, parseISO } from 'date-fns'
import useStore from '../store/useStore'

const ReportsPage = () => {
  const { reservations, guests, invoices, expenses } = useStore()

  const exportToCSV = (data, filename) => {
    if (data.length === 0) {
      alert('No data to export')
      return
    }

    const headers = Object.keys(data[0])
    const csvContent = [
      headers.join(','),
      ...data.map((row) =>
        headers.map((header) => {
          const value = row[header]
          // Handle values that might contain commas or quotes
          if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
            return `"${value.replace(/"/g, '""')}"`
          }
          return value
        }).join(',')
      ),
    ].join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    link.setAttribute('href', url)
    link.setAttribute('download', filename)
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const exportToJSON = (data, filename) => {
    if (data.length === 0) {
      alert('No data to export')
      return
    }

    const jsonContent = JSON.stringify(data, null, 2)
    const blob = new Blob([jsonContent], { type: 'application/json' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    link.setAttribute('href', url)
    link.setAttribute('download', filename)
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const handleExportReservations = (format) => {
    const data = reservations.map((res) => ({
      id: res.id,
      guestName: res.guestName,
      roomNumber: res.roomNumber,
      checkIn: res.checkIn,
      checkOut: res.checkOut,
      status: res.status,
      totalAmount: res.totalAmount || 0,
      guestEmail: res.guestEmail || '',
      guestPhone: res.guestPhone || '',
    }))

    if (format === 'csv') {
      exportToCSV(data, `reservations-${format(new Date(), 'yyyy-MM-dd')}.csv`)
    } else {
      exportToJSON(data, `reservations-${format(new Date(), 'yyyy-MM-dd')}.json`)
    }
  }

  const handleExportGuests = (format) => {
    const data = guests.map((guest) => ({
      id: guest.id,
      name: guest.name,
      email: guest.email,
      phone: guest.phone,
      pastStays: guest.pastStays || 0,
      tags: (guest.tags || []).join('; '),
      notes: guest.notes || '',
    }))

    if (format === 'csv') {
      exportToCSV(data, `guests-${format(new Date(), 'yyyy-MM-dd')}.csv`)
    } else {
      exportToJSON(data, `guests-${format(new Date(), 'yyyy-MM-dd')}.json`)
    }
  }

  const handleExportInvoices = (format) => {
    const data = invoices.map((inv) => ({
      id: inv.id,
      reservationId: inv.reservationId || '',
      issueDate: inv.issueDate,
      dueDate: inv.dueDate,
      amount: inv.amount,
      status: inv.status,
      paymentMethod: inv.paymentMethod || '',
      notes: inv.notes || '',
    }))

    if (format === 'csv') {
      exportToCSV(data, `invoices-${format(new Date(), 'yyyy-MM-dd')}.csv`)
    } else {
      exportToJSON(data, `invoices-${format(new Date(), 'yyyy-MM-dd')}.json`)
    }
  }

  const handleExportExpenses = (format) => {
    const data = expenses.map((exp) => ({
      id: exp.id,
      category: exp.category,
      amount: exp.amount,
      date: exp.date,
      notes: exp.notes || '',
    }))

    if (format === 'csv') {
      exportToCSV(data, `expenses-${format(new Date(), 'yyyy-MM-dd')}.csv`)
    } else {
      exportToJSON(data, `expenses-${format(new Date(), 'yyyy-MM-dd')}.json`)
    }
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Reports & Export</h1>
        <p className="text-gray-600 mt-2">Export data in CSV or JSON format</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Reservations Export */}
        <div className="card">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Reservations</h2>
          <p className="text-sm text-gray-600 mb-4">
            Export {reservations.length} reservation records
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => handleExportReservations('csv')}
              className="btn btn-primary flex-1"
            >
              Export CSV
            </button>
            <button
              onClick={() => handleExportReservations('json')}
              className="btn btn-secondary flex-1"
            >
              Export JSON
            </button>
          </div>
        </div>

        {/* Guests Export */}
        <div className="card">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Guests</h2>
          <p className="text-sm text-gray-600 mb-4">
            Export {guests.length} guest records
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => handleExportGuests('csv')}
              className="btn btn-primary flex-1"
            >
              Export CSV
            </button>
            <button
              onClick={() => handleExportGuests('json')}
              className="btn btn-secondary flex-1"
            >
              Export JSON
            </button>
          </div>
        </div>

        {/* Invoices Export */}
        <div className="card">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Invoices</h2>
          <p className="text-sm text-gray-600 mb-4">
            Export {invoices.length} invoice records
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => handleExportInvoices('csv')}
              className="btn btn-primary flex-1"
            >
              Export CSV
            </button>
            <button
              onClick={() => handleExportInvoices('json')}
              className="btn btn-secondary flex-1"
            >
              Export JSON
            </button>
          </div>
        </div>

        {/* Expenses Export */}
        <div className="card">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Expenses</h2>
          <p className="text-sm text-gray-600 mb-4">
            Export {expenses.length} expense records
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => handleExportExpenses('csv')}
              className="btn btn-primary flex-1"
            >
              Export CSV
            </button>
            <button
              onClick={() => handleExportExpenses('json')}
              className="btn btn-secondary flex-1"
            >
              Export JSON
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ReportsPage

