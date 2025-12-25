import { Link, useLocation } from 'react-router-dom'
import useStore from '../store/useStore'
import Notifications from '../components/Notifications'

const MainLayout = ({ children, onLogout }) => {
  const location = useLocation()
  const { darkMode, toggleDarkMode } = useStore()

  const navigation = [
    { name: 'Dashboard', path: '/dashboard', icon: '📊' },
    { name: 'Rooms', path: '/rooms', icon: '🛏️' },
    { name: 'Reservations', path: '/reservations', icon: '📅' },
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
      {/* Sidebar */}
      <div className={`fixed inset-y-0 left-0 w-64 ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border-r flex flex-col`}>
        {/* Logo */}
        <div className={`flex items-center justify-center h-16 border-b ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
          <h1 className={`text-xl font-bold ${darkMode ? 'text-primary-400' : 'text-primary-600'}`}>Hotel Manager</h1>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-4 py-6 space-y-2">
          {navigation.map((item) => (
            <Link
              key={item.path}
              to={item.path}
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
            onClick={onLogout}
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
      <div className="pl-64">
        {/* Header */}
        <header className={`sticky top-0 z-30 ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border-b`}>
          <div className="flex items-center justify-end px-8 py-4 gap-4">
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
        </header>
        <main className={`p-8 ${darkMode ? 'bg-gray-900' : ''}`}>{children}</main>
      </div>
    </div>
  )
}

export default MainLayout

