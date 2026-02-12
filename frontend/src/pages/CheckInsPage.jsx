import { useState, useEffect, useMemo } from 'react';
import { format, parseISO } from 'date-fns';
import StatusBadge from '../components/StatusBadge';
import SearchInput from '../components/SearchInput';
import FilterSelect from '../components/FilterSelect';
import Modal from '../components/Modal';
import useCheckInsStore from '../store/checkInsStore';
import useRoomsStore from '../store/roomsStore';
import { useToast } from '../hooks/useToast';
import { useConfirmation } from '../hooks/useConfirmation';

const CheckInsPage = () => {
  const toast = useToast();
  const confirmation = useConfirmation();
  
  const {
    checkIns,
    loading,
    error,
    fetchCheckIns,
    checkOutGuest,
    changeRoom,
    filters,
    setFilters,
    clearFilters,
  } = useCheckInsStore();
  const { rooms, fetchRooms } = useRoomsStore();

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sortBy, setSortBy] = useState('check_in_time');
  const [sortOrder, setSortOrder] = useState('desc');
  const [selectedCheckIn, setSelectedCheckIn] = useState(null);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [isCheckoutModalOpen, setIsCheckoutModalOpen] = useState(false);
  const [checkoutNotes, setCheckoutNotes] = useState('');
  const [isChangeRoomModalOpen, setIsChangeRoomModalOpen] = useState(false);
  const [availableRooms, setAvailableRooms] = useState([]);
  const [loadingRooms, setLoadingRooms] = useState(false);
  const [selectedNewRoom, setSelectedNewRoom] = useState('');
  const [changeReason, setChangeReason] = useState('guest_request');
  const [changeNotes, setChangeNotes] = useState('');

  // Fetch check-ins and rooms on mount
  useEffect(() => {
    fetchCheckIns();
    fetchRooms();
  }, [fetchCheckIns, fetchRooms]);

  // Filter and sort check-ins
  const filteredAndSortedCheckIns = useMemo(() => {
    let filtered = [...checkIns];

    // Search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (checkIn) =>
          checkIn.guest_name?.toLowerCase().includes(term) ||
          checkIn.room_number?.toString().includes(term) ||
          checkIn.reservation_id?.toLowerCase().includes(term)
      );
    }

    // Status filter
    if (statusFilter) {
      filtered = filtered.filter((checkIn) => checkIn.status === statusFilter);
    }

    // Sort
    filtered.sort((a, b) => {
      let aVal = a[sortBy];
      let bVal = b[sortBy];

      // Handle dates
      if (sortBy === 'check_in_time' || sortBy === 'actual_checkout_time') {
        aVal = aVal ? new Date(aVal).getTime() : 0;
        bVal = bVal ? new Date(bVal).getTime() : 0;
      }

      if (sortOrder === 'asc') {
        return aVal > bVal ? 1 : -1;
      } else {
        return aVal < bVal ? 1 : -1;
      }
    });

    return filtered;
  }, [checkIns, searchTerm, statusFilter, sortBy, sortOrder]);

  // Handle checkout
  const handleCheckout = async () => {
    if (!selectedCheckIn) return;

    try {
      await checkOutGuest(selectedCheckIn.id, {
        notes: checkoutNotes,
        actual_checkout_time: new Date().toISOString(),
      });
      toast.success('Guest checked out successfully');
      setIsCheckoutModalOpen(false);
      setCheckoutNotes('');
      setSelectedCheckIn(null);
    } catch (error) {
      toast.error(error.message || 'Failed to checkout guest');
    }
  };

  // Handle view details
  const handleViewDetails = (checkIn) => {
    setSelectedCheckIn(checkIn);
    setIsDetailsModalOpen(true);
  };

  // Handle open checkout modal
  const handleOpenCheckout = (checkIn) => {
    setSelectedCheckIn(checkIn);
    setIsCheckoutModalOpen(true);
  };

  // Handle open change room modal
  const handleOpenChangeRoom = (checkIn) => {
    setSelectedCheckIn(checkIn);
    setLoadingRooms(true);
    setIsChangeRoomModalOpen(true);
    
    // Get available rooms (exclude current room and unavailable rooms)
    const available = rooms.filter(
      (room) =>
        room.id !== checkIn.actual_room_id &&
        room.status === 'Available'
    );
    setAvailableRooms(available);
    setLoadingRooms(false);
  };

  // Handle room change
  const handleChangeRoom = async () => {
    if (!selectedCheckIn || !selectedNewRoom) return;

    try {
      await changeRoom(selectedCheckIn.id, {
        new_room_id: selectedNewRoom,
        assignment_type: changeReason,
        change_reason: changeNotes || changeReason.replace('_', ' '),
      });
      toast.success('Room changed successfully');
      setIsChangeRoomModalOpen(false);
      setSelectedNewRoom('');
      setChangeReason('guest_request');
      setChangeNotes('');
      setSelectedCheckIn(null);
    } catch (error) {
      toast.error(error.message || 'Failed to change room');
    }
  };

  // Format date/time
  const formatDateTime = (dateTime) => {
    if (!dateTime) return '-';
    try {
      return format(parseISO(dateTime), 'MMM dd, yyyy HH:mm');
    } catch {
      return '-';
    }
  };

  return (
    <div>
      <div className="flex flex-wrap justify-between items-center mb-6 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Check-ins</h1>
          <p className="text-gray-600 dark:text-gray-400">Manage active and historical check-ins</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <SearchInput
            value={searchTerm}
            onChange={setSearchTerm}
            placeholder="Search by guest name, room number..."
          />
          <FilterSelect
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { value: '', label: 'All Statuses' },
              { value: 'checked_in', label: 'Checked In' },
              { value: 'checked_out', label: 'Checked Out' },
            ]}
          />
          <div className="flex gap-2">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="check_in_time">Check-in Time</option>
              <option value="guest_name">Guest Name</option>
              <option value="room_number">Room Number</option>
            </select>
            <button
              onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              {sortOrder === 'asc' ? '↑' : '↓'}
            </button>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-blue-50 rounded-lg p-4">
          <div className="text-blue-600 text-sm font-medium">Active Check-ins</div>
          <div className="text-2xl font-bold text-blue-900">
            {checkIns.filter((c) => c.status === 'checked_in').length}
          </div>
        </div>
        <div className="bg-green-50 rounded-lg p-4">
          <div className="text-green-600 text-sm font-medium">Checked Out Today</div>
          <div className="text-2xl font-bold text-green-900">
            {
              checkIns.filter(
                (c) =>
                  c.status === 'checked_out' &&
                  c.actual_checkout_time &&
                  format(parseISO(c.actual_checkout_time), 'yyyy-MM-dd') ===
                    format(new Date(), 'yyyy-MM-dd')
              ).length
            }
          </div>
        </div>
        <div className="bg-purple-50 rounded-lg p-4">
          <div className="text-purple-600 text-sm font-medium">Total Check-ins</div>
          <div className="text-2xl font-bold text-purple-900">{checkIns.length}</div>
        </div>
      </div>

      {/* Check-ins Table */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-8 text-center text-gray-500 dark:text-gray-400">Loading check-ins...</div>
          ) : error ? (
            <div className="p-8 text-center text-red-500">Error: {error}</div>
          ) : filteredAndSortedCheckIns.length === 0 ? (
            <div className="p-8 text-center text-gray-500 dark:text-gray-400">No check-ins found</div>
          ) : (
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Guest
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Room
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Check-in Time
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Checkout Time
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {filteredAndSortedCheckIns.map((checkIn) => (
                  <tr key={checkIn.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {checkIn.guest_name || 'Unknown Guest'}
                      </div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">{checkIn.guest_email}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        Room {checkIn.room_number}
                      </div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">{checkIn.room_type_name}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                      {formatDateTime(checkIn.check_in_time)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                      {checkIn.status === 'checked_out'
                        ? formatDateTime(checkIn.actual_checkout_time)
                        : format(parseISO(checkIn.expected_checkout_time), 'MMM dd, yyyy')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <StatusBadge
                        status={checkIn.status === 'checked_in' ? 'Checked In' : 'Checked Out'}
                      />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                      <button
                        onClick={() => handleViewDetails(checkIn)}
                        className="text-blue-600 hover:text-blue-900"
                      >
                        View
                      </button>
                      {checkIn.status === 'checked_in' && (
                        <>
                          <button
                            onClick={() => handleOpenChangeRoom(checkIn)}
                            className="text-purple-600 hover:text-purple-900"
                          >
                            Change Room
                          </button>
                          <button
                            onClick={() => handleOpenCheckout(checkIn)}
                            className="text-green-600 hover:text-green-900"
                          >
                            Checkout
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Details Modal */}
      {isDetailsModalOpen && selectedCheckIn && (
        <Modal
          isOpen={isDetailsModalOpen}
          onClose={() => {
            setIsDetailsModalOpen(false);
            setSelectedCheckIn(null);
          }}
          title="Check-in Details"
        >
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Guest Information</h3>
              <p className="mt-1 text-sm text-gray-900 dark:text-gray-100">{selectedCheckIn.guest_name}</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">{selectedCheckIn.guest_email}</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">{selectedCheckIn.guest_phone}</p>
            </div>

            <div>
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Room Information</h3>
              <p className="mt-1 text-sm text-gray-900 dark:text-gray-100">
                Room {selectedCheckIn.room_number} - {selectedCheckIn.room_type_name}
              </p>
            </div>

            <div>
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Check-in Details</h3>
              <p className="mt-1 text-sm text-gray-900 dark:text-gray-100">
                Check-in: {formatDateTime(selectedCheckIn.check_in_time)}
              </p>
              <p className="text-sm text-gray-900 dark:text-gray-100">
                Expected Checkout: {format(parseISO(selectedCheckIn.expected_checkout_time), 'MMM dd, yyyy')}
              </p>
              {selectedCheckIn.status === 'checked_out' && (
                <p className="text-sm text-gray-900 dark:text-gray-100">
                  Actual Checkout: {formatDateTime(selectedCheckIn.actual_checkout_time)}
                </p>
              )}
            </div>

            {selectedCheckIn.notes && (
              <div>
                <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Notes</h3>
                <p className="mt-1 text-sm text-gray-900 dark:text-gray-100">{selectedCheckIn.notes}</p>
              </div>
            )}

            <div>
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Status</h3>
              <div className="mt-1">
                <StatusBadge
                  status={
                    selectedCheckIn.status === 'checked_in' ? 'Checked In' : 'Checked Out'
                  }
                />
              </div>
            </div>
          </div>

          <div className="mt-6 flex justify-end space-x-2">
            <button
              onClick={() => {
                setIsDetailsModalOpen(false);
                setSelectedCheckIn(null);
              }}
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              Close
            </button>
            {selectedCheckIn.status === 'checked_in' && (
              <>
                <button
                  onClick={() => {
                    setIsDetailsModalOpen(false);
                    handleOpenChangeRoom(selectedCheckIn);
                  }}
                  className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700"
                >
                  Change Room
                </button>
                <button
                  onClick={() => {
                    setIsDetailsModalOpen(false);
                    handleOpenCheckout(selectedCheckIn);
                  }}
                  className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
                >
                  Checkout
                </button>
              </>
            )}
          </div>
        </Modal>
      )}

      {/* Checkout Modal */}
      {isCheckoutModalOpen && selectedCheckIn && (
        <Modal
          isOpen={isCheckoutModalOpen}
          onClose={() => {
            setIsCheckoutModalOpen(false);
            setCheckoutNotes('');
            setSelectedCheckIn(null);
          }}
          title="Checkout Guest"
        >
          <div className="space-y-4">
            <div>
              <p className="text-sm text-gray-700 dark:text-gray-300">
                Checkout <strong>{selectedCheckIn.guest_name}</strong> from Room{' '}
                <strong>{selectedCheckIn.room_number}</strong>?
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Notes (Optional)
              </label>
              <textarea
                value={checkoutNotes}
                onChange={(e) => setCheckoutNotes(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Any notes about the checkout..."
              />
            </div>
          </div>

          <div className="mt-6 flex justify-end space-x-2">
            <button
              onClick={() => {
                setIsCheckoutModalOpen(false);
                setCheckoutNotes('');
                setSelectedCheckIn(null);
              }}
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              Cancel
            </button>
            <button
              onClick={handleCheckout}
              className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
            >
              Confirm Checkout
            </button>
          </div>
        </Modal>
      )}

      {/* Change Room Modal */}
      {isChangeRoomModalOpen && selectedCheckIn && (
        <Modal
          isOpen={isChangeRoomModalOpen}
          onClose={() => {
            setIsChangeRoomModalOpen(false);
            setSelectedNewRoom('');
            setChangeReason('guest_request');
            setChangeNotes('');
            setSelectedCheckIn(null);
          }}
          title="Change Room"
        >
          <div className="space-y-4">
            <div className="bg-blue-50 p-4 rounded-lg">
              <p className="text-sm text-gray-700 dark:text-gray-300">
                Change room for <strong>{selectedCheckIn.guest_name}</strong> currently in Room{' '}
                <strong>{selectedCheckIn.room_number}</strong>
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                New Room <span className="text-red-500">*</span>
              </label>
              {loadingRooms ? (
                <div className="text-sm text-gray-500 dark:text-gray-400">Loading available rooms...</div>
              ) : availableRooms.length === 0 ? (
                <div className="text-sm text-red-500">
                  No available rooms found. All rooms may be occupied or under maintenance.
                </div>
              ) : (
                <select
                  value={selectedNewRoom}
                  onChange={(e) => setSelectedNewRoom(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                >
                  <option value="">Select a room...</option>
                  {availableRooms.map((room) => (
                    <option key={room.id} value={room.id}>
                      Room {room.roomNumber} - {room.type}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Reason for Change <span className="text-red-500">*</span>
              </label>
              <select
                value={changeReason}
                onChange={(e) => setChangeReason(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="guest_request">Guest Request</option>
                <option value="upgrade">Upgrade</option>
                <option value="downgrade">Downgrade</option>
                <option value="maintenance">Maintenance Issue</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Additional Notes (Optional)
              </label>
              <textarea
                value={changeNotes}
                onChange={(e) => setChangeNotes(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Any additional notes about the room change..."
              />
            </div>
          </div>

          <div className="mt-6 flex justify-end space-x-2">
            <button
              onClick={() => {
                setIsChangeRoomModalOpen(false);
                setSelectedNewRoom('');
                setChangeReason('guest_request');
                setChangeNotes('');
                setSelectedCheckIn(null);
              }}
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              Cancel
            </button>
            <button
              onClick={handleChangeRoom}
              disabled={!selectedNewRoom || availableRooms.length === 0}
              className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:bg-purple-300"
            >
              Confirm Room Change
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default CheckInsPage;

