import { useMemo } from 'react'
import StatCard from '../components/StatCard'
import useStore from '../store/useStore'
import { format, isToday, parseISO, startOfMonth, endOfMonth, eachDayOfInterval, addDays, isWithinInterval, getMonth, getYear } from 'date-fns'
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line } from 'recharts'

const DashboardPage = () => {
  const { rooms, reservations, invoices, expenses } = useStore()

  const stats = useMemo(() => {
    const today = new Date()

    const totalRooms = rooms.length
    const occupiedRooms = rooms.filter((room) => room.status === 'Occupied').length
    const availableRooms = rooms.filter((room) => room.status === 'Available').length

    const todaysCheckIns = reservations.filter((res) => {
      const checkIn = parseISO(res.checkIn)
      return isToday(checkIn) && (res.status === 'Confirmed' || res.status === 'Checked-in')
    }).length

    const todaysCheckOuts = reservations.filter((res) => {
      const checkOut = parseISO(res.checkOut)
      return isToday(checkOut) && (res.status === 'Checked-in' || res.status === 'Checked-out')
    }).length

    const todaysRevenue = reservations
      .filter((res) => {
        const checkIn = parseISO(res.checkIn)
        const checkOut = parseISO(res.checkOut)
        return (
          (isToday(checkIn) || isToday(checkOut) || (checkIn <= today && checkOut >= today)) &&
          res.status !== 'Cancelled'
        )
      })
      .reduce((sum, res) => sum + (res.totalAmount || 0), 0)

    return {
      totalRooms,
      occupiedRooms,
      availableRooms,
      todaysCheckIns,
      todaysCheckOuts,
      todaysRevenue,
    }
  }, [rooms, reservations])

  // Financial calculations
  const financialStats = useMemo(() => {
    const totalRevenue = invoices
      .filter((inv) => inv.status === 'Paid')
      .reduce((sum, inv) => sum + inv.amount, 0)

    const totalExpensesAmount = expenses.reduce((sum, exp) => sum + exp.amount, 0)
    const profit = totalRevenue - totalExpensesAmount

    return {
      totalRevenue,
      totalExpenses: totalExpensesAmount,
      profit,
    }
  }, [invoices, expenses])

  // Advanced analytics calculations
  const cancellationRate = useMemo(() => {
    if (reservations.length === 0) return 0
    const cancelledCount = reservations.filter((res) => res.status === 'Cancelled').length
    return (cancelledCount / reservations.length) * 100
  }, [reservations])

  // Chart data: Reservations by Status (Pie Chart)
  const reservationStatusData = useMemo(() => {
    const statusCounts = reservations.reduce((acc, res) => {
      acc[res.status] = (acc[res.status] || 0) + 1
      return acc
    }, {})

    const COLORS = {
      'Confirmed': '#3b82f6',
      'Checked-in': '#10b981',
      'Checked-out': '#6b7280',
      'Cancelled': '#ef4444',
    }

    return Object.entries(statusCounts).map(([name, value]) => ({
      name,
      value,
      color: COLORS[name] || '#9ca3af',
    }))
  }, [reservations])

  // Chart data: Revenue per Month (Bar Chart) based on invoices
  const revenueByMonthData = useMemo(() => {
    const monthRevenue = {}
    
    invoices
      .filter((inv) => inv.status === 'Paid')
      .forEach((inv) => {
        const date = parseISO(inv.issueDate)
        const month = getMonth(date) + 1
        const monthKey = `${getYear(date)}-${String(month).padStart(2, '0')}`
        monthRevenue[monthKey] = (monthRevenue[monthKey] || 0) + inv.amount
      })

    // Get last 6 months
    const months = []
    for (let i = 5; i >= 0; i--) {
      const date = new Date()
      date.setMonth(date.getMonth() - i)
      const month = getMonth(date) + 1
      const monthKey = `${getYear(date)}-${String(month).padStart(2, '0')}`
      months.push({
        month: format(date, 'MMM yyyy'),
        revenue: monthRevenue[monthKey] || 0,
      })
    }

    return months
  }, [invoices])

  // Chart data: Occupancy over next 30 days (Line Chart)
  const occupancyData = useMemo(() => {
    const today = new Date()
    const next30Days = eachDayOfInterval({
      start: today,
      end: addDays(today, 30),
    })

    return next30Days.map((date) => {
      const occupiedCount = reservations.filter((res) => {
        if (res.status === 'Cancelled') return false
        const checkIn = parseISO(res.checkIn)
        const checkOut = parseISO(res.checkOut)
        return isWithinInterval(date, { start: checkIn, end: checkOut })
      }).length

      return {
        date: format(date, 'MMM dd'),
        occupied: occupiedCount,
      }
    })
  }, [reservations])

  const COLORS = ['#3b82f6', '#10b981', '#6b7280', '#ef4444', '#f59e0b']

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-600 mt-2">Welcome back! Here's an overview of your hotel.</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
        <StatCard
          title="Total Rooms"
          value={stats.totalRooms}
          icon={<span className="text-2xl">🛏️</span>}
        />
        <StatCard
          title="Occupied Rooms"
          value={stats.occupiedRooms}
          icon={<span className="text-2xl">🔴</span>}
        />
        <StatCard
          title="Available Rooms"
          value={stats.availableRooms}
          icon={<span className="text-2xl">🟢</span>}
        />
        <StatCard
          title="Today's Check-ins"
          value={stats.todaysCheckIns}
          icon={<span className="text-2xl">📥</span>}
        />
        <StatCard
          title="Today's Check-outs"
          value={stats.todaysCheckOuts}
          icon={<span className="text-2xl">📤</span>}
        />
        <StatCard
          title="Today's Revenue"
          value={`$${stats.todaysRevenue.toLocaleString()}`}
          icon={<span className="text-2xl">💰</span>}
        />
        <StatCard
          title="Total Revenue"
          value={`$${financialStats.totalRevenue.toLocaleString()}`}
          icon={<span className="text-2xl">💵</span>}
        />
        <StatCard
          title="Total Expenses"
          value={`$${financialStats.totalExpenses.toLocaleString()}`}
          icon={<span className="text-2xl">📉</span>}
        />
        <StatCard
          title="Profit"
          value={`$${financialStats.profit.toLocaleString()}`}
          icon={<span className="text-2xl">📊</span>}
          className={financialStats.profit >= 0 ? 'text-green-600' : 'text-red-600'}
        />
        <StatCard
          title="Cancellation Rate"
          value={`${cancellationRate.toFixed(1)}%`}
          icon={<span className="text-2xl">❌</span>}
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Reservations by Status - Pie Chart */}
        <div className="card">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Reservations by Status</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={reservationStatusData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {reservationStatusData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Revenue per Month - Bar Chart */}
        <div className="card">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Revenue per Month</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={revenueByMonthData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip formatter={(value) => `$${value.toLocaleString()}`} />
              <Legend />
              <Bar dataKey="revenue" fill="#3b82f6" name="Revenue ($)" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Occupancy Chart - Full Width */}
      <div className="card">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Occupancy Over Next 30 Days</h3>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={occupancyData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" angle={-45} textAnchor="end" height={80} />
            <YAxis />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey="occupied" stroke="#10b981" name="Rooms Occupied" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Advanced Analytics Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
        {/* Cancellation Rate Chart */}
        <div className="card">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Cancellation Rate</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={[
              { period: 'This Month', rate: cancellationRate },
              { period: 'Last Month', rate: cancellationRate * 1.1 },
            ]}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="period" />
              <YAxis />
              <Tooltip formatter={(value) => `${value.toFixed(1)}%`} />
              <Bar dataKey="rate" fill="#ef4444" name="Cancellation %" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}

export default DashboardPage

