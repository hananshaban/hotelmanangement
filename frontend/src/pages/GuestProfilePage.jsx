import { useParams, useNavigate } from 'react-router-dom'
import { useMemo, useState } from 'react'
import { format, parseISO } from 'date-fns'
import useStore from '../store/useStore'
import StatusBadge from '../components/StatusBadge'
import Modal from '../components/Modal'

const GuestProfilePage = () => {
  const { id } = useParams()
  const navigate = useNavigate()
  const { guests, reservations, invoices, updateGuest } = useStore()
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [isTagModalOpen, setIsTagModalOpen] = useState(false)
  const [newTag, setNewTag] = useState('')
  const [newNote, setNewNote] = useState('')

  const guest = guests.find((g) => String(g.id) === String(id))

  const guestReservations = useMemo(() => {
    if (!guest) return []
    return reservations.filter(
      (res) =>
        String(res.guestId) === String(id) || res.guestName === guest.name
    )
  }, [guest, reservations, id])

  const guestInvoices = useMemo(() => {
    if (!guest) return []
    return invoices.filter((inv) => String(inv.guestId) === String(id))
  }, [guest, invoices, id])

  const totalSpent = useMemo(() => {
    return guestInvoices
      .filter((inv) => inv.status === 'Paid')
      .reduce((sum, inv) => sum + inv.amount, 0)
  }, [guestInvoices])

  const availableTags = ['VIP', 'Returning', 'Corporate', 'Blacklist', 'Loyalty', 'Group']

  if (!guest) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500 mb-4">Guest not found</p>
        <button onClick={() => navigate('/guests')} className="btn btn-primary">
          Back to Guests
        </button>
      </div>
    )
  }

  const handleAddTag = () => {
    if (newTag && !guest.tags?.includes(newTag)) {
      updateGuest(id, {
        tags: [...(guest.tags || []), newTag],
      })
      setNewTag('')
      setIsTagModalOpen(false)
    }
  }

  const handleRemoveTag = (tagToRemove) => {
    updateGuest(id, {
      tags: (guest.tags || []).filter((tag) => tag !== tagToRemove),
    })
  }

  const handleAddNote = () => {
    if (newNote.trim()) {
      const updatedNotes = guest.notes
        ? `${guest.notes}\n\n${format(new Date(), 'MMM dd, yyyy HH:mm')}: ${newNote}`
        : `${format(new Date(), 'MMM dd, yyyy HH:mm')}: ${newNote}`
      updateGuest(id, { notes: updatedNotes })
      setNewNote('')
    }
  }

  return (
    <div>
      <div className="mb-6">
        <button
          onClick={() => navigate('/guests')}
          className="text-primary-600 hover:text-primary-800 mb-4"
        >
          ← Back to Guests
        </button>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{guest.name}</h1>
            <p className="text-gray-600 mt-2">Guest Profile & History</p>
          </div>
          <button onClick={() => setIsEditModalOpen(true)} className="btn btn-primary">
            Edit Profile
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Guest Info */}
        <div className="lg:col-span-1 space-y-6">
          {/* Basic Info */}
          <div className="card">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Contact Information</h2>
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium text-gray-700">Email</label>
                <p className="text-gray-900">{guest.email}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Phone</label>
                <p className="text-gray-900">{guest.phone}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Past Stays</label>
                <p className="text-gray-900">{guest.pastStays || 0}</p>
              </div>
            </div>
          </div>

          {/* Tags */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-gray-900">Tags</h2>
              <button
                onClick={() => setIsTagModalOpen(true)}
                className="text-sm text-primary-600 hover:text-primary-800"
              >
                + Add Tag
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {guest.tags?.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-primary-100 text-primary-800"
                >
                  {tag}
                  <button
                    onClick={() => handleRemoveTag(tag)}
                    className="ml-2 text-primary-600 hover:text-primary-800"
                  >
                    ×
                  </button>
                </span>
              ))}
              {(!guest.tags || guest.tags.length === 0) && (
                <p className="text-sm text-gray-500">No tags added</p>
              )}
            </div>
          </div>

          {/* Statistics */}
          <div className="card">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Statistics</h2>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-600">Total Reservations:</span>
                <span className="font-semibold">{guestReservations.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Total Spent:</span>
                <span className="font-semibold text-green-600">${totalSpent.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Invoices:</span>
                <span className="font-semibold">{guestInvoices.length}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column - History */}
        <div className="lg:col-span-2 space-y-6">
          {/* Notes */}
          <div className="card">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Notes</h2>
            <div className="mb-4">
              <textarea
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                placeholder="Add a new note..."
                className="input mb-2"
                rows="3"
              />
              <button onClick={handleAddNote} className="btn btn-primary">
                Add Note
              </button>
            </div>
            {guest.notes ? (
              <div className="bg-gray-50 p-4 rounded-lg whitespace-pre-wrap text-sm">
                {guest.notes}
              </div>
            ) : (
              <p className="text-gray-500 text-sm">No notes yet</p>
            )}
          </div>

          {/* Stay History */}
          <div className="card">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Stay History</h2>
            {guestReservations.length === 0 ? (
              <p className="text-gray-500">No reservations yet</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Reservation ID
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Room
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Check-in
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Check-out
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Status
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Amount
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {guestReservations.map((res) => (
                      <tr key={res.id}>
                        <td className="px-4 py-3 text-sm">{res.id}</td>
                        <td className="px-4 py-3 text-sm">{res.roomNumber}</td>
                        <td className="px-4 py-3 text-sm">
                          {format(parseISO(res.checkIn), 'MMM dd, yyyy')}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {format(parseISO(res.checkOut), 'MMM dd, yyyy')}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={res.status} type="reservation" />
                        </td>
                        <td className="px-4 py-3 text-sm font-medium">
                          ${res.totalAmount?.toLocaleString() || '0'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Invoices */}
          <div className="card">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Invoices</h2>
            {guestInvoices.length === 0 ? (
              <p className="text-gray-500">No invoices yet</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Invoice ID
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Issue Date
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Due Date
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Amount
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {guestInvoices.map((inv) => (
                      <tr key={inv.id}>
                        <td className="px-4 py-3 text-sm">{inv.id}</td>
                        <td className="px-4 py-3 text-sm">
                          {format(parseISO(inv.issueDate), 'MMM dd, yyyy')}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {format(parseISO(inv.dueDate), 'MMM dd, yyyy')}
                        </td>
                        <td className="px-4 py-3 text-sm font-medium">
                          ${inv.amount.toLocaleString()}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={inv.status} type="invoice" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Add Tag Modal */}
      <Modal
        isOpen={isTagModalOpen}
        onClose={() => {
          setIsTagModalOpen(false)
          setNewTag('')
        }}
        title="Add Tag"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Select Tag</label>
            <select
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              className="input"
            >
              <option value="">Select a tag</option>
              {availableTags
                .filter((tag) => !guest.tags?.includes(tag))
                .map((tag) => (
                  <option key={tag} value={tag}>
                    {tag}
                  </option>
                ))}
            </select>
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <button
              onClick={() => {
                setIsTagModalOpen(false)
                setNewTag('')
              }}
              className="btn btn-secondary"
            >
              Cancel
            </button>
            <button onClick={handleAddTag} className="btn btn-primary">
              Add Tag
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

export default GuestProfilePage

