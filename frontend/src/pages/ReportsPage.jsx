import { useEffect } from 'react'
import { format } from 'date-fns'
import useReservationsStore from '../store/reservationsStore'
import useGuestsStore from '../store/guestsStore'
import useInvoicesStore from '../store/invoicesStore'
import useExpensesStore from '../store/expensesStore'
import { useToast } from '../hooks/useToast'

const ReportsPage = () => {
  const { reservations, fetchReservations } = useReservationsStore()
  const { guests, fetchGuests } = useGuestsStore()
  const { invoices, fetchInvoices } = useInvoicesStore()
  const { expenses, fetchExpenses } = useExpensesStore()
  const toast = useToast()

  // Fetch all data on mount
  useEffect(() => {
    fetchReservations()
    fetchGuests()
    fetchInvoices()
    fetchExpenses()
  }, [fetchReservations, fetchGuests, fetchInvoices, fetchExpenses])

  const exportToCSV = (data, filename) => {
    console.log('Exporting CSV:', { dataLength: data?.length, filename })
    
    if (!data || data.length === 0) {
      toast.error('No data to export')
      return
    }

    try {
      const headers = Object.keys(data[0])
      if (headers.length === 0) {
        toast.error('No data columns found')
        return
      }

      const csvContent = [
        headers.join(','),
        ...data.map((row) =>
          headers.map((header) => {
            let value = row[header]
            
            // Handle null/undefined
            if (value === null || value === undefined) {
              value = ''
            }
            
            // Convert to string
            value = String(value)
            
            // Handle values that might contain commas, quotes, or newlines
            if (value.includes(',') || value.includes('"') || value.includes('\n')) {
              return `"${value.replace(/"/g, '""')}"`
            }
            return value
          }).join(',')
        ),
      ].join('\n')

      // Add BOM for UTF-8 to ensure Excel opens it correctly
      const BOM = '\uFEFF'
      const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      link.style.position = 'fixed'
      link.style.left = '-9999px'
      link.style.top = '-9999px'
      
      document.body.appendChild(link)
      
      // Trigger download
      link.click()
      
      // Clean up after download starts (give browser time to start download)
      setTimeout(() => {
        if (document.body.contains(link)) {
          document.body.removeChild(link)
        }
        URL.revokeObjectURL(url)
      }, 200)
    } catch (error) {
      console.error('Export error:', error)
      toast.error('Failed to export data: ' + error.message)
    }
  }

  const exportToJSON = (data, filename) => {
    console.log('Exporting JSON:', { dataLength: data?.length, filename })
    
    if (!data || data.length === 0) {
      toast.error('No data to export')
      return
    }

    try {
      const jsonContent = JSON.stringify(data, null, 2)
      const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      link.style.position = 'fixed'
      link.style.left = '-9999px'
      link.style.top = '-9999px'
      
      document.body.appendChild(link)
      
      // Trigger download
      link.click()
      
      // Clean up after download starts (give browser time to start download)
      setTimeout(() => {
        if (document.body.contains(link)) {
          document.body.removeChild(link)
        }
        URL.revokeObjectURL(url)
      }, 200)
    } catch (error) {
      console.error('Export error:', error)
      toast.error('Failed to export data: ' + error.message)
    }
  }

  const handleExportReservations = (exportFormat) => {
    console.log('Export reservations clicked:', { exportFormat, reservationsCount: reservations?.length })
    
    if (!reservations || reservations.length === 0) {
      toast.error('No reservations to export. Please wait for data to load.')
      return
    }

    try {
      const data = reservations.map((res) => ({
        id: res.id || '',
        guestName: res.guestName || '',
        roomNumber: res.roomNumber || '',
        checkIn: res.checkIn || '',
        checkOut: res.checkOut || '',
        status: res.status || '',
        totalAmount: res.totalAmount || 0,
        guestEmail: res.guestEmail || '',
        guestPhone: res.guestPhone || '',
      }))

      const dateStr = format(new Date(), 'yyyy-MM-dd')
      if (exportFormat === 'csv') {
        exportToCSV(data, `reservations-${dateStr}.csv`)
      } else {
        exportToJSON(data, `reservations-${dateStr}.json`)
      }
    } catch (error) {
      console.error('Export reservations error:', error)
      toast.error('Failed to export reservations: ' + error.message)
    }
  }

  const handleExportGuests = (exportFormat) => {
    console.log('Export guests clicked:', { exportFormat, guestsCount: guests?.length })
    
    if (!guests || guests.length === 0) {
      toast.error('No guests to export. Please wait for data to load.')
      return
    }

    try {
      const data = guests.map((guest) => ({
        id: guest.id || '',
        name: guest.name || '',
        email: guest.email || '',
        phone: guest.phone || '',
        pastStays: guest.pastStays || 0,
        notes: guest.notes || '',
      }))

      const dateStr = format(new Date(), 'yyyy-MM-dd')
      if (exportFormat === 'csv') {
        exportToCSV(data, `guests-${dateStr}.csv`)
      } else {
        exportToJSON(data, `guests-${dateStr}.json`)
      }
    } catch (error) {
      console.error('Export guests error:', error)
      toast.error('Failed to export guests: ' + error.message)
    }
  }

  const handleExportInvoices = (exportFormat) => {
    console.log('Export invoices clicked:', { exportFormat, invoicesCount: invoices?.length })
    
    if (!invoices || invoices.length === 0) {
      toast.error('No invoices to export. Please wait for data to load.')
      return
    }

    try {
      const data = invoices.map((inv) => ({
        id: inv.id || '',
        reservationId: inv.reservationId || '',
        issueDate: inv.issueDate || '',
        dueDate: inv.dueDate || '',
        amount: inv.amount || 0,
        status: inv.status || '',
        paymentMethod: inv.paymentMethod || '',
        notes: inv.notes || '',
      }))

      const dateStr = format(new Date(), 'yyyy-MM-dd')
      if (exportFormat === 'csv') {
        exportToCSV(data, `invoices-${dateStr}.csv`)
      } else {
        exportToJSON(data, `invoices-${dateStr}.json`)
      }
    } catch (error) {
      console.error('Export invoices error:', error)
      toast.error('Failed to export invoices: ' + error.message)
    }
  }

  const handleExportExpenses = (exportFormat) => {
    console.log('Export expenses clicked:', { exportFormat, expensesCount: expenses?.length })
    
    if (!expenses || expenses.length === 0) {
      toast.error('No expenses to export. Please wait for data to load.')
      return
    }

    try {
      const data = expenses.map((exp) => ({
        id: exp.id || '',
        category: exp.category || '',
        amount: exp.amount || 0,
        date: exp.date || '',
        notes: exp.notes || '',
      }))

      const dateStr = format(new Date(), 'yyyy-MM-dd')
      if (exportFormat === 'csv') {
        exportToCSV(data, `expenses-${dateStr}.csv`)
      } else {
        exportToJSON(data, `expenses-${dateStr}.json`)
      }
    } catch (error) {
      console.error('Export expenses error:', error)
      toast.error('Failed to export expenses: ' + error.message)
    }
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Reports & Export</h1>
        <p className="text-gray-600 dark:text-gray-400 mt-2">Export data in CSV or JSON format</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Reservations Export */}
        <div className="card">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">Reservations</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            Export {reservations.length} reservation records
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => handleExportReservations('csv')}
              className="btn btn-primary flex-1"
            >
              Export CSV
            </button>
            <button
              type="button"
              onClick={() => handleExportReservations('json')}
              className="btn btn-secondary flex-1"
            >
              Export JSON
            </button>
          </div>
        </div>

        {/* Guests Export */}
        <div className="card">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">Guests</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            Export {guests.length} guest records
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => handleExportGuests('csv')}
              className="btn btn-primary flex-1"
            >
              Export CSV
            </button>
            <button
              type="button"
              onClick={() => handleExportGuests('json')}
              className="btn btn-secondary flex-1"
            >
              Export JSON
            </button>
          </div>
        </div>

        {/* Invoices Export */}
        <div className="card">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">Invoices</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            Export {invoices.length} invoice records
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => handleExportInvoices('csv')}
              className="btn btn-primary flex-1"
            >
              Export CSV
            </button>
            <button
              type="button"
              onClick={() => handleExportInvoices('json')}
              className="btn btn-secondary flex-1"
            >
              Export JSON
            </button>
          </div>
        </div>

        {/* Expenses Export */}
        <div className="card">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">Expenses</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            Export {expenses.length} expense records
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => handleExportExpenses('csv')}
              className="btn btn-primary flex-1"
            >
              Export CSV
            </button>
            <button
              type="button"
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

