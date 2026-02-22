import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import useStore from '../store/useStore'
import useAuthStore from '../store/authStore'
import Notifications from '../components/Notifications'

const MainLayout = ({ children, onLogout }) => {
  const location = useLocation()
  const navigate = useNavigate()
  const { darkMode, toggleDarkMode } = useStore()
  const { hotels, activeHotelId, switchHotel, getActiveHotel } = useAuthStore()
  const [isHotelDropdownOpen, setIsHotelDropdownOpen] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const handleLogout = () => {
    onLogout()
    navigate('/login')
  }

  const handleHotelSwitch = (hotelId) => {
    const success = switchHotel(hotelId)
    if (success) {
      setIsHotelDropdownOpen(false)
      // Reload the page to refresh all data stores
      window.location.reload()
    }
  }

  const activeHotel = getActiveHotel()

  const navigation = [
    { name: 'Dashboard', path: '/dashboard', icon: '📊' },
    { name: 'Rooms', path: '/rooms', icon: '🛏️' },
    { name: 'Room Types', path: '/room-types', icon: '🏨' },
    { name: 'Reservations', path: '/reservations', icon: '📅' },
    { name: 'Check-ins', path: '/check-ins', icon: '🔑' },
    { name: 'Calendar', path: '/calendar', icon: '🗓️' },
    { name: 'Availability', path: '/availability', icon: '🔍' },
    { name: 'Timeline', path: '/timeline', icon: '📊' },
    { name: 'Guests', path: '/guests', icon: '👥' },
    { name: 'Invoices', path: '/invoices', icon: '💰' },
    { name: 'Expenses', path: '/expenses', icon: '💸' },
    { name: 'Maintenance', path: '/maintenance', icon: '🔧' },
    { name: 'Reports', path: '/reports', icon: '📄' },
    { name: 'Audit Logs', path: '/audit-logs', icon: '📋' },
    { name: 'Settings', path: '/settings', icon: '⚙️' },
  ]

  const isActive = (path) => location.pathname === path

  return (
    <div className={`min-h-screen ${darkMode ? 'dark bg-gray-900' : 'bg-gray-50'}`}>
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div className={`fixed inset-y-0 left-0 w-64 ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border-r flex flex-col z-50 transform transition-transform duration-300 ease-in-out ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
        {/* Logo */}
        <div className={`flex items-center justify-center h-16 border-b ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
          <h1 className={`text-xl font-bold ${darkMode ? 'text-primary-400' : 'text-primary-600'}`}>Hotel Manager</h1>
        </div>

        {/* Hotel Switcher */}
        {hotels.length > 0 && (
          <div className={`px-4 py-4 border-b ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
            <div className="relative">
              <button
                onClick={() => setIsHotelDropdownOpen(!isHotelDropdownOpen)}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-lg transition-colors ${
                  darkMode
                    ? 'bg-gray-700 hover:bg-gray-600 text-gray-200'
                    : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                }`}
              >
                <div className="flex items-center gap-2 overflow-hidden">
                  <span className="text-lg">🏨</span>
                  <span className="font-medium truncate">
                    {activeHotel ? activeHotel.hotel_name : 'Select Hotel'}
                  </span>
                </div>
                <span className="text-sm ml-2">{isHotelDropdownOpen ? '▲' : '▼'}</span>
              </button>
              
              {isHotelDropdownOpen && (
                <div className={`absolute top-full left-0 right-0 mt-2 rounded-lg shadow-lg z-50 max-h-64 overflow-y-auto ${
                  darkMode ? 'bg-gray-700' : 'bg-white'
                }`}>
                  {hotels.map((hotel) => (
                    <button
                      key={hotel.id}
                      onClick={() => handleHotelSwitch(hotel.id)}
                      className={`w-full text-left px-4 py-3 transition-colors ${
                        hotel.id === activeHotelId
                          ? darkMode
                            ? 'bg-primary-900 text-primary-300'
                            : 'bg-primary-50 text-primary-700'
                          : darkMode
                          ? 'hover:bg-gray-600 text-gray-200'
                          : 'hover:bg-gray-50 text-gray-700'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {hotel.id === activeHotelId && <span>✓</span>}
                        <span className="truncate">{hotel.hotel_name}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {hotels.length === 0 && (
          <div className={`px-4 py-4 border-b ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
            <div className={`px-4 py-3 rounded-lg text-center ${
              darkMode ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-600'
            }`}>
              <p className="text-sm">No hotels assigned</p>
            </div>
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 px-4 py-6 space-y-2 overflow-y-auto">
          {navigation.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              onClick={() => setSidebarOpen(false)}
              className={`flex items-center px-4 py-3 rounded-lg transition-colors ${
                isActive(item.path)
                  ? darkMode
                    ? 'bg-primary-900 text-primary-300 font-medium'
                    : 'bg-primary-50 text-primary-700 font-medium'
                  : darkMode
                  ? 'text-gray-300 hover:bg-gray-700'
                  : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              <span className="mr-3 text-xl">{item.icon}</span>
              {item.name}
            </Link>
          ))}
        </nav>

        {/* Logout */}
        <div className={`p-4 border-t ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
          <button
            onClick={handleLogout}
            className={`w-full flex items-center px-4 py-3 rounded-lg transition-colors ${
              darkMode
                ? 'text-gray-300 hover:bg-gray-700'
                : 'text-gray-700 hover:bg-gray-50'
            }`}
          >
            <span className="mr-3">🚪</span>
            Logout
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="lg:pl-64">
        {/* Header */}
        <header className={`sticky top-0 z-30 ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border-b`}>
          <div className="flex items-center justify-between px-4 lg:px-8 py-4 gap-4">
            {/* Left: Hamburger menu and hotel name/title */}
            <div className="flex items-center gap-4 flex-1 min-w-0">
              <button
                onClick={() => setSidebarOpen(true)}
                className={`lg:hidden p-2 rounded-lg transition-colors ${
                  darkMode
                    ? 'bg-gray-700 text-gray-200 hover:bg-gray-600'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
                aria-label="Open menu"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              {/* Hotel name/title */}
              <span className={`text-xl font-bold truncate ${darkMode ? 'text-primary-400' : 'text-primary-600'}`}>Hotel Manager</span>
            </div>

            {/* Right: Notifications and dark mode toggle */}
            <div className="flex items-center gap-4">
              <Notifications />
              <button
                onClick={toggleDarkMode}
                className={`p-2 rounded-lg transition-colors ${
                  darkMode
                    ? 'bg-gray-700 text-yellow-400 hover:bg-gray-600'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
                title={darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              >
                {darkMode ? '☀️' : '🌙'}
              </button>
            </div>
          </div>
        </header>
        <main className={`p-4 lg:p-8 ${darkMode ? 'bg-gray-900' : ''}`}>{children}</main>
      </div>
    </div>
  )
}

export default MainLayout

