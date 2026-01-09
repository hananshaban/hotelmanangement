import { useEffect, useState } from 'react'
import { api } from '../utils/api.js'
import useAuthStore from '../store/authStore.js'
import { useToast } from '../hooks/useToast'
import { useConfirmation } from '../hooks/useConfirmation'
import { usePrompt } from '../hooks/usePrompt'

const SettingsPage = () => {
  const { user } = useAuthStore()
  const toast = useToast()
  const confirmation = useConfirmation()
  const prompt = usePrompt()
  const [activeTab, setActiveTab] = useState('hotel')
  const [settings, setSettings] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [clearingData, setClearingData] = useState(false)
  
  // Staff management state
  const [staff, setStaff] = useState([])
  const [staffLoading, setStaffLoading] = useState(false)
  const [staffError, setStaffError] = useState(null)
  const [showAddStaffForm, setShowAddStaffForm] = useState(false)
  const [editingStaff, setEditingStaff] = useState(null)
  const [newStaff, setNewStaff] = useState({
    email: '',
    password: '',
    first_name: '',
    last_name: '',
    role: 'VIEWER',
    is_active: true,
  })

  // Channel Manager state
  const [channelManagerStatus, setChannelManagerStatus] = useState(null)
  const [channelManagerLoading, setChannelManagerLoading] = useState(false)
  const [testingChannelManager, setTestingChannelManager] = useState(null)
  const [showQloAppsSetup, setShowQloAppsSetup] = useState(false)
  const [qloAppsConfig, setQloAppsConfig] = useState({
    baseUrl: '',
    apiKey: '',
    qloAppsHotelId: '',
  })
  const [savingQloAppsConfig, setSavingQloAppsConfig] = useState(false)
  const [qloAppsError, setQloAppsError] = useState(null)
  const [configDetails, setConfigDetails] = useState(null)
  const [isEditing, setIsEditing] = useState(false)
  const [pullingSyncStatus, setPullingSyncStatus] = useState(null)
  const [pullingSync, setPullingSync] = useState(false)

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        setLoading(true)
        setError(null)
        const data = await api.settings.get()
        setSettings(data)
      } catch (err) {
        setError(err.message || 'Failed to load hotel settings')
        console.error('Error fetching settings:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchSettings()
  }, [])

  useEffect(() => {
    const fetchStaff = async () => {
      if (activeTab === 'staff') {
        try {
          setStaffLoading(true)
          setStaffError(null)
          const data = await api.users.getAll()
          setStaff(data)
        } catch (err) {
          setStaffError(err.message || 'Failed to load staff')
          console.error('Error fetching staff:', err)
        } finally {
          setStaffLoading(false)
        }
      }
    }

    fetchStaff()
  }, [activeTab])

  // Channel Manager useEffect
  useEffect(() => {
    const fetchChannelManagerStatus = async () => {
      if (activeTab === 'channel-manager') {
        try {
          setChannelManagerLoading(true)
          const data = await api.channelManagers.getStatus()
          setChannelManagerStatus(data)
        } catch (err) {
          console.error('Error fetching channel manager status:', err)
          toast.error('Failed to load channel manager status')
        } finally {
          setChannelManagerLoading(false)
        }
      }
    }

    fetchChannelManagerStatus()
  }, [activeTab])

  // Fetch QloApps config details when configured
  useEffect(() => {
    const fetchQloAppsConfig = async () => {
      if (channelManagerStatus?.qloapps?.configured) {
        try {
          const config = await api.channelManagers.getQloAppsConfig()
          setConfigDetails(config)
        } catch (err) {
          console.error('Error fetching QloApps config:', err)
        }
      }
    }

    fetchQloAppsConfig()
  }, [channelManagerStatus])

  const handleAddStaff = async (e) => {
    e.preventDefault()
    try {
      setStaffError(null)
      await api.users.create(newStaff)
      
      // Refresh staff list
      const data = await api.users.getAll()
      setStaff(data)
      
      // Reset form
      setNewStaff({
        email: '',
        password: '',
        first_name: '',
        last_name: '',
        role: 'VIEWER',
        is_active: true,
      })
      setShowAddStaffForm(false)
      
      toast.success('Staff member added successfully!')
    } catch (err) {
      setStaffError(err.message || 'Failed to add staff member')
      console.error('Error adding staff:', err)
    }
  }

  const handleUpdateStaff = async (e) => {
    e.preventDefault()
    try {
      setStaffError(null)
      const updateData = {
        first_name: editingStaff.first_name,
        last_name: editingStaff.last_name,
        email: editingStaff.email,
        role: editingStaff.role,
        is_active: editingStaff.is_active,
      }
      
      // Only include password if it was provided
      if (editingStaff.password && editingStaff.password.trim() !== '') {
        updateData.password = editingStaff.password
      }
      
      await api.users.update(editingStaff.id, updateData)
      
      // Refresh staff list
      const data = await api.users.getAll()
      setStaff(data)
      
      setEditingStaff(null)
      toast.success('Staff member updated successfully!')
    } catch (err) {
      setStaffError(err.message || 'Failed to update staff member')
      console.error('Error updating staff:', err)
    }
  }

  const handleDeleteStaff = async (id) => {
    const confirmed = await confirmation({
      title: 'Delete Staff Member',
      message: 'Are you sure you want to delete this staff member?',
      variant: 'danger',
    })
    if (!confirmed) {
      return
    }

    try {
      setStaffError(null)
      await api.users.delete(id)
      
      // Refresh staff list
      const data = await api.users.getAll()
      setStaff(data)
      
      toast.success('Staff member deleted successfully!')
    } catch (err) {
      setStaffError(err.message || 'Failed to delete staff member')
      console.error('Error deleting staff:', err)
    }
  }

  const handleClearAllData = async () => {
    // Triple confirmation for safety
    const confirm1 = await confirmation({
      title: '⚠️ WARNING: Clear All Data',
      message: 'This will delete ALL data except users and integration configuration.\n\n' +
        'This includes:\n' +
        '- All reservations\n' +
        '- All guests\n' +
        '- All rooms and room types\n' +
        '- All invoices\n' +
        '- All expenses\n' +
        '- All maintenance requests\n' +
        '- All housekeeping records\n' +
        '- All audit logs\n\n' +
        'This action CANNOT be undone!\n\n' +
        'Are you absolutely sure you want to continue?',
      variant: 'danger',
    })
    
    if (!confirm1) return

    const confirm2 = await confirmation({
      title: 'Second Confirmation',
      message: 'This is your SECOND confirmation.\n\n' +
        'You are about to permanently delete all operational data.\n\n' +
        'Type "DELETE ALL" in the next prompt to confirm.',
      variant: 'danger',
    })
    
    if (!confirm2) return

    const confirmText = await prompt({
      title: 'Final Confirmation',
      message: 'Type "DELETE ALL" (in all caps) to confirm this action:',
      placeholder: 'DELETE ALL',
      validation: (value) => {
        if (value !== 'DELETE ALL') {
          return 'Confirmation text must be exactly "DELETE ALL"'
        }
        return true
      },
    })
    
    if (!confirmText || confirmText !== 'DELETE ALL') {
      toast.error('Confirmation text did not match. Operation cancelled.')
      return
    }

    try {
      setClearingData(true)
      setError(null)
      
      await api.settings.clearAllData()
      
      toast.success('All data cleared successfully! Users and integration configuration have been preserved.')
      
      // Refresh the page to show empty state
      window.location.reload()
    } catch (err) {
      setError(err.message || 'Failed to clear data')
      console.error('Error clearing data:', err)
      toast.error(`Failed to clear data: ${err.message || 'Unknown error'}`)
    } finally {
      setClearingData(false)
    }
  }

  // Channel Manager handlers
  const handleTestChannelManager = async () => {
    if (!channelManagerStatus?.qloapps?.configured) {
      toast.error('Please configure QloApps first')
      return
    }

    try {
      setTestingChannelManager('qloapps')
      const result = await api.channelManagers.testConnection()
      
      if (result.success) {
        const latencyMsg = result.latency ? ` (${result.latency}ms)` : ''
        toast.success(`✓ QloApps connection successful!${latencyMsg}`)
        
        if (result.hotelName) {
          toast.info(`Connected to: ${result.hotelName}`)
        }
      } else {
        toast.error(`✗ QloApps connection failed: ${result.message || result.error || 'Unknown error'}`)
      }
      
      // Refresh status and config
      const status = await api.channelManagers.getStatus()
      setChannelManagerStatus(status)
      
      if (status?.qloapps?.configured) {
        const config = await api.channelManagers.getQloAppsConfig()
        setConfigDetails(config)
      }
    } catch (err) {
      console.error('Error testing channel manager:', err)
      toast.error(`✗ Test failed: ${err.message || 'Unknown error'}`)
    } finally {
      setTestingChannelManager(null)
    }
  }

  const handleEditConfig = () => {
    if (!configDetails) return
    
    setQloAppsConfig({
      baseUrl: configDetails.baseUrl || '',
      apiKey: '', // Never pre-fill API key
      qloAppsHotelId: configDetails.qloAppsHotelId?.toString() || '',
    })
    setIsEditing(true)
    setShowQloAppsSetup(true)
  }

  const handlePullUpdates = async (fullSync = false) => {
    if (!configDetails?.syncEnabled) {
      toast.error('Sync is not enabled. Please enable sync in configuration.')
      return
    }

    try {
      setPullingSync(true)
      const result = await api.channelManagers.triggerPullSync({ fullSync })
      toast.success(`${fullSync ? 'Full' : 'Incremental'} sync started: ${result.message}`)
      
      // Poll for status updates
      let pollAttempts = 0
      const maxPollAttempts = 30 // 1 minute max
      const pollInterval = setInterval(async () => {
        try {
          const status = await api.channelManagers.getSyncStatus()
          setPullingSyncStatus(status)
          
          pollAttempts++
          
          // Stop polling if sync is no longer running or max attempts reached
          if (!status.isRunning || pollAttempts >= maxPollAttempts) {
            clearInterval(pollInterval)
            setPullingSync(false)
            
            if (status.lastSyncs?.reservations_inbound || status.lastSyncs?.full) {
              const lastSync = status.lastSyncs.reservations_inbound || status.lastSyncs.full
              if (lastSync.status === 'completed') {
                toast.success(
                  `✓ Sync completed! Processed: ${lastSync.itemsProcessed || 0}, ` +
                  `Created: ${lastSync.itemsCreated || 0}, Updated: ${lastSync.itemsUpdated || 0}`
                )
              } else if (lastSync.status === 'failed') {
                toast.error(`✗ Sync failed: ${lastSync.error || 'Unknown error'}`)
              }
            }
            
            // Refresh config to show updated sync time
            const config = await api.channelManagers.getQloAppsConfig()
            setConfigDetails(config)
          }
        } catch (err) {
          console.error('Error polling sync status:', err)
          clearInterval(pollInterval)
          setPullingSync(false)
        }
      }, 2000) // Poll every 2 seconds
    } catch (err) {
      console.error('Error triggering pull sync:', err)
      toast.error(`Failed to trigger sync: ${err.message || 'Unknown error'}`)
      setPullingSync(false)
    }
  }

  const handleSaveQloAppsConfig = async (e) => {
    e.preventDefault()
    try {
      setQloAppsError(null)
      setSavingQloAppsConfig(true)

      // Sanitize base URL: trim whitespace and remove trailing slash
      let baseUrl = qloAppsConfig.baseUrl.trim()
      if (baseUrl.endsWith('/')) {
        baseUrl = baseUrl.slice(0, -1)
      }

      // Remove /api suffix if present (endpoints already include this)
      if (baseUrl.endsWith('/api')) {
        baseUrl = baseUrl.slice(0, -4)
      }
      
      // Ensure URL starts with http:// or https://
      if (!baseUrl.match(/^https?:\/\//)) {
        setQloAppsError('Base URL must start with http:// or https://')
        setSavingQloAppsConfig(false)
        return
      }

      const payload = {
        baseUrl,
        qloAppsHotelId: parseInt(qloAppsConfig.qloAppsHotelId),
      }

      // Handle API key for new setup vs edit
      if (qloAppsConfig.apiKey && qloAppsConfig.apiKey.trim() !== '') {
        payload.apiKey = qloAppsConfig.apiKey
      } else if (!isEditing) {
        setQloAppsError('API Key is required for new setup')
        setSavingQloAppsConfig(false)
        return
      }

      const response = await api.channelManagers.setupQloApps(payload)

      if (response.success) {
        toast.success(isEditing ? 'Configuration updated successfully' : 'QloApps configured successfully')
        setShowQloAppsSetup(false)
        setIsEditing(false)
        
        // Refresh channel manager status
        const status = await api.channelManagers.getStatus()
        setChannelManagerStatus(status)
        
        // Fetch updated config details
        if (status?.qloapps?.configured) {
          const config = await api.channelManagers.getQloAppsConfig()
          setConfigDetails(config)
        }
        
        // Reset form
        setQloAppsConfig({
          baseUrl: '',
          apiKey: '',
          qloAppsHotelId: '',
        })
      }
    } catch (err) {
      const errorMessage = err.response?.data?.error || err.message || 'Failed to save configuration'
      setQloAppsError(errorMessage)
      toast.error(errorMessage)
    } finally {
      setSavingQloAppsConfig(false)
    }
  }

  if (loading) {
    return (
      <div>
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Settings</h1>
          <p className="text-gray-600 mt-2">Hotel information and configuration</p>
        </div>
        <div className="card">
          <div className="flex items-center justify-center py-8">
            <div className="text-gray-500">Loading settings...</div>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div>
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Settings</h1>
          <p className="text-gray-600 mt-2">Hotel information and configuration</p>
        </div>
        <div className="card">
          <div className="flex items-center justify-center py-8">
            <div className="text-red-600">Error: {error}</div>
          </div>
        </div>
      </div>
    )
  }

  if (!settings) {
    return (
      <div>
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Settings</h1>
          <p className="text-gray-600 mt-2">Hotel information and configuration</p>
        </div>
        <div className="card">
          <div className="flex items-center justify-center py-8">
            <div className="text-gray-500">No settings found</div>
          </div>
        </div>
      </div>
    )
  }

  // Format time (HH:MM:SS) to readable format (HH:MM)
  const formatTime = (time) => {
    if (!time) return 'N/A'
    return time.substring(0, 5) // Extract HH:MM from HH:MM:SS
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-600 mt-2">Hotel information and configuration</p>
      </div>

      {/* Tabs */}
      <div className="mb-6 border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('hotel')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'hotel'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Hotel Information
          </button>
          <button
            onClick={() => setActiveTab('channel-manager')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'channel-manager'
                ? 'border-purple-500 text-purple-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Channel Manager
          </button>
          <button
            onClick={() => setActiveTab('staff')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'staff'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Staff Management
          </button>
          {user?.role === 'SUPER_ADMIN' && (
            <button
              onClick={() => setActiveTab('data')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'data'
                  ? 'border-red-500 text-red-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Data Management
            </button>
          )}
        </nav>
      </div>

      {/* Hotel Settings Tab */}
      {activeTab === 'hotel' && (
        <div className="card">
        <h2 className="text-xl font-semibold text-gray-900 mb-6">Hotel Information</h2>
        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Hotel Name</label>
            <p className="text-gray-900">{settings.hotel_name || 'N/A'}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
            <p className="text-gray-900">
              {settings.address || 'N/A'}
              {settings.city && (
                <>
                  <br />
                  {settings.city}
                  {settings.country && `, ${settings.country}`}
                </>
              )}
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
            <p className="text-gray-900">{settings.phone || 'N/A'}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <p className="text-gray-900">{settings.email || 'N/A'}</p>
          </div>
          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Check-in Time
              </label>
              <p className="text-gray-900">{formatTime(settings.check_in_time)}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Check-out Time
              </label>
              <p className="text-gray-900">{formatTime(settings.check_out_time)}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Currency</label>
              <p className="text-gray-900">{settings.currency || 'N/A'}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tax Rate</label>
              <p className="text-gray-900">{settings.tax_rate ? `${settings.tax_rate}%` : 'N/A'}</p>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Timezone</label>
            <p className="text-gray-900">{settings.timezone || 'N/A'}</p>
          </div>
        </div>
      </div>
      )}

      {/* Channel Manager Tab */}
      {activeTab === 'channel-manager' && (
        <div className="space-y-6">
          <div className="card">
            <h2 className="text-xl font-semibold text-gray-900 mb-6">QloApps Channel Manager</h2>
            <p className="text-gray-600 mb-6">
              QloApps integration for synchronizing reservations, availability, and rates with your booking engine.
            </p>

            {channelManagerLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="text-gray-500">Loading channel manager status...</div>
              </div>
            ) : (
              <div className="space-y-6">
                {/* QloApps Status - Configured */}
                {channelManagerStatus?.qloapps?.configured && configDetails ? (
                  <div className="border-2 border-green-500 bg-green-50 rounded-lg p-6">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <span className="w-4 h-4 rounded-full bg-green-500"></span>
                        <span className="text-lg font-semibold text-gray-900">QloApps Configuration</span>
                      </div>
                      <span className="px-3 py-1 text-sm font-medium rounded-full bg-green-100 text-green-700">
                        ✓ Configured
                      </span>
                    </div>

                    <div className="space-y-3 mb-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-xs font-medium text-gray-600">Base URL</p>
                          <p className="text-sm text-gray-900 font-mono">{configDetails.baseUrl}</p>
                        </div>
                        <div>
                          <p className="text-xs font-medium text-gray-600">Hotel ID</p>
                          <p className="text-sm text-gray-900">{configDetails.qloAppsHotelId}</p>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-xs font-medium text-gray-600">Sync Interval</p>
                          <p className="text-sm text-gray-900">{configDetails.syncIntervalMinutes} minutes</p>
                        </div>
                        <div>
                          <p className="text-xs font-medium text-gray-600">Sync Status</p>
                          <div className="flex items-center gap-2">
                            {configDetails.syncEnabled ? (
                              <span className="inline-flex items-center px-2 py-0.5 text-xs bg-green-100 text-green-800 rounded-full">
                                ✓ Enabled
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded-full">
                                Disabled
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {configDetails.lastSuccessfulSync && (
                        <div>
                          <p className="text-xs font-medium text-gray-600">Last Successful Sync</p>
                          <p className="text-sm text-gray-900">
                            {new Date(configDetails.lastSuccessfulSync).toLocaleString()}
                          </p>
                        </div>
                      )}

                      {configDetails.lastSyncError && (
                        <div>
                          <p className="text-xs font-medium text-red-600">Last Error</p>
                          <p className="text-sm text-red-700">{configDetails.lastSyncError}</p>
                        </div>
                      )}
                    </div>

                    <div className="space-y-4">
                      <div className="flex flex-wrap gap-3">
                        <button
                          onClick={() => handlePullUpdates(false)}
                          disabled={pullingSync || !configDetails?.syncEnabled}
                          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition-colors"
                        >
                          {pullingSync ? (
                            <span className="flex items-center gap-2">
                              <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                              </svg>
                              Syncing...
                            </span>
                          ) : (
                            '↓ Pull Updates'
                          )}
                        </button>
                        <button
                          onClick={() => handlePullUpdates(true)}
                          disabled={pullingSync || !configDetails?.syncEnabled}
                          className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition-colors"
                        >
                          {pullingSync ? 'Syncing...' : '⟲ Full Sync'}
                        </button>
                        <button
                          onClick={handleTestChannelManager}
                          disabled={testingChannelManager === 'qloapps'}
                          className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition-colors"
                        >
                          {testingChannelManager === 'qloapps' ? (
                            <span className="flex items-center gap-2">
                              <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                              </svg>
                              Testing...
                            </span>
                          ) : (
                            'Test Connection'
                          )}
                        </button>
                        <button
                          onClick={handleEditConfig}
                          className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 text-sm font-medium transition-colors"
                        >
                          Edit Configuration
                        </button>
                      </div>

                      {/* Real-time Sync Status */}
                      {pullingSyncStatus?.isRunning && (
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                          <div className="flex items-center gap-2 mb-2">
                            <svg className="animate-spin h-4 w-4 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            <span className="text-sm font-medium text-blue-800">
                              Sync in progress... ({pullingSyncStatus.runningCount} job{pullingSyncStatus.runningCount !== 1 ? 's' : ''} running)
                            </span>
                          </div>
                          <p className="text-xs text-blue-600">
                            Please wait while we sync data from QloApps
                          </p>
                        </div>
                      )}

                      {/* Last Sync Status - Full Sync with 3 Phases */}
                      {pullingSyncStatus?.lastSyncs?.full && (
                        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                          <h4 className="text-sm font-semibold text-gray-900 mb-3">Last Full Sync</h4>
                          <div className="space-y-2 text-xs">
                            <div className="flex justify-between">
                              <span className="text-gray-600">Status:</span>
                              <span className={`font-medium ${pullingSyncStatus.lastSyncs.full.status === 'completed' ? 'text-green-600' : 'text-red-600'}`}>
                                {pullingSyncStatus.lastSyncs.full.status}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-600">Started:</span>
                              <span className="text-gray-900">{new Date(pullingSyncStatus.lastSyncs.full.startedAt).toLocaleString()}</span>
                            </div>
                            {pullingSyncStatus.lastSyncs.full.completedAt && (
                              <div className="flex justify-between">
                                <span className="text-gray-600">Completed:</span>
                                <span className="text-gray-900">{new Date(pullingSyncStatus.lastSyncs.full.completedAt).toLocaleString()}</span>
                              </div>
                            )}
                            {pullingSyncStatus.lastSyncs.full.durationMs && (
                              <div className="flex justify-between">
                                <span className="text-gray-600">Duration:</span>
                                <span className="text-gray-900">{(pullingSyncStatus.lastSyncs.full.durationMs / 1000).toFixed(1)}s</span>
                              </div>
                            )}
                            
                            {/* 3-Phase Breakdown */}
                            {pullingSyncStatus.lastSyncs.full.phases && (
                              <div className="mt-4 pt-3 border-t border-gray-300">
                                <p className="font-medium text-gray-700 mb-2">Sync Phases:</p>
                                
                                {/* Room Types */}
                                <div className="mb-2 pl-2">
                                  <p className="text-gray-700 font-medium">📋 Room Types</p>
                                  <div className="pl-4 space-y-1">
                                    <div className="flex justify-between">
                                      <span className="text-gray-600">Processed:</span>
                                      <span className="text-gray-900">{pullingSyncStatus.lastSyncs.full.phases.roomTypes.processed}</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-gray-600">Synced:</span>
                                      <span className="text-green-600 font-medium">{pullingSyncStatus.lastSyncs.full.phases.roomTypes.synced}</span>
                                    </div>
                                  </div>
                                </div>

                                {/* Customers */}
                                <div className="mb-2 pl-2">
                                  <p className="text-gray-700 font-medium">👥 Customers</p>
                                  <div className="pl-4 space-y-1">
                                    <div className="flex justify-between">
                                      <span className="text-gray-600">Processed:</span>
                                      <span className="text-gray-900">{pullingSyncStatus.lastSyncs.full.phases.customers.processed}</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-gray-600">Synced:</span>
                                      <span className="text-green-600 font-medium">{pullingSyncStatus.lastSyncs.full.phases.customers.synced}</span>
                                    </div>
                                  </div>
                                </div>

                                {/* Reservations */}
                                <div className="pl-2">
                                  <p className="text-gray-700 font-medium">📅 Reservations</p>
                                  <div className="pl-4 space-y-1">
                                    <div className="flex justify-between">
                                      <span className="text-gray-600">Processed:</span>
                                      <span className="text-gray-900">{pullingSyncStatus.lastSyncs.full.phases.reservations.processed}</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-gray-600">Created:</span>
                                      <span className="text-green-600 font-medium">{pullingSyncStatus.lastSyncs.full.phases.reservations.created}</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-gray-600">Updated:</span>
                                      <span className="text-blue-600 font-medium">{pullingSyncStatus.lastSyncs.full.phases.reservations.updated}</span>
                                    </div>
                                    {pullingSyncStatus.lastSyncs.full.phases.reservations.failed > 0 && (
                                      <div className="flex justify-between">
                                        <span className="text-gray-600">Failed:</span>
                                        <span className="text-red-600 font-medium">{pullingSyncStatus.lastSyncs.full.phases.reservations.failed}</span>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            )}

                            {pullingSyncStatus.lastSyncs.full.error && (
                              <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded">
                                <p className="text-red-700 text-xs">{pullingSyncStatus.lastSyncs.full.error}</p>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Last Incremental Sync */}
                      {pullingSyncStatus?.lastSyncs?.reservations_inbound && !pullingSyncStatus?.lastSyncs?.full && (
                        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                          <h4 className="text-sm font-semibold text-gray-900 mb-3">Last Pull Sync</h4>
                          <div className="space-y-2 text-xs">
                            <div className="flex justify-between">
                              <span className="text-gray-600">Status:</span>
                              <span className={`font-medium ${pullingSyncStatus.lastSyncs.reservations_inbound.status === 'completed' ? 'text-green-600' : 'text-red-600'}`}>
                                {pullingSyncStatus.lastSyncs.reservations_inbound.status}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-600">Processed:</span>
                              <span className="text-gray-900">{pullingSyncStatus.lastSyncs.reservations_inbound.itemsProcessed}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-600">Created:</span>
                              <span className="text-green-600 font-medium">{pullingSyncStatus.lastSyncs.reservations_inbound.itemsCreated}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-600">Updated:</span>
                              <span className="text-blue-600 font-medium">{pullingSyncStatus.lastSyncs.reservations_inbound.itemsUpdated}</span>
                            </div>
                            {pullingSyncStatus.lastSyncs.reservations_inbound.itemsFailed > 0 && (
                              <div className="flex justify-between">
                                <span className="text-gray-600">Failed:</span>
                                <span className="text-red-600 font-medium">{pullingSyncStatus.lastSyncs.reservations_inbound.itemsFailed}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  /* QloApps Status - Not Configured */
                  <div className="border-2 border-yellow-300 bg-yellow-50 rounded-lg p-6">
                    <div className="flex items-center gap-3 mb-4">
                      <svg className="w-6 h-6 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                      <span className="text-lg font-semibold text-gray-900">QloApps Not Configured</span>
                    </div>

                    <p className="text-sm text-gray-700 mb-4">
                      Connect your QloApps PMS to automatically sync reservations, availability, and rates.
                    </p>

                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                      <p className="text-sm font-medium text-blue-900 mb-2">You'll need:</p>
                      <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
                        <li>QloApps Base URL (e.g., https://hotel.qloapps.com)</li>
                        <li>WebService API Key</li>
                        <li>Hotel ID from QloApps</li>
                      </ul>
                    </div>

                    <button
                      onClick={() => {
                        setIsEditing(false)
                        setShowQloAppsSetup(true)
                      }}
                      className="w-full px-4 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm font-medium transition-colors"
                    >
                      Setup QloApps Connection
                    </button>
                  </div>
                )}

                {/* Features */}
                <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                  <h3 className="text-sm font-medium text-purple-800 mb-3">Sync Features</h3>
                  <ul className="text-sm text-purple-700 space-y-2">
                    <li className="flex items-center gap-2">
                      <span className="text-purple-500">✓</span>
                      Automatic reservation sync (create, update, cancel)
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="text-purple-500">✓</span>
                      Room availability updates
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="text-purple-500">✓</span>
                      Rate synchronization
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="text-purple-500">✓</span>
                      Room type mapping
                    </li>
                  </ul>
                </div>

                {/* Setup/Edit Configuration Form */}
                {showQloAppsSetup && (
                  <div className="border-2 border-blue-300 rounded-lg p-6 bg-blue-50">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">
                      {isEditing ? 'Edit QloApps Configuration' : 'Setup QloApps Connection'}
                    </h3>

                    {qloAppsError && (
                      <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-md">
                        <p className="text-sm text-red-800">{qloAppsError}</p>
                      </div>
                    )}

                    <form onSubmit={handleSaveQloAppsConfig} className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          QloApps Base URL *
                        </label>
                        <input
                          type="url"
                          value={qloAppsConfig.baseUrl}
                          onChange={(e) => setQloAppsConfig({ ...qloAppsConfig, baseUrl: e.target.value })}
                          placeholder="http://localhost:8080"
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                          required
                          pattern="https?://.+"
                        />
                        <p className="text-xs text-gray-500 mt-1">
                          Base URL only, without /api path (e.g., http://localhost:8080 or https://hotel.qloapps.com)
                        </p>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          QloApps Hotel ID *
                        </label>
                        <input
                          type="number"
                          value={qloAppsConfig.qloAppsHotelId}
                          onChange={(e) => setQloAppsConfig({ ...qloAppsConfig, qloAppsHotelId: e.target.value })}
                          placeholder="123"
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                          required
                          min="1"
                        />
                        <p className="text-xs text-gray-500 mt-1">Hotel ID from QloApps (id_hotel)</p>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          WebService API Key {!isEditing && '*'}
                        </label>
                        <input
                          type="password"
                          value={qloAppsConfig.apiKey}
                          onChange={(e) => setQloAppsConfig({ ...qloAppsConfig, apiKey: e.target.value })}
                          placeholder={isEditing ? "Leave blank to keep current key" : "Your API key (will be encrypted)"}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                          required={!isEditing}
                        />
                        <p className="text-xs text-gray-500 mt-1">
                          {isEditing 
                            ? 'Only enter a new API key if you want to change it. Leave blank to keep the current key.' 
                            : 'Your API key will be encrypted and never shown in plain text'}
                        </p>
                      </div>

                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                        <p className="text-sm text-blue-800">
                          <span className="font-medium">Sync Interval:</span> Automatically set to 5 minutes for optimal performance
                        </p>
                      </div>

                      <div className="flex gap-3 pt-4">
                        <button
                          type="submit"
                          disabled={savingQloAppsConfig}
                          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                        >
                          {savingQloAppsConfig ? 'Saving...' : 'Save Configuration'}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setShowQloAppsSetup(false)
                            setIsEditing(false)
                            setQloAppsError(null)
                            setQloAppsConfig({
                              baseUrl: '',
                              apiKey: '',
                              qloAppsHotelId: '',
                            })
                          }}
                          className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 font-medium"
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Staff Management Tab */}
      {activeTab === 'staff' && (
        <div className="space-y-6">
          <div className="card">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-gray-900">Staff Members</h2>
              <button
                onClick={() => {
                  setShowAddStaffForm(true)
                  setEditingStaff(null)
                }}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm"
              >
                Add Staff Member
              </button>
            </div>

            {staffError && (
              <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-md">
                <p className="text-sm text-red-800">{staffError}</p>
              </div>
            )}

            {staffLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="text-gray-500">Loading staff...</div>
              </div>
            ) : (
              <div className="space-y-4">
                {staff.length === 0 ? (
                  <p className="text-gray-500 text-center py-8">No staff members found</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Name
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Email
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Role
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Status
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Last Login
                          </th>
                          <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {staff.map((member) => (
                          <tr key={member.id}>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm font-medium text-gray-900">
                                {member.first_name} {member.last_name}
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm text-gray-500">{member.email}</div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800">
                                {member.role.replace('_', ' ')}
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span
                                className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                                  member.is_active
                                    ? 'bg-green-100 text-green-800'
                                    : 'bg-red-100 text-red-800'
                                }`}
                              >
                                {member.is_active ? 'Active' : 'Inactive'}
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {member.last_login
                                ? new Date(member.last_login).toLocaleDateString()
                                : 'Never'}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                              <button
                                onClick={() => {
                                  setEditingStaff({ ...member, password: '' })
                                  setShowAddStaffForm(false)
                                }}
                                className="text-blue-600 hover:text-blue-900 mr-4"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => handleDeleteStaff(member.id)}
                                className="text-red-600 hover:text-red-900"
                              >
                                Delete
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Add/Edit Staff Form */}
          {(showAddStaffForm || editingStaff) && (
            <div className="card">
              <h2 className="text-xl font-semibold text-gray-900 mb-6">
                {editingStaff ? 'Edit Staff Member' : 'Add New Staff Member'}
              </h2>

              <form
                onSubmit={editingStaff ? handleUpdateStaff : handleAddStaff}
                className="space-y-4"
              >
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      First Name *
                    </label>
                    <input
                      type="text"
                      value={editingStaff ? editingStaff.first_name : newStaff.first_name}
                      onChange={(e) =>
                        editingStaff
                          ? setEditingStaff({ ...editingStaff, first_name: e.target.value })
                          : setNewStaff({ ...newStaff, first_name: e.target.value })
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Last Name *
                    </label>
                    <input
                      type="text"
                      value={editingStaff ? editingStaff.last_name : newStaff.last_name}
                      onChange={(e) =>
                        editingStaff
                          ? setEditingStaff({ ...editingStaff, last_name: e.target.value })
                          : setNewStaff({ ...newStaff, last_name: e.target.value })
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Email *
                  </label>
                  <input
                    type="email"
                    value={editingStaff ? editingStaff.email : newStaff.email}
                    onChange={(e) =>
                      editingStaff
                        ? setEditingStaff({ ...editingStaff, email: e.target.value })
                        : setNewStaff({ ...newStaff, email: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                    disabled={!!editingStaff}
                  />
                </div>

                {!editingStaff && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Password *
                    </label>
                    <input
                      type="password"
                      value={newStaff.password}
                      onChange={(e) => setNewStaff({ ...newStaff, password: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                      minLength={6}
                    />
                  </div>
                )}

                {editingStaff && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      New Password (leave blank to keep current)
                    </label>
                    <input
                      type="password"
                      onChange={(e) =>
                        setEditingStaff({ ...editingStaff, password: e.target.value })
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      minLength={6}
                    />
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Role *
                  </label>
                  <select
                    value={editingStaff ? editingStaff.role : newStaff.role}
                    onChange={(e) =>
                      editingStaff
                        ? setEditingStaff({ ...editingStaff, role: e.target.value })
                        : setNewStaff({ ...newStaff, role: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  >
                    <option value="VIEWER">Viewer</option>
                    <option value="FRONT_DESK">Front Desk</option>
                    <option value="HOUSEKEEPING">Housekeeping</option>
                    <option value="MAINTENANCE">Maintenance</option>
                    <option value="MANAGER">Manager</option>
                    <option value="ADMIN">Admin</option>
                    <option value="SUPER_ADMIN">Super Admin</option>
                  </select>
                </div>

                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="is_active"
                    checked={editingStaff ? editingStaff.is_active : newStaff.is_active}
                    onChange={(e) =>
                      editingStaff
                        ? setEditingStaff({ ...editingStaff, is_active: e.target.checked })
                        : setNewStaff({ ...newStaff, is_active: e.target.checked })
                    }
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <label htmlFor="is_active" className="ml-2 block text-sm text-gray-900">
                    Active
                  </label>
                </div>

                <div className="flex gap-3 pt-4">
                  <button
                    type="submit"
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                  >
                    {editingStaff ? 'Update Staff Member' : 'Add Staff Member'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddStaffForm(false)
                      setEditingStaff(null)
                      setNewStaff({
                        email: '',
                        password: '',
                        first_name: '',
                        last_name: '',
                        role: 'VIEWER',
                        is_active: true,
                      })
                    }}
                    className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      )}

      {/* Data Management Tab - Only for SUPER_ADMIN */}
      {activeTab === 'data' && user?.role === 'SUPER_ADMIN' && (
        <div className="card">
          <h2 className="text-xl font-semibold text-gray-900 mb-6">Data Management</h2>
          <div className="space-y-6">
            <div className="bg-red-50 border border-red-200 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-red-900 mb-2">⚠️ Clear All Data</h3>
              <p className="text-red-800 mb-4">
                This action will permanently delete all operational data from the system, including:
              </p>
              <ul className="list-disc list-inside text-red-800 mb-4 space-y-1">
                <li>All reservations and bookings</li>
                <li>All guest records</li>
                <li>All rooms and room types</li>
                <li>All invoices and payments</li>
                <li>All expenses</li>
                <li>All maintenance requests</li>
                <li>All housekeeping records</li>
                <li>All audit logs</li>
              </ul>
              <p className="text-red-900 font-semibold mb-4">
                The following data will be preserved:
              </p>
              <ul className="list-disc list-inside text-green-800 mb-6 space-y-1">
                <li>All user accounts and authentication data</li>
                <li>QloApps configuration and integration data</li>
                <li>Hotel settings</li>
              </ul>
              <p className="text-red-900 font-bold mb-4">
                ⚠️ This action CANNOT be undone! ⚠️
              </p>
              <button
                onClick={handleClearAllData}
                disabled={clearingData}
                className="px-6 py-3 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:bg-red-400 disabled:cursor-not-allowed font-semibold"
              >
                {clearingData ? 'Clearing Data...' : 'Clear All Data'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default SettingsPage

