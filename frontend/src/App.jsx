import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import RoomsPage from './pages/RoomsPage'
import ReservationsPage from './pages/ReservationsPage'
import CalendarPage from './pages/CalendarPage'
import AvailabilityPage from './pages/AvailabilityPage'
import BookingTimeline from './components/BookingTimeline'
import GuestsPage from './pages/GuestsPage'
import GuestProfilePage from './pages/GuestProfilePage'
import InvoicesPage from './pages/InvoicesPage'
import ExpensesPage from './pages/ExpensesPage'
import MaintenancePage from './pages/MaintenancePage'
import ReportsPage from './pages/ReportsPage'
import AuditLogsPage from './pages/AuditLogsPage'
import SettingsPage from './pages/SettingsPage'
import MainLayout from './layouts/MainLayout'
import useStore from './store/useStore'
import { parseISO, isToday, isPast } from 'date-fns'

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(
    () => localStorage.getItem('isAuthenticated') === 'true'
  )
  const { reservations, invoices, housekeeping, addNotification } = useStore()

  // Generate notifications
  useEffect(() => {
    if (!isAuthenticated) return

    const generateNotifications = () => {
      const today = new Date()

      // Check for today's check-ins
      const todaysCheckIns = reservations.filter((res) => {
        if (res.status === 'Cancelled') return false
        const checkIn = parseISO(res.checkIn)
        return isToday(checkIn) && (res.status === 'Confirmed' || res.status === 'Checked-in')
      })

      todaysCheckIns.forEach((res) => {
        addNotification({
          type: 'checkin',
          title: 'Check-in Today',
          message: `${res.guestName} - Room ${res.roomNumber}`,
          link: `/reservations`,
        })
      })

      // Check for today's check-outs
      const todaysCheckOuts = reservations.filter((res) => {
        if (res.status === 'Cancelled') return false
        const checkOut = parseISO(res.checkOut)
        return isToday(checkOut) && (res.status === 'Checked-in' || res.status === 'Checked-out')
      })

      todaysCheckOuts.forEach((res) => {
        addNotification({
          type: 'checkout',
          title: 'Check-out Today',
          message: `${res.guestName} - Room ${res.roomNumber}`,
          link: `/reservations`,
        })
      })

      // Check for overdue invoices
      const overdueInvoices = invoices.filter((inv) => {
        if (inv.status === 'Paid' || inv.status === 'Cancelled') return false
        const dueDate = parseISO(inv.dueDate)
        return isPast(dueDate)
      })

      overdueInvoices.forEach((inv) => {
        addNotification({
          type: 'invoice',
          title: 'Overdue Invoice',
          message: `Invoice ${inv.id} is overdue`,
          link: `/invoices`,
        })
      })

      // Check for rooms requiring cleaning
      const dirtyRooms = housekeeping.filter((hk) => hk.status === 'Dirty')

      dirtyRooms.forEach((hk) => {
        addNotification({
          type: 'cleaning',
          title: 'Room Requires Cleaning',
          message: `Room ${hk.roomId} is marked as dirty`,
          link: `/rooms?tab=housekeeping`,
        })
      })
    }

    generateNotifications()
    // Check every hour
    const interval = setInterval(generateNotifications, 60 * 60 * 1000)
    return () => clearInterval(interval)
  }, [isAuthenticated, reservations, invoices, housekeeping, addNotification])

  useEffect(() => {
    // Persist auth state
    if (isAuthenticated) {
      localStorage.setItem('isAuthenticated', 'true')
    } else {
      localStorage.removeItem('isAuthenticated')
    }
  }, [isAuthenticated])

  const handleLogin = () => {
    setIsAuthenticated(true)
  }

  const handleLogout = () => {
    setIsAuthenticated(false)
  }

  return (
    <Router>
      <Routes>
        <Route
          path="/login"
          element={
            isAuthenticated ? (
              <Navigate to="/dashboard" replace />
            ) : (
              <LoginPage onLogin={handleLogin} />
            )
          }
        />
        <Route
          path="/*"
          element={
            isAuthenticated ? (
              <MainLayout onLogout={handleLogout}>
                <Routes>
                  <Route path="/dashboard" element={<DashboardPage />} />
                  <Route path="/rooms" element={<RoomsPage />} />
                  <Route path="/reservations" element={<ReservationsPage />} />
                  <Route path="/calendar" element={<CalendarPage />} />
                  <Route path="/availability" element={<AvailabilityPage />} />
                  <Route path="/timeline" element={<BookingTimeline />} />
                  <Route path="/guests" element={<GuestsPage />} />
                  <Route path="/guests/:id" element={<GuestProfilePage />} />
                  <Route path="/invoices" element={<InvoicesPage />} />
                  <Route path="/expenses" element={<ExpensesPage />} />
                  <Route path="/maintenance" element={<MaintenancePage />} />
                  <Route path="/reports" element={<ReportsPage />} />
                  <Route path="/audit-logs" element={<AuditLogsPage />} />
                  <Route path="/settings" element={<SettingsPage />} />
                  <Route path="/" element={<Navigate to="/dashboard" replace />} />
                </Routes>
              </MainLayout>
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
      </Routes>
    </Router>
  )
}

export default App

