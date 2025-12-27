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
  
  // Beds24 state
  const [beds24Config, setBeds24Config] = useState(null)
  const [beds24Loading, setBeds24Loading] = useState(false)
  const [beds24Error, setBeds24Error] = useState(null)
  const [inviteCode, setInviteCode] = useState('')
  const [beds24PropertyId, setBeds24PropertyId] = useState('')
  const [webhookSecret, setWebhookSecret] = useState('')
  const [testingConnection, setTestingConnection] = useState(false)
  const [syncStatusInterval, setSyncStatusInterval] = useState(null) // Phase 7: Poll sync status
  
  // Room mapping state
  const [beds24Rooms, setBeds24Rooms] = useState([])
  const [pmsRooms, setPmsRooms] = useState([])
  const [roomsLoading, setRoomsLoading] = useState(false)
  const [mappingRoom, setMappingRoom] = useState(null) // { pmsRoomId, beds24RoomId }
  
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
    const fetchBeds24Config = async () => {
      try {
        setBeds24Loading(true)
        setBeds24Error(null)
        const data = await api.settings.getBeds24Config()
        setBeds24Config(data)
      } catch (err) {
        setBeds24Error(err.message || 'Failed to load Beds24 configuration')
        console.error('Error fetching Beds24 config:', err)
      } finally {
        setBeds24Loading(false)
      }
    }

    if (activeTab === 'beds24') {
      fetchBeds24Config()
    }
  }, [activeTab])

  // Phase 7: Poll sync status when sync is running
  useEffect(() => {
    if (beds24Config?.syncStatus === 'running') {
      // Poll every 3 seconds when sync is running
      const interval = setInterval(async () => {
        try {
          const data = await api.settings.getBeds24Config()
          setBeds24Config(data)
          
          // Stop polling if sync completed or failed
          if (data.syncStatus === 'completed' || data.syncStatus === 'failed') {
            clearInterval(interval)
            setSyncStatusInterval(null)
          }
        } catch (err) {
          console.error('Error polling sync status:', err)
        }
      }, 3000)
      
      setSyncStatusInterval(interval)
      
      return () => {
        clearInterval(interval)
        setSyncStatusInterval(null)
      }
    } else {
      // Clear interval if sync is not running
      if (syncStatusInterval) {
        clearInterval(syncStatusInterval)
        setSyncStatusInterval(null)
      }
    }
  }, [beds24Config?.syncStatus])

  useEffect(() => {
    const fetchRooms = async () => {
      if (activeTab === 'beds24' && beds24Config?.configured) {
        try {
          setRoomsLoading(true)
          const [beds24RoomsData, pmsRoomsData] = await Promise.all([
            api.settings.getUnmappedBeds24Rooms().catch(() => []),
            api.settings.getPmsRoomsWithMapping().catch(() => []),
          ])
          setBeds24Rooms(beds24RoomsData)
          setPmsRooms(pmsRoomsData)
        } catch (err) {
          console.error('Error fetching rooms:', err)
        } finally {
          setRoomsLoading(false)
        }
      }
    }

    fetchRooms()
  }, [activeTab, beds24Config?.configured])

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

  const handleAuthenticateBeds24 = async (e) => {
    e.preventDefault()
    if (!inviteCode || !beds24PropertyId) {
      setBeds24Error('Please provide both invite code and Beds24 property ID')
      return
    }

    try {
      setBeds24Loading(true)
      setBeds24Error(null)
      const result = await api.settings.authenticateBeds24(inviteCode, beds24PropertyId)
      
      // Refresh config
      const config = await api.settings.getBeds24Config()
      setBeds24Config(config)
      
      // Clear form
      setInviteCode('')
      setBeds24PropertyId('')
      
      toast.success('Beds24 authentication successful!')
    } catch (err) {
      setBeds24Error(err.message || 'Failed to authenticate with Beds24')
      console.error('Error authenticating Beds24:', err)
    } finally {
      setBeds24Loading(false)
    }
  }

  const handleUpdateBeds24Config = async (updates) => {
    try {
      setBeds24Loading(true)
      setBeds24Error(null)
      const config = await api.settings.updateBeds24Config(updates)
      setBeds24Config(config)
    } catch (err) {
      setBeds24Error(err.message || 'Failed to update Beds24 configuration')
      console.error('Error updating Beds24 config:', err)
    } finally {
      setBeds24Loading(false)
    }
  }

  const handleTestConnection = async () => {
    try {
      setTestingConnection(true)
      setBeds24Error(null)
      const result = await api.settings.testBeds24Connection()
      toast.success(`Connection successful! Scopes: ${result.scopes?.join(', ') || 'N/A'}`)
    } catch (err) {
      setBeds24Error(err.message || 'Connection test failed')
      console.error('Error testing connection:', err)
    } finally {
      setTestingConnection(false)
    }
  }

  const handleTriggerInitialSync = async () => {
    const confirmed = await confirmation({
      title: 'Trigger Initial Sync',
      message: 'This will sync all rooms and reservations from Beds24. This may take several minutes. Continue?',
      variant: 'warning',
    })
    if (!confirmed) {
      return
    }

    try {
      setBeds24Loading(true)
      setBeds24Error(null)
      await api.settings.triggerInitialSync()
      
      // Phase 7: Refresh config immediately to show sync status
      const config = await api.settings.getBeds24Config()
      setBeds24Config(config)
      
      if (config.syncStatus === 'running') {
        // Status will auto-update via polling
      } else {
        toast.info('Initial sync started in background. This may take several minutes. Check back later.')
      }
    } catch (err) {
      setBeds24Error(err.message || 'Failed to start initial sync')
      console.error('Error triggering initial sync:', err)
    } finally {
      setBeds24Loading(false)
    }
  }

  const handleMapRoom = async (pmsRoomId, beds24RoomId) => {
    try {
      setBeds24Error(null)
      await api.settings.mapRoom(pmsRoomId, beds24RoomId)
      
      // Refresh rooms
      const [beds24RoomsData, pmsRoomsData] = await Promise.all([
        api.settings.getUnmappedBeds24Rooms().catch(() => []),
        api.settings.getPmsRoomsWithMapping().catch(() => []),
      ])
      setBeds24Rooms(beds24RoomsData)
      setPmsRooms(pmsRoomsData)
      
      toast.success('Room mapped successfully!')
    } catch (err) {
      setBeds24Error(err.message || 'Failed to map room')
      console.error('Error mapping room:', err)
    }
  }

  const handleUnmapRoom = async (roomId) => {
    const confirmed = await confirmation({
      title: 'Unmap Room',
      message: 'Are you sure you want to unmap this room?',
      variant: 'warning',
    })
    if (!confirmed) {
      return
    }

    try {
      setBeds24Error(null)
      await api.settings.unmapRoom(roomId)
      
      // Refresh rooms
      const [beds24RoomsData, pmsRoomsData] = await Promise.all([
        api.settings.getUnmappedBeds24Rooms().catch(() => []),
        api.settings.getPmsRoomsWithMapping().catch(() => []),
      ])
      setBeds24Rooms(beds24RoomsData)
      setPmsRooms(pmsRoomsData)
      
      toast.success('Room unmapped successfully!')
    } catch (err) {
      setBeds24Error(err.message || 'Failed to unmap room')
      console.error('Error unmapping room:', err)
    }
  }

  const handleAutoCreateRooms = async () => {
    const confirmed = await confirmation({
      title: 'Auto-Create Rooms',
      message: 'This will create PMS rooms for all unmapped Beds24 rooms. Continue?',
      variant: 'warning',
    })
    if (!confirmed) {
      return
    }

    try {
      setRoomsLoading(true)
      setBeds24Error(null)
      const result = await api.settings.autoCreateRooms({
        defaultPrice: 100,
        defaultFloor: 1,
      })
      
      toast.success(`Created ${result.created} rooms, skipped ${result.skipped}`)
      
      // Refresh rooms
      const [beds24RoomsData, pmsRoomsData] = await Promise.all([
        api.settings.getUnmappedBeds24Rooms().catch(() => []),
        api.settings.getPmsRoomsWithMapping().catch(() => []),
      ])
      setBeds24Rooms(beds24RoomsData)
      setPmsRooms(pmsRoomsData)
    } catch (err) {
      setBeds24Error(err.message || 'Failed to auto-create rooms')
      console.error('Error auto-creating rooms:', err)
    } finally {
      setRoomsLoading(false)
    }
  }

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
      message: 'This will delete ALL data except users and Beds24 token data.\n\n' +
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
      
      toast.success('All data cleared successfully! Users and Beds24 configuration have been preserved.')
      
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
            onClick={() => setActiveTab('beds24')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'beds24'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Beds24 Integration
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

      {/* Beds24 Settings Tab */}
      {activeTab === 'beds24' && (
        <div className="space-y-6">
          {/* Authentication Section */}
          <div className="card">
            <h2 className="text-xl font-semibold text-gray-900 mb-6">Beds24 Authentication</h2>
            
            {beds24Error && (
              <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-md">
                <p className="text-sm text-red-800">{beds24Error}</p>
              </div>
            )}

            {beds24Loading && !beds24Config ? (
              <div className="flex items-center justify-center py-8">
                <div className="text-gray-500">Loading Beds24 configuration...</div>
              </div>
            ) : beds24Config?.configured ? (
              <div className="space-y-4">
                <div className="p-4 bg-green-50 border border-green-200 rounded-md">
                  <p className="text-sm text-green-800 font-medium">✓ Beds24 is configured</p>
                  <p className="text-sm text-green-700 mt-1">
                    Property ID: {beds24Config.beds24PropertyId}
                  </p>
                  {beds24Config.lastSuccessfulSync && (
                    <p className="text-sm text-green-700 mt-1">
                      Last sync: {new Date(beds24Config.lastSuccessfulSync).toLocaleString()}
                    </p>
                  )}
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={handleTestConnection}
                    disabled={testingConnection}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {testingConnection ? 'Testing...' : 'Test Connection'}
                  </button>
                  <button
                    onClick={handleTriggerInitialSync}
                    disabled={beds24Loading || beds24Config?.syncStatus === 'running'}
                    className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {beds24Config?.syncStatus === 'running' ? 'Syncing...' : beds24Loading ? 'Starting...' : 'Run Initial Sync'}
                  </button>
                  <button
                    onClick={async () => {
                      try {
                        const data = await api.settings.getBeds24Config()
                        setBeds24Config(data)
                      } catch (err) {
                        console.error('Error refreshing config:', err)
                      }
                    }}
                    className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
                  >
                    Refresh Status
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleAuthenticateBeds24} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Invite Code
                  </label>
                  <input
                    type="text"
                    value={inviteCode}
                    onChange={(e) => setInviteCode(e.target.value)}
                    placeholder="Paste your Beds24 invite code here"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                  <p className="mt-1 text-sm text-gray-500">
                    Get your invite code from{' '}
                    <a
                      href="https://beds24.com/control3.php?pagetype=apiv2"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline"
                    >
                      Beds24 API Settings
                    </a>
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Beds24 Property ID
                  </label>
                  <input
                    type="text"
                    value={beds24PropertyId}
                    onChange={(e) => setBeds24PropertyId(e.target.value)}
                    placeholder="Enter your Beds24 property ID"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                  <p className="mt-1 text-sm text-gray-500">
                    Your Beds24 property identifier
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={beds24Loading}
                  className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {beds24Loading ? 'Authenticating...' : 'Authenticate with Beds24'}
                </button>
              </form>
            )}
          </div>

          {/* Phase 7: Sync Status Section */}
          {beds24Config?.configured && beds24Config?.syncStatus && (
            <div className="card">
              <h2 className="text-xl font-semibold text-gray-900 mb-6">Sync Status</h2>
              
              <div className="space-y-4">
                {/* Sync Status Badge */}
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-gray-700">Status:</span>
                  <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                    beds24Config.syncStatus === 'running' ? 'bg-blue-100 text-blue-800' :
                    beds24Config.syncStatus === 'completed' ? 'bg-green-100 text-green-800' :
                    beds24Config.syncStatus === 'failed' ? 'bg-red-100 text-red-800' :
                    'bg-gray-100 text-gray-800'
                  }`}>
                    {beds24Config.syncStatus === 'running' && '🔄 Running'}
                    {beds24Config.syncStatus === 'completed' && '✓ Completed'}
                    {beds24Config.syncStatus === 'failed' && '✗ Failed'}
                    {beds24Config.syncStatus === 'idle' && '○ Idle'}
                  </span>
                  {beds24Config.syncStartedAt && (
                    <span className="text-sm text-gray-500">
                      Started: {new Date(beds24Config.syncStartedAt).toLocaleString()}
                    </span>
                  )}
                  {beds24Config.syncCompletedAt && (
                    <span className="text-sm text-gray-500">
                      Completed: {new Date(beds24Config.syncCompletedAt).toLocaleString()}
                    </span>
                  )}
                </div>

                {/* Sync Progress */}
                {beds24Config.syncProgress && (
                  <div className="space-y-3">
                    {/* Rooms Progress */}
                    {beds24Config.syncProgress.rooms && (
                      <div>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="font-medium text-gray-700">Rooms</span>
                          <span className="text-gray-600">
                            {beds24Config.syncProgress.rooms.synced || 0} / {beds24Config.syncProgress.rooms.total || 0}
                            {beds24Config.syncProgress.rooms.errors > 0 && (
                              <span className="text-red-600 ml-2">
                                ({beds24Config.syncProgress.rooms.errors} errors)
                              </span>
                            )}
                          </span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className={`h-2 rounded-full ${
                              beds24Config.syncProgress.rooms.errors > 0 ? 'bg-yellow-500' : 'bg-blue-600'
                            }`}
                            style={{
                              width: `${beds24Config.syncProgress.rooms.total > 0
                                ? (beds24Config.syncProgress.rooms.synced / beds24Config.syncProgress.rooms.total) * 100
                                : 0}%`
                            }}
                          />
                        </div>
                      </div>
                    )}

                    {/* Reservations Progress */}
                    {beds24Config.syncProgress.reservations && (
                      <div>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="font-medium text-gray-700">Reservations</span>
                          <span className="text-gray-600">
                            {beds24Config.syncProgress.reservations.synced || 0} / {beds24Config.syncProgress.reservations.total || 0}
                            {beds24Config.syncProgress.reservations.errors > 0 && (
                              <span className="text-red-600 ml-2">
                                ({beds24Config.syncProgress.reservations.errors} errors)
                              </span>
                            )}
                          </span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className={`h-2 rounded-full ${
                              beds24Config.syncProgress.reservations.errors > 0 ? 'bg-yellow-500' : 'bg-blue-600'
                            }`}
                            style={{
                              width: `${beds24Config.syncProgress.reservations.total > 0
                                ? (beds24Config.syncProgress.reservations.synced / beds24Config.syncProgress.reservations.total) * 100
                                : 0}%`
                            }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Sync Errors */}
                {beds24Config.syncErrors && Array.isArray(beds24Config.syncErrors) && beds24Config.syncErrors.length > 0 && (
                  <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-md">
                    <h3 className="text-sm font-medium text-red-800 mb-2">Sync Errors:</h3>
                    <ul className="space-y-1">
                      {beds24Config.syncErrors.slice(0, 10).map((error, index) => (
                        <li key={index} className="text-sm text-red-700">
                          <span className="font-medium">{error.type}:</span> {error.message}
                          {error.details && (
                            <span className="text-red-600 ml-2">
                              ({JSON.stringify(error.details)})
                            </span>
                          )}
                        </li>
                      ))}
                      {beds24Config.syncErrors.length > 10 && (
                        <li className="text-sm text-red-600 italic">
                          ... and {beds24Config.syncErrors.length - 10} more errors
                        </li>
                      )}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Configuration Section */}
          {beds24Config?.configured && (
            <div className="card">
              <h2 className="text-xl font-semibold text-gray-900 mb-6">Sync Configuration</h2>
              
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Enable Sync
                    </label>
                    <p className="text-sm text-gray-500">Master switch for all Beds24 sync</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={beds24Config.syncEnabled || false}
                      onChange={(e) => handleUpdateBeds24Config({ syncEnabled: e.target.checked })}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Push Sync (PMS → Beds24)
                    </label>
                    <p className="text-sm text-gray-500">Sync reservations and availability to Beds24</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={beds24Config.pushSyncEnabled || false}
                      onChange={(e) => handleUpdateBeds24Config({ pushSyncEnabled: e.target.checked })}
                      disabled={!beds24Config.syncEnabled}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600 peer-disabled:opacity-50"></div>
                  </label>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Pull Sync (Beds24 → PMS)
                    </label>
                    <p className="text-sm text-gray-500">Sync bookings from Beds24 to PMS</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={beds24Config.pullSyncEnabled || false}
                      onChange={(e) => handleUpdateBeds24Config({ pullSyncEnabled: e.target.checked })}
                      disabled={!beds24Config.syncEnabled}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600 peer-disabled:opacity-50"></div>
                  </label>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Webhooks
                    </label>
                    <p className="text-sm text-gray-500">Receive real-time updates from Beds24</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={beds24Config.webhookEnabled || false}
                      onChange={(e) => handleUpdateBeds24Config({ webhookEnabled: e.target.checked })}
                      disabled={!beds24Config.syncEnabled}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600 peer-disabled:opacity-50"></div>
                  </label>
                </div>

                <div className="pt-4 border-t border-gray-200">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Webhook Secret (Optional)
                  </label>
                  <input
                    type="password"
                    value={webhookSecret}
                    onChange={(e) => setWebhookSecret(e.target.value)}
                    placeholder="Enter webhook secret from Beds24"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="mt-1 text-sm text-gray-500">
                    Set this in Beds24 webhook settings for signature verification
                  </p>
                  {webhookSecret && (
                    <button
                      onClick={() => handleUpdateBeds24Config({ webhookSecret })}
                      className="mt-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm"
                    >
                      Save Webhook Secret
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Room Mapping Section */}
          {beds24Config?.configured && (
            <div className="card">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold text-gray-900">Room Mapping</h2>
                {beds24Rooms.length > 0 && (
                  <button
                    onClick={handleAutoCreateRooms}
                    disabled={roomsLoading}
                    className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                  >
                    {roomsLoading ? 'Creating...' : `Auto-Create ${beds24Rooms.length} Rooms`}
                  </button>
                )}
              </div>

              {roomsLoading && !beds24Rooms.length && !pmsRooms.length ? (
                <div className="flex items-center justify-center py-8">
                  <div className="text-gray-500">Loading rooms...</div>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Unmapped Beds24 Rooms */}
                  {beds24Rooms.length > 0 && (
                    <div>
                      <h3 className="text-lg font-medium text-gray-900 mb-4">
                        Unmapped Beds24 Rooms ({beds24Rooms.length})
                      </h3>
                      <div className="space-y-2">
                        {beds24Rooms.map((beds24Room) => (
                          <div
                            key={beds24Room.id}
                            className="flex items-center justify-between p-3 border border-gray-200 rounded-md"
                          >
                            <div>
                              <p className="font-medium text-gray-900">
                                {beds24Room.name || `Room ${beds24Room.id}`}
                              </p>
                              <p className="text-sm text-gray-500">
                                Beds24 ID: {beds24Room.id} | Type: {beds24Room.type || 'N/A'} | Max Guests: {beds24Room.maxGuests || 'N/A'}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <select
                                onChange={(e) => {
                                  if (e.target.value) {
                                    handleMapRoom(e.target.value, beds24Room.id.toString())
                                    e.target.value = ''
                                  }
                                }}
                                className="px-3 py-1 border border-gray-300 rounded-md text-sm"
                                defaultValue=""
                              >
                                <option value="">Map to PMS room...</option>
                                {pmsRooms
                                  .filter((r) => !r.beds24_room_id)
                                  .map((pmsRoom) => (
                                    <option key={pmsRoom.id} value={pmsRoom.id}>
                                      {pmsRoom.room_number} ({pmsRoom.type})
                                    </option>
                                  ))}
                              </select>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Mapped PMS Rooms */}
                  <div>
                    <h3 className="text-lg font-medium text-gray-900 mb-4">
                      Mapped Rooms ({pmsRooms.filter((r) => r.beds24_room_id).length})
                    </h3>
                    {pmsRooms.filter((r) => r.beds24_room_id).length === 0 ? (
                      <p className="text-gray-500 text-sm">No rooms mapped yet</p>
                    ) : (
                      <div className="space-y-2">
                        {pmsRooms
                          .filter((r) => r.beds24_room_id)
                          .map((pmsRoom) => (
                            <div
                              key={pmsRoom.id}
                              className="flex items-center justify-between p-3 border border-gray-200 rounded-md bg-green-50"
                            >
                              <div>
                                <p className="font-medium text-gray-900">
                                  {pmsRoom.room_number} ({pmsRoom.type})
                                </p>
                                <p className="text-sm text-gray-500">
                                  Mapped to Beds24 Room ID: {pmsRoom.beds24_room_id}
                                </p>
                              </div>
                              <button
                                onClick={() => handleUnmapRoom(pmsRoom.id)}
                                className="px-3 py-1 text-sm text-red-600 hover:text-red-700 border border-red-300 rounded-md hover:bg-red-50"
                              >
                                Unmap
                              </button>
                            </div>
                          ))}
                      </div>
                    )}
                  </div>

                  {/* Unmapped PMS Rooms */}
                  {pmsRooms.filter((r) => !r.beds24_room_id).length > 0 && (
                    <div>
                      <h3 className="text-lg font-medium text-gray-900 mb-4">
                        Unmapped PMS Rooms ({pmsRooms.filter((r) => !r.beds24_room_id).length})
                      </h3>
                      <p className="text-sm text-gray-500 mb-2">
                        These rooms exist in PMS but are not mapped to Beds24. Map them above when Beds24 rooms are available.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
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
                <li>Beds24 configuration and token data</li>
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

