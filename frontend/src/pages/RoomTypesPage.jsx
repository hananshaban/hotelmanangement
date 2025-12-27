import { useState, useMemo, useEffect } from 'react';
import useRoomTypesStore from '../store/roomTypesStore';
import Modal from '../components/Modal';
import SearchInput from '../components/SearchInput';
import FilterSelect from '../components/FilterSelect';
import { useToast } from '../hooks/useToast';
import { useConfirmation } from '../hooks/useConfirmation';

const RoomTypesPage = () => {
  const { roomTypes, addRoomType, updateRoomType, deleteRoomType, isLoading, initialize } = useRoomTypesStore();
  const toast = useToast();
  const confirmation = useConfirmation();

  useEffect(() => {
    initialize();
  }, [initialize]);

  const [searchTerm, setSearchTerm] = useState('');
  const [roomTypeFilter, setRoomTypeFilter] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRoomType, setEditingRoomType] = useState(null);
  const [newRoomType, setNewRoomType] = useState({
    name: '',
    room_type: 'double',
    qty: 1,
    price_per_night: '',
    floor: '',
    max_people: '',
    min_stay: '',
    max_stay: '',
    features: [],
    description: '',
    unit_allocation: 'perBooking',
  });
  const [featureInput, setFeatureInput] = useState('');

  const beds24RoomTypeOptions = [
    { value: 'single', label: 'Single' },
    { value: 'double', label: 'Double' },
    { value: 'twin', label: 'Twin' },
    { value: 'twinDouble', label: 'Twin Double' },
    { value: 'triple', label: 'Triple' },
    { value: 'quadruple', label: 'Quadruple' },
    { value: 'apartment', label: 'Apartment' },
    { value: 'family', label: 'Family' },
    { value: 'suite', label: 'Suite' },
    { value: 'studio', label: 'Studio' },
    { value: 'dormitoryRoom', label: 'Dormitory Room' },
    { value: 'bedInDormitory', label: 'Bed in Dormitory' },
    { value: 'bungalow', label: 'Bungalow' },
    { value: 'chalet', label: 'Chalet' },
    { value: 'holidayHome', label: 'Holiday Home' },
    { value: 'villa', label: 'Villa' },
    { value: 'mobileHome', label: 'Mobile Home' },
    { value: 'tent', label: 'Tent' },
    { value: 'campSite', label: 'Camp Site' },
    { value: 'activity', label: 'Activity' },
    { value: 'tour', label: 'Tour' },
    { value: 'carRental', label: 'Car Rental' },
  ];

  const unitAllocationOptions = [
    { value: 'perBooking', label: 'Per Booking' },
    { value: 'perGuest', label: 'Per Guest' },
  ];

  const filteredRoomTypes = useMemo(() => {
    return roomTypes.filter((rt) => {
      const matchesSearch = rt.name.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesType = !roomTypeFilter || rt.roomType === roomTypeFilter;
      return matchesSearch && matchesType;
    });
  }, [searchTerm, roomTypeFilter, roomTypes]);

  const handleAddRoomType = async () => {
    if (!newRoomType.name || !newRoomType.room_type || !newRoomType.qty || !newRoomType.price_per_night) {
      toast.error('Please fill in all required fields (Name, Room Type, Quantity, Price/Night)');
      return;
    }

    const qty = parseInt(newRoomType.qty);
    if (isNaN(qty) || qty < 1 || qty > 99) {
      toast.error('Quantity must be between 1 and 99');
      return;
    }

    const price = parseFloat(newRoomType.price_per_night);
    if (isNaN(price) || price <= 0) {
      toast.error('Please enter a valid price (must be a positive number)');
      return;
    }

    try {
      await addRoomType({
        ...newRoomType,
        qty: qty,
        price_per_night: price,
        floor: newRoomType.floor ? parseInt(newRoomType.floor) : null,
        max_people: newRoomType.max_people ? parseInt(newRoomType.max_people) : null,
        min_stay: newRoomType.min_stay ? parseInt(newRoomType.min_stay) : null,
        max_stay: newRoomType.max_stay ? parseInt(newRoomType.max_stay) : null,
      });

      setIsModalOpen(false);
      setNewRoomType({
        name: '',
        room_type: 'double',
        qty: 1,
        price_per_night: '',
        floor: '',
        max_people: '',
        min_stay: '',
        max_stay: '',
        features: [],
        description: '',
        unit_allocation: 'perBooking',
      });
      setFeatureInput('');
      toast.success('Room type created successfully!');
    } catch (error) {
      toast.error(error.message || 'Failed to create room type');
    }
  };

  const handleEditRoomType = (roomType) => {
    setEditingRoomType(roomType);
    setNewRoomType({
      name: roomType.name,
      room_type: roomType.roomType, // Use camelCase from store
      qty: roomType.qty,
      price_per_night: roomType.pricePerNight.toString(),
      floor: roomType.floor?.toString() || '',
      max_people: roomType.maxPeople?.toString() || '',
      min_stay: roomType.minStay?.toString() || '',
      max_stay: roomType.maxStay?.toString() || '',
      features: roomType.features || [],
      description: roomType.description || '',
      unit_allocation: roomType.unitAllocation || 'perBooking',
    });
    setIsModalOpen(true);
  };

  const handleUpdateRoomType = async () => {
    if (!editingRoomType) return;

    const qty = parseInt(newRoomType.qty);
    if (isNaN(qty) || qty < 1 || qty > 99) {
      toast.error('Quantity must be between 1 and 99');
      return;
    }

    const price = parseFloat(newRoomType.price_per_night);
    if (isNaN(price) || price <= 0) {
      toast.error('Please enter a valid price (must be a positive number)');
      return;
    }

    try {
      await updateRoomType(editingRoomType.id, {
        ...newRoomType,
        qty: qty,
        price_per_night: price,
        floor: newRoomType.floor ? parseInt(newRoomType.floor) : null,
        max_people: newRoomType.max_people ? parseInt(newRoomType.max_people) : null,
        min_stay: newRoomType.min_stay ? parseInt(newRoomType.min_stay) : null,
        max_stay: newRoomType.max_stay ? parseInt(newRoomType.max_stay) : null,
      });

      setIsModalOpen(false);
      setEditingRoomType(null);
      setNewRoomType({
        name: '',
        room_type: 'double',
        qty: 1,
        price_per_night: '',
        floor: '',
        max_people: '',
        min_stay: '',
        max_stay: '',
        features: [],
        description: '',
        unit_allocation: 'perBooking',
      });
      toast.success('Room type updated successfully!');
    } catch (error) {
      toast.error(error.message || 'Failed to update room type');
    }
  };

  const handleDeleteRoomType = async (id) => {
    const confirmed = await confirmation({
      title: 'Delete Room Type',
      message: 'Are you sure you want to delete this room type?',
      variant: 'danger',
    });
    if (!confirmed) {
      return;
    }

    try {
      await deleteRoomType(id);
      toast.success('Room type deleted successfully!');
    } catch (error) {
      toast.error(error.message || 'Failed to delete room type');
    }
  };

  const handleAddFeature = () => {
    if (featureInput.trim() && !newRoomType.features.includes(featureInput.trim())) {
      setNewRoomType({
        ...newRoomType,
        features: [...newRoomType.features, featureInput.trim()],
      });
      setFeatureInput('');
    }
  };

  const handleRemoveFeature = (feature) => {
    setNewRoomType({
      ...newRoomType,
      features: newRoomType.features.filter((f) => f !== feature),
    });
  };

  if (isLoading && roomTypes.length === 0) {
    return (
      <div>
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Room Types</h1>
          <p className="text-gray-600 mt-2">Manage room types with quantity</p>
        </div>
        <div className="card">
          <div className="flex items-center justify-center py-8">
            <div className="text-gray-500">Loading room types...</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Room Types</h1>
          <p className="text-gray-600 mt-2">Manage room types with quantity (Beds24-style)</p>
        </div>
        <button onClick={() => {
          setEditingRoomType(null);
          setNewRoomType({
            name: '',
            room_type: 'double',
            qty: 1,
            price_per_night: '',
            floor: '',
            max_people: '',
            min_stay: '',
            max_stay: '',
            features: [],
            description: '',
            unit_allocation: 'perBooking',
          });
          setIsModalOpen(true);
        }} className="btn btn-primary">
          + Add Room Type
        </button>
      </div>

      {/* Filters */}
      <div className="card mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <SearchInput
            value={searchTerm}
            onChange={setSearchTerm}
            placeholder="Search room types..."
          />
          <FilterSelect
            value={roomTypeFilter}
            onChange={setRoomTypeFilter}
            options={[
              { value: '', label: 'All Types' },
              ...beds24RoomTypeOptions,
            ]}
            placeholder="Filter by room type"
          />
        </div>
      </div>

      {/* Room Types Table */}
      <div className="card">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Quantity
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Price/Night
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Max People
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Floor
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredRoomTypes.length === 0 ? (
                <tr>
                  <td colSpan="7" className="px-6 py-4 text-center text-gray-500">
                    {isLoading ? 'Loading...' : 'No room types found'}
                  </td>
                </tr>
              ) : (
                filteredRoomTypes.map((roomType) => (
                  <tr key={roomType.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{roomType.name}</div>
                      {roomType.description && (
                        <div className="text-sm text-gray-500">{roomType.description}</div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800">
                        {roomType.roomType}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {roomType.qty} units
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      ${roomType.pricePerNight.toFixed(2)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {roomType.maxPeople || 'N/A'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {roomType.floor || 'N/A'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <button
                        onClick={() => handleEditRoomType(roomType)}
                        className="text-blue-600 hover:text-blue-900 mr-4"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDeleteRoomType(roomType.id)}
                        className="text-red-600 hover:text-red-900"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Edit Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingRoomType(null);
          setNewRoomType({
            name: '',
            room_type: 'double',
            qty: 1,
            price_per_night: '',
            floor: '',
            max_people: '',
            min_stay: '',
            max_stay: '',
            features: [],
            description: '',
            unit_allocation: 'perBooking',
          });
        }}
        title={editingRoomType ? 'Edit Room Type' : 'Add Room Type'}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Name *
            </label>
            <input
              type="text"
              value={newRoomType.name}
              onChange={(e) => setNewRoomType({ ...newRoomType, name: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g., Double Room, Suite"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Beds24 Room Type *
              </label>
              <select
                value={newRoomType.room_type}
                onChange={(e) => setNewRoomType({ ...newRoomType, room_type: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {beds24RoomTypeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Quantity (Units) *
              </label>
              <input
                type="number"
                min="1"
                max="99"
                value={newRoomType.qty}
                onChange={(e) => setNewRoomType({ ...newRoomType, qty: parseInt(e.target.value) || 1 })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Price per Night *
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={newRoomType.price_per_night}
                onChange={(e) => setNewRoomType({ ...newRoomType, price_per_night: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Floor
              </label>
              <input
                type="number"
                min="1"
                value={newRoomType.floor}
                onChange={(e) => setNewRoomType({ ...newRoomType, floor: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Max People
              </label>
              <input
                type="number"
                min="1"
                value={newRoomType.max_people}
                onChange={(e) => setNewRoomType({ ...newRoomType, max_people: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Min Stay
              </label>
              <input
                type="number"
                min="1"
                max="365"
                value={newRoomType.min_stay}
                onChange={(e) => setNewRoomType({ ...newRoomType, min_stay: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Max Stay
              </label>
              <input
                type="number"
                min="1"
                max="365"
                value={newRoomType.max_stay}
                onChange={(e) => setNewRoomType({ ...newRoomType, max_stay: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Unit Allocation
            </label>
            <select
              value={newRoomType.unit_allocation}
              onChange={(e) => setNewRoomType({ ...newRoomType, unit_allocation: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {unitAllocationOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <textarea
              value={newRoomType.description}
              onChange={(e) => setNewRoomType({ ...newRoomType, description: e.target.value })}
              rows="3"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Room type description..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Features
            </label>
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={featureInput}
                onChange={(e) => setFeatureInput(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddFeature();
                  }
                }}
                placeholder="Add feature (e.g., WiFi, TV, AC)"
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="button"
                onClick={handleAddFeature}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
              >
                Add
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {newRoomType.features.map((feature, index) => (
                <span
                  key={index}
                  className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-blue-100 text-blue-800"
                >
                  {feature}
                  <button
                    type="button"
                    onClick={() => handleRemoveFeature(feature)}
                    className="ml-2 text-blue-600 hover:text-blue-800"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <button
              onClick={() => {
                setIsModalOpen(false);
                setEditingRoomType(null);
              }}
              className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={editingRoomType ? handleUpdateRoomType : handleAddRoomType}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              {editingRoomType ? 'Update' : 'Create'} Room Type
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default RoomTypesPage;

