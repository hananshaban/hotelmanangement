import { useState, useEffect } from 'react';
import Modal from './Modal';
import useCheckInsStore from '../store/checkInsStore';
import { useToast } from '../hooks/useToast';

const CheckInModal = ({ isOpen, onClose, reservation }) => {
  const toast = useToast();
  const { checkInGuest, getEligibleRooms } = useCheckInsStore();
  
  const [eligibleRooms, setEligibleRooms] = useState([]);
  const [loadingRooms, setLoadingRooms] = useState(false);
  const [selectedRoomId, setSelectedRoomId] = useState('');
  const [checkInTime, setCheckInTime] = useState(() => {
    const now = new Date();
    return now.toISOString().slice(0, 16); // Format: YYYY-MM-DDTHH:mm
  });
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Fetch eligible rooms when modal opens
  useEffect(() => {
    if (isOpen && reservation) {
      fetchEligibleRooms();
    }
  }, [isOpen, reservation]);

  const fetchEligibleRooms = async () => {
    setLoadingRooms(true);
    try {
      const response = await getEligibleRooms(reservation.id);
      // Backend returns { available_rooms: [...] }
      const rooms = response.available_rooms || [];
      setEligibleRooms(rooms);
      
      // Auto-select if there's a preferred room or only one option
      if (rooms.length === 1) {
        setSelectedRoomId(rooms[0].id);
      } else if (reservation.roomId) {
        // Check if the reserved room is in the eligible list
        const reservedRoom = rooms.find(r => r.id === reservation.roomId);
        if (reservedRoom) {
          setSelectedRoomId(reservedRoom.id);
        }
      }
    } catch (error) {
      toast.error('Failed to load eligible rooms');
      console.error('Error fetching eligible rooms:', error);
    } finally {
      setLoadingRooms(false);
    }
  };

  const handleCheckIn = async () => {
    if (!selectedRoomId) {
      toast.error('Please select a room');
      return;
    }

    setSubmitting(true);
    try {
      await checkInGuest(reservation.id, {
        actual_room_id: selectedRoomId,
        check_in_time: checkInTime,
        notes: notes || undefined,
      });
      
      toast.success('Guest checked in successfully');
      onClose();
      
      // Reset form
      setSelectedRoomId('');
      setNotes('');
      setCheckInTime(new Date().toISOString().slice(0, 16));
    } catch (error) {
      toast.error(error.message || 'Failed to check in guest');
    } finally {
      setSubmitting(false);
    }
  };

  if (!reservation) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Check In Guest"
    >
      <div className="space-y-4">
        {/* Reservation Info */}
        <div className="bg-gray-50 p-4 rounded-lg">
          <h3 className="text-sm font-medium text-gray-700 mb-2">Reservation Details</h3>
          <div className="space-y-1 text-sm">
            <p><strong>Guest:</strong> {reservation.guestName}</p>
            <p><strong>Room Type:</strong> {reservation.roomTypeName || 'Not specified'}</p>
            {reservation.roomNumber && (
              <p><strong>Preferred Room:</strong> {reservation.roomNumber}</p>
            )}
            <p><strong>Check-in Date:</strong> {reservation.checkIn}</p>
            <p><strong>Check-out Date:</strong> {reservation.checkOut}</p>
          </div>
        </div>

        {/* Select Room */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Assign Room <span className="text-red-500">*</span>
          </label>
          {loadingRooms ? (
            <div className="text-sm text-gray-500">Loading available rooms...</div>
          ) : eligibleRooms.length === 0 ? (
            <div className="text-sm text-red-500">
              No eligible rooms available. The room type may not have any available units.
            </div>
          ) : (
            <select
              value={selectedRoomId}
              onChange={(e) => setSelectedRoomId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            >
              <option value="">Select a room...</option>
              {eligibleRooms.map((room) => (
                <option key={room.id} value={room.id}>
                  Room {room.room_number} - {room.room_type || room.type}
                  {room.is_preferred && ' ⭐ (Matches Reserved Type)'}
                  {!room.is_preferred && room.id === reservation.roomId && ' (Reserved)'}
                </option>
              ))}
            </select>
          )}
          <p className="text-xs text-gray-500 mt-1">
            Available rooms are shown (rooms matching the reserved type appear first with ⭐)
          </p>
        </div>

        {/* Check-in Time */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Check-in Time
          </label>
          <input
            type="datetime-local"
            value={checkInTime}
            onChange={(e) => setCheckInTime(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Notes */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Notes (Optional)
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Any special notes about the check-in..."
          />
        </div>
      </div>

      {/* Actions */}
      <div className="mt-6 flex justify-end space-x-2">
        <button
          onClick={onClose}
          className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
          disabled={submitting}
        >
          Cancel
        </button>
        <button
          onClick={handleCheckIn}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-blue-300"
          disabled={submitting || !selectedRoomId || eligibleRooms.length === 0}
        >
          {submitting ? 'Checking in...' : 'Confirm Check-in'}
        </button>
      </div>
    </Modal>
  );
};

export default CheckInModal;

