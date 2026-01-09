export interface CreateExpenseRequest {
  category: 'Utilities' | 'Maintenance' | 'Staff' | 'Supplies' | 'Marketing' | 'Insurance' | 'Taxes' | 'Other';
  amount: number;
  expense_date: string; // ISO date string
  notes?: string;
}

export interface UpdateExpenseRequest {
  category?: 'Utilities' | 'Maintenance' | 'Staff' | 'Supplies' | 'Marketing' | 'Insurance' | 'Taxes' | 'Other';
  amount?: number;
  expense_date?: string;
  notes?: string;
}

export interface ExpenseResponse {
  id: string;
  category: string;
  amount: number;
  expense_date: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}



