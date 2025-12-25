import { useState, useMemo } from 'react'
import { format, parseISO } from 'date-fns'
import useStore from '../store/useStore'
import Modal from '../components/Modal'
import SearchInput from '../components/SearchInput'
import FilterSelect from '../components/FilterSelect'

const ExpensesPage = () => {
  const { expenses, addExpense } = useStore()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [sortBy, setSortBy] = useState('date')
  const [sortOrder, setSortOrder] = useState('desc')
  const [newExpense, setNewExpense] = useState({
    category: '',
    amount: '',
    date: format(new Date(), 'yyyy-MM-dd'),
    notes: '',
  })

  const categories = [
    'Utilities',
    'Maintenance',
    'Staff',
    'Supplies',
    'Marketing',
    'Insurance',
    'Taxes',
    'Other',
  ]

  const filteredAndSortedExpenses = useMemo(() => {
    let filtered = expenses.filter((exp) => {
      const matchesSearch =
        exp.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
        exp.notes.toLowerCase().includes(searchTerm.toLowerCase())
      const matchesCategory = !categoryFilter || exp.category === categoryFilter
      return matchesSearch && matchesCategory
    })

    // Sort
    filtered.sort((a, b) => {
      let comparison = 0
      if (sortBy === 'date') {
        comparison = parseISO(a.date).getTime() - parseISO(b.date).getTime()
      } else if (sortBy === 'amount') {
        comparison = a.amount - b.amount
      } else if (sortBy === 'category') {
        comparison = a.category.localeCompare(b.category)
      }
      return sortOrder === 'desc' ? -comparison : comparison
    })

    return filtered
  }, [expenses, searchTerm, categoryFilter, sortBy, sortOrder])

  const handleSort = (column) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(column)
      setSortOrder('desc')
    }
  }

  const SortIcon = ({ column }) => {
    if (sortBy !== column) return <span className="text-gray-400">↕</span>
    return sortOrder === 'asc' ? <span>↑</span> : <span>↓</span>
  }

  const totalExpenses = useMemo(() => {
    return expenses.reduce((sum, exp) => sum + exp.amount, 0)
  }, [expenses])

  const expensesByCategory = useMemo(() => {
    const grouped = {}
    expenses.forEach((exp) => {
      grouped[exp.category] = (grouped[exp.category] || 0) + exp.amount
    })
    return grouped
  }, [expenses])

  const handleAddExpense = () => {
    if (!newExpense.category || !newExpense.amount) {
      alert('Please fill in category and amount')
      return
    }

    const amount = parseFloat(newExpense.amount)
    if (isNaN(amount) || amount <= 0) {
      alert('Please enter a valid amount')
      return
    }

    addExpense({
      ...newExpense,
      amount,
    })

    setIsModalOpen(false)
    setNewExpense({
      category: '',
      amount: '',
      date: format(new Date(), 'yyyy-MM-dd'),
      notes: '',
    })
  }

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Expenses</h1>
          <p className="text-gray-600 mt-2">Track and manage hotel expenses</p>
        </div>
        <button onClick={() => setIsModalOpen(true)} className="btn btn-primary">
          + Add Expense
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <div className="card">
          <h3 className="text-sm font-medium text-gray-600 mb-1">Total Expenses</h3>
          <p className="text-2xl font-bold text-gray-900">${totalExpenses.toLocaleString()}</p>
        </div>
        <div className="card">
          <h3 className="text-sm font-medium text-gray-600 mb-1">Total Records</h3>
          <p className="text-2xl font-bold text-gray-900">{expenses.length}</p>
        </div>
        <div className="card">
          <h3 className="text-sm font-medium text-gray-600 mb-1">Categories</h3>
          <p className="text-2xl font-bold text-gray-900">
            {Object.keys(expensesByCategory).length}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="card mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <SearchInput
            value={searchTerm}
            onChange={setSearchTerm}
            placeholder="Search by category or notes..."
            label="Search"
          />
          <FilterSelect
            value={categoryFilter}
            onChange={setCategoryFilter}
            options={categories.map((cat) => ({ value: cat, label: cat }))}
            placeholder="All Categories"
            label="Category"
          />
        </div>
      </div>

      {/* Expenses Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th 
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('date')}
                >
                  <div className="flex items-center gap-1">
                    Date
                    <SortIcon column="date" />
                  </div>
                </th>
                <th 
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('category')}
                >
                  <div className="flex items-center gap-1">
                    Category
                    <SortIcon column="category" />
                  </div>
                </th>
                <th 
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('amount')}
                >
                  <div className="flex items-center gap-1">
                    Amount
                    <SortIcon column="amount" />
                  </div>
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Notes
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredAndSortedExpenses.map((expense) => (
                <tr key={expense.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {format(parseISO(expense.date), 'MMM dd, yyyy')}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary-100 text-primary-800">
                      {expense.category}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    ${expense.amount.toLocaleString()}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {expense.notes || '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredAndSortedExpenses.length === 0 && (
            <div className="text-center py-12 text-gray-500">
              {expenses.length === 0 ? 'No expenses recorded yet' : 'No expenses found matching your filters'}
            </div>
          )}
        </div>
      </div>

      {/* Add Expense Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false)
          setNewExpense({
            category: '',
            amount: '',
            date: format(new Date(), 'yyyy-MM-dd'),
            notes: '',
          })
        }}
        title="Add Expense"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Category *</label>
            <select
              value={newExpense.category}
              onChange={(e) => setNewExpense({ ...newExpense, category: e.target.value })}
              className="input"
              required
            >
              <option value="">Select a category</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Amount ($) *</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={newExpense.amount}
              onChange={(e) => setNewExpense({ ...newExpense, amount: e.target.value })}
              className="input"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date *</label>
            <input
              type="date"
              value={newExpense.date}
              onChange={(e) => setNewExpense({ ...newExpense, date: e.target.value })}
              className="input"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea
              value={newExpense.notes}
              onChange={(e) => setNewExpense({ ...newExpense, notes: e.target.value })}
              className="input"
              rows="3"
              placeholder="Optional notes about this expense..."
            />
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <button
              onClick={() => {
                setIsModalOpen(false)
                setNewExpense({
                  category: '',
                  amount: '',
                  date: format(new Date(), 'yyyy-MM-dd'),
                  notes: '',
                })
              }}
              className="btn btn-secondary"
            >
              Cancel
            </button>
            <button onClick={handleAddExpense} className="btn btn-primary">
              Add Expense
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

export default ExpensesPage

