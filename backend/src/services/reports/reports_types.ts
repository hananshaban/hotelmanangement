export interface ReportStatsResponse {
  reservations: {
    total: number;
    by_status: Record<string, number>;
    today_check_ins: number;
    today_check_outs: number;
    upcoming_check_ins: number; // Next 7 days
    upcoming_check_outs: number; // Next 7 days
  };
  guests: {
    total: number;
    with_past_stays: number;
    new_guests: number; // No past stays
  };
  invoices: {
    total: number;
    by_status: Record<string, number>;
    total_revenue: number; // Sum of paid invoices
    pending_amount: number; // Sum of pending invoices
    overdue_count: number;
  };
  expenses: {
    total: number;
    total_amount: number;
    by_category: Record<string, number>;
  };
  financial: {
    total_revenue: number;
    total_expenses: number;
    profit: number;
    profit_margin: number; // Percentage
  };
  occupancy: {
    current_occupancy_rate: number; // Percentage
    average_occupancy_rate: number; // Last 30 days
  };
}

export interface DateRangeQuery {
  start_date?: string;
  end_date?: string;
}



