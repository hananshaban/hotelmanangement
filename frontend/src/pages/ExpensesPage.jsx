import { useState, useMemo, useEffect } from 'react'
import { format, parseISO } from 'date-fns'
import useExpensesStore from '../store/expensesStore'
import Modal from '../components/Modal'
import SearchInput from '../components/SearchInput'
import FilterSelect from '../components/FilterSelect'
import { useToast } from '../hooks/useToast'

const ExpensesPage = () => {
  const {
    expenses,
    loading: expensesLoading,
    error: expensesError,
    fetchExpenses,
    createExpense,
  } = useExpensesStore()
  const toast = useToast()
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

  // Fetch expenses on mount and when filters change
  useEffect(() => {
    const filters = {};
    if (categoryFilter) filters.category = categoryFilter;
    if (searchTerm) filters.search = searchTerm;
    
    const timeoutId = setTimeout(() => {
      fetchExpenses(filters);
    }, searchTerm ? 300 : 0); // Debounce search

    return () => clearTimeout(timeoutId);
  }, [categoryFilter, searchTerm, fetchExpenses]);

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
    // API handles search and category filtering, so we just sort the results
    let filtered = [...expenses]

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
  }, [expenses, sortBy, sortOrder])

  const handleSort = (column) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(column)
      setSortOrder('desc')
    }
  }

  const SortIcon = ({ column }) => {
    if (sortBy !== column) return <span className="text-gray-400 dark:text-gray-500">↕</span>
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

  const handleAddExpense = async () => {
    if (!newExpense.category || !newExpense.amount) {
      toast.error('Please fill in category and amount')
      return
    }

    const amount = parseFloat(newExpense.amount)
    if (isNaN(amount) || amount <= 0) {
      toast.error('Please enter a valid amount')
      return
    }

    try {
      await createExpense({
        category: newExpense.category,
        amount,
        date: newExpense.date,
        notes: newExpense.notes || undefined,
      })

      setIsModalOpen(false)
      setNewExpense({
        category: '',
        amount: '',
        date: format(new Date(), 'yyyy-MM-dd'),
        notes: '',
      })
      toast.success('Expense created successfully!')
    } catch (error) {
      toast.error(error.message || 'Failed to create expense')
    }
  }

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Expenses</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">Track and manage hotel expenses</p>
        </div>
        <button onClick={() => setIsModalOpen(true)} className="btn btn-primary">
          + Add Expense
        </button>
      </div>

      {/* Error message */}
      {expensesError && (
        <div className="mb-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative" role="alert">
          <span className="block sm:inline">{expensesError}</span>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <div className="card">
          <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">Total Expenses</h3>
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">${totalExpenses.toLocaleString()}</p>
        </div>
        <div className="card">
          <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">Total Records</h3>
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{expenses.length}</p>
        </div>
        <div className="card">
          <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">Categories</h3>
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
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

      {/* Loading state */}
      {expensesLoading && (
        <div className="mb-4 text-center text-gray-600 dark:text-gray-400">Loading expenses...</div>
      )}

      {/* Expenses Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th 
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700"
                  onClick={() => handleSort('date')}
                >
                  <div className="flex items-center gap-1">
                    Date
                    <SortIcon column="date" />
                  </div>
                </th>
                <th 
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('category')}
                >
                  <div className="flex items-center gap-1">
                    Category
                    <SortIcon column="category" />
                  </div>
                </th>
                <th
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase cursor-pointer hover:bg-gray-100"
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
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {filteredAndSortedExpenses.map((expense) => (
                <tr key={expense.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                    {format(parseISO(expense.date), 'MMM dd, yyyy')}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary-100 text-primary-800">
                      {expense.category}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100">
                    ${expense.amount.toLocaleString()}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                    {expense.notes || '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredAndSortedExpenses.length === 0 && (
            <div className="text-center py-12 text-gray-500 dark:text-gray-400">
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
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Category *</label>
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
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Amount ($) *</label>
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
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Date *</label>
            <input
              type="date"
              value={newExpense.date}
              onChange={(e) => setNewExpense({ ...newExpense, date: e.target.value })}
              className="input"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Notes</label>
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

