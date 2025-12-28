import type { Request, Response, NextFunction } from 'express';
import db from '../../config/database.js';
import type { CreateExpenseRequest, UpdateExpenseRequest, ExpenseResponse } from './expenses_types.js';
import { logCreate, logUpdate, logDelete } from '../audit/audit_utils.js';

// Get all expenses
export async function getExpensesHandler(
  req: Request,
  res: Response<ExpenseResponse[]>,
  next: NextFunction,
) {
  try {
    const { category, search, start_date, end_date } = req.query;

    let query = db('expenses')
      .select('*')
      .whereNull('deleted_at')
      .orderBy('expense_date', 'desc')
      .orderBy('created_at', 'desc');

    if (category) {
      query = query.where('category', category as string);
    }

    if (start_date) {
      query = query.where('expense_date', '>=', start_date as string);
    }

    if (end_date) {
      query = query.where('expense_date', '<=', end_date as string);
    }

    if (search) {
      query = query.where(function () {
        this.where('category', 'ilike', `%${search}%`)
          .orWhere('notes', 'ilike', `%${search}%`);
      });
    }

    const expenses = await query;

    const response: ExpenseResponse[] = expenses.map((expense) => ({
      id: expense.id,
      category: expense.category,
      amount: parseFloat(expense.amount),
      expense_date: expense.expense_date,
      notes: expense.notes || undefined,
      created_at: expense.created_at,
      updated_at: expense.updated_at,
    }));

    res.json(response);
  } catch (error) {
    next(error);
  }
}

// Get single expense
export async function getExpenseHandler(
  req: Request<{ id: string }>,
  res: Response<ExpenseResponse>,
  next: NextFunction,
) {
  try {
    const { id } = req.params;

    const expense = await db('expenses')
      .where({ id })
      .whereNull('deleted_at')
      .first();

    if (!expense) {
      res.status(404).json({
        error: 'Expense not found',
      } as any);
      return;
    }

    const response: ExpenseResponse = {
      id: expense.id,
      category: expense.category,
      amount: parseFloat(expense.amount),
      expense_date: expense.expense_date,
      notes: expense.notes || undefined,
      created_at: expense.created_at,
      updated_at: expense.updated_at,
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
}

// Create expense
export async function createExpenseHandler(
  req: Request<{}, ExpenseResponse, CreateExpenseRequest>,
  res: Response<ExpenseResponse>,
  next: NextFunction,
) {
  try {
    const { category, amount, expense_date, notes } = req.body;

    // Validation
    if (!category || amount === undefined || !expense_date) {
      res.status(400).json({
        error: 'category, amount, and expense_date are required',
      } as any);
      return;
    }

    if (amount <= 0) {
      res.status(400).json({
        error: 'amount must be greater than 0',
      } as any);
      return;
    }

    // Validate category
    const validCategories = [
      'Utilities',
      'Maintenance',
      'Staff',
      'Supplies',
      'Marketing',
      'Insurance',
      'Taxes',
      'Other',
    ];
    if (!validCategories.includes(category)) {
      res.status(400).json({
        error: 'Invalid category',
      } as any);
      return;
    }

    // Create expense
    const [newExpense] = await db('expenses')
      .insert({
        category,
        amount,
        expense_date: new Date(expense_date).toISOString().split('T')[0],
        notes: notes || null,
      })
      .returning('*');

    const response: ExpenseResponse = {
      id: newExpense.id,
      category: newExpense.category,
      amount: parseFloat(newExpense.amount),
      expense_date: newExpense.expense_date,
      notes: newExpense.notes || undefined,
      created_at: newExpense.created_at,
      updated_at: newExpense.updated_at,
    };

    res.status(201).json(response);

    // Audit log: expense created
    logCreate(req, 'expense', newExpense.id, {
      category: newExpense.category,
      amount: parseFloat(newExpense.amount),
      expense_date: newExpense.expense_date,
    }).catch((err) => console.error('Audit log failed:', err));
  } catch (error) {
    next(error);
  }
}

// Update expense
export async function updateExpenseHandler(
  req: Request<{ id: string }, ExpenseResponse, UpdateExpenseRequest>,
  res: Response<ExpenseResponse>,
  next: NextFunction,
) {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Check if expense exists
    const existing = await db('expenses')
      .where({ id })
      .whereNull('deleted_at')
      .first();

    if (!existing) {
      res.status(404).json({
        error: 'Expense not found',
      } as any);
      return;
    }

    const updateData: any = {
      updated_at: new Date(),
    };

    if (updates.category !== undefined) {
      // Validate category
      const validCategories = [
        'Utilities',
        'Maintenance',
        'Staff',
        'Supplies',
        'Marketing',
        'Insurance',
        'Taxes',
        'Other',
      ];
      if (!validCategories.includes(updates.category)) {
        res.status(400).json({
          error: 'Invalid category',
        } as any);
        return;
      }
      updateData.category = updates.category;
    }

    if (updates.amount !== undefined) {
      if (updates.amount <= 0) {
        res.status(400).json({
          error: 'amount must be greater than 0',
        } as any);
        return;
      }
      updateData.amount = updates.amount;
    }

    if (updates.expense_date !== undefined) {
      updateData.expense_date = new Date(updates.expense_date).toISOString().split('T')[0];
    }

    if (updates.notes !== undefined) {
      updateData.notes = updates.notes || null;
    }

    // Update expense
    await db('expenses').where({ id }).update(updateData);

    // Fetch updated expense
    const updated = await db('expenses').where({ id }).first();

    const response: ExpenseResponse = {
      id: updated.id,
      category: updated.category,
      amount: parseFloat(updated.amount),
      expense_date: updated.expense_date,
      notes: updated.notes || undefined,
      created_at: updated.created_at,
      updated_at: updated.updated_at,
    };

    res.json(response);

    // Audit log: expense updated
    logUpdate(req, 'expense', id, {
      category: existing.category,
      amount: parseFloat(existing.amount),
      expense_date: existing.expense_date,
    }, {
      category: updated.category,
      amount: parseFloat(updated.amount),
      expense_date: updated.expense_date,
    }).catch((err) => console.error('Audit log failed:', err));
  } catch (error) {
    next(error);
  }
}

// Delete expense (soft delete)
export async function deleteExpenseHandler(
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction,
) {
  try {
    const { id } = req.params;

    const expense = await db('expenses')
      .where({ id })
      .whereNull('deleted_at')
      .first();

    if (!expense) {
      res.status(404).json({
        error: 'Expense not found',
      });
      return;
    }

    // Soft delete
    await db('expenses').where({ id }).update({
      deleted_at: new Date(),
    });

    res.status(204).send();

    // Audit log: expense deleted
    logDelete(req, 'expense', id, {
      category: expense.category,
      amount: parseFloat(expense.amount),
      expense_date: expense.expense_date,
    }).catch((err) => console.error('Audit log failed:', err));
  } catch (error) {
    next(error);
  }
}

// Get expense statistics
export async function getExpenseStatsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const { start_date, end_date } = req.query;

    let query = db('expenses').whereNull('deleted_at');

    if (start_date) {
      query = query.where('expense_date', '>=', start_date as string);
    }

    if (end_date) {
      query = query.where('expense_date', '<=', end_date as string);
    }

    const expenses = await query;

    const totalExpenses = expenses.reduce((sum, exp) => sum + parseFloat(exp.amount), 0);

    const expensesByCategory: Record<string, number> = {};
    expenses.forEach((exp) => {
      expensesByCategory[exp.category] =
        (expensesByCategory[exp.category] || 0) + parseFloat(exp.amount);
    });

    res.json({
      total_expenses: totalExpenses,
      total_count: expenses.length,
      by_category: expensesByCategory,
      categories_count: Object.keys(expensesByCategory).length,
    });
  } catch (error) {
    next(error);
  }
}

