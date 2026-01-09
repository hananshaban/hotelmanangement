export interface CreateInvoiceRequest {
  reservation_id?: string;
  guest_id: string;
  issue_date: string; // ISO date string
  due_date: string; // ISO date string
  amount: number;
  status?: 'Pending' | 'Paid' | 'Cancelled';
  payment_method?: 'Cash' | 'Card' | 'Online' | 'Bank Transfer' | 'Other';
  notes?: string;
}

export interface UpdateInvoiceRequest {
  reservation_id?: string;
  guest_id?: string;
  issue_date?: string;
  due_date?: string;
  amount?: number;
  status?: 'Pending' | 'Paid' | 'Cancelled';
  payment_method?: 'Cash' | 'Card' | 'Online' | 'Bank Transfer' | 'Other';
  notes?: string;
}

export interface InvoiceResponse {
  id: string;
  reservation_id?: string;
  reservation_number?: string;
  guest_id: string;
  guest_name: string;
  guest_email?: string;
  guest_phone?: string;
  issue_date: string;
  due_date: string;
  amount: number;
  status: string;
  payment_method?: string;
  notes?: string;
  paid_at?: string;
  created_at: string;
  updated_at: string;
}



