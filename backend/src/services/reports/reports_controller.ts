import type { Request, Response, NextFunction } from 'express';
import db from '../../config/database.js';
import type { ReportStatsResponse } from './reports_types.js';

// Get comprehensive report statistics
export async function getReportStatsHandler(
  req: Request,
  res: Response<ReportStatsResponse>,
  next: NextFunction,
) {
  try {
    const { start_date, end_date } = req.query;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0];

    const next7Days = new Date();
    next7Days.setDate(next7Days.getDate() + 7);
    const next7DaysStr = next7Days.toISOString().split('T')[0];

    // Reservations statistics
    let reservationsQuery = db('reservations').whereNull('deleted_at');
    if (start_date) {
      reservationsQuery = reservationsQuery.whereRaw('check_in >= ?', [start_date as string]);
    }
    if (end_date) {
      reservationsQuery = reservationsQuery.whereRaw('check_out <= ?', [end_date as string]);
    }

    const allReservations = await reservationsQuery;
    const reservationsByStatus: Record<string, number> = {};
    allReservations.forEach((res) => {
      reservationsByStatus[res.status] = (reservationsByStatus[res.status] || 0) + 1;
    });

    const todaysCheckIns = await db('reservations')
      .whereRaw('check_in = ?', [todayStr])
      .whereIn('status', ['Confirmed', 'Checked-in'])
      .whereNull('deleted_at')
      .count('* as count')
      .first();

    const todaysCheckOuts = await db('reservations')
      .whereRaw('check_out = ?', [todayStr])
      .whereIn('status', ['Checked-in', 'Checked-out'])
      .whereNull('deleted_at')
      .count('* as count')
      .first();

    const upcomingCheckIns = await db('reservations')
      .whereRaw('check_in > ?', [todayStr])
      .whereRaw('check_in <= ?', [next7DaysStr])
      .whereIn('status', ['Confirmed'])
      .whereNull('deleted_at')
      .count('* as count')
      .first();

    const upcomingCheckOuts = await db('reservations')
      .whereRaw('check_out > ?', [todayStr])
      .whereRaw('check_out <= ?', [next7DaysStr])
      .whereIn('status', ['Checked-in'])
      .whereNull('deleted_at')
      .count('* as count')
      .first();

    // Guests statistics
    let guestsQuery = db('guests').whereNull('deleted_at');
    const allGuests = await guestsQuery;
    const guestsWithPastStays = allGuests.filter((g) => (g.past_stays || 0) > 0).length;
    const newGuests = allGuests.filter((g) => (g.past_stays || 0) === 0).length;

    // Invoices statistics
    let invoicesQuery = db('invoices').whereNull('deleted_at');
    if (start_date) {
      invoicesQuery = invoicesQuery.whereRaw('issue_date >= ?', [start_date as string]);
    }
    if (end_date) {
      invoicesQuery = invoicesQuery.whereRaw('issue_date <= ?', [end_date as string]);
    }

    const allInvoices = await invoicesQuery;
    const invoicesByStatus: Record<string, number> = {};
    let totalRevenue = 0;
    let pendingAmount = 0;

    allInvoices.forEach((inv) => {
      invoicesByStatus[inv.status] = (invoicesByStatus[inv.status] || 0) + 1;
      if (inv.status === 'Paid') {
        totalRevenue += parseFloat(inv.amount);
      } else if (inv.status === 'Pending') {
        pendingAmount += parseFloat(inv.amount);
      }
    });

    const overdueInvoices = await db('invoices')
      .where('status', 'Pending')
      .whereRaw('due_date < ?', [todayStr])
      .whereNull('deleted_at')
      .count('* as count')
      .first();

    // Expenses statistics
    let expensesQuery = db('expenses').whereNull('deleted_at');
    if (start_date) {
      expensesQuery = expensesQuery.whereRaw('expense_date >= ?', [start_date as string]);
    }
    if (end_date) {
      expensesQuery = expensesQuery.whereRaw('expense_date <= ?', [end_date as string]);
    }

    const allExpenses = await expensesQuery;
    const expensesByCategory: Record<string, number> = {};
    let totalExpenses = 0;

    allExpenses.forEach((exp) => {
      expensesByCategory[exp.category] =
        (expensesByCategory[exp.category] || 0) + parseFloat(exp.amount);
      totalExpenses += parseFloat(exp.amount);
    });

    // Financial calculations
    const profit = totalRevenue - totalExpenses;
    const profitMargin = totalRevenue > 0 ? (profit / totalRevenue) * 100 : 0;

    // Occupancy statistics
    const totalRooms = await db('rooms').count('* as count').first();
    const occupiedRooms = await db('reservations')
      .whereRaw('check_in <= ?', [todayStr])
      .whereRaw('check_out > ?', [todayStr])
      .whereIn('status', ['Checked-in'])
      .whereNull('deleted_at')
      .countDistinct('room_id as count')
      .first();

    const totalRoomsCount = totalRooms?.count ? parseInt(String(totalRooms.count), 10) : 0;
    const occupiedRoomsCount = occupiedRooms?.count ? parseInt(String(occupiedRooms.count), 10) : 0;
    const currentOccupancyRate = totalRoomsCount > 0 ? (occupiedRoomsCount / totalRoomsCount) * 100 : 0;

    // Average occupancy for last 30 days
    const last30Days = new Date();
    last30Days.setDate(last30Days.getDate() - 30);
    const last30DaysStr = last30Days.toISOString().split('T')[0];

    const reservationsLast30Days = await db('reservations')
      .whereRaw('check_in >= ?', [last30DaysStr])
      .whereRaw('check_in <= ?', [todayStr])
      .whereIn('status', ['Checked-in', 'Checked-out'])
      .whereNull('deleted_at');

    // Calculate average occupancy (simplified - count of check-ins / days)
    const averageOccupancyRate = totalRoomsCount > 0
      ? ((reservationsLast30Days.length / 30) / totalRoomsCount) * 100
      : 0;

    const response: ReportStatsResponse = {
      reservations: {
        total: allReservations.length,
        by_status: reservationsByStatus,
        today_check_ins: todaysCheckIns?.count ? parseInt(String(todaysCheckIns.count), 10) : 0,
        today_check_outs: todaysCheckOuts?.count ? parseInt(String(todaysCheckOuts.count), 10) : 0,
        upcoming_check_ins: upcomingCheckIns?.count ? parseInt(String(upcomingCheckIns.count), 10) : 0,
        upcoming_check_outs: upcomingCheckOuts?.count ? parseInt(String(upcomingCheckOuts.count), 10) : 0,
      },
      guests: {
        total: allGuests.length,
        with_past_stays: guestsWithPastStays,
        new_guests: newGuests,
      },
      invoices: {
        total: allInvoices.length,
        by_status: invoicesByStatus,
        total_revenue: totalRevenue,
        pending_amount: pendingAmount,
        overdue_count: overdueInvoices?.count ? parseInt(String(overdueInvoices.count), 10) : 0,
      },
      expenses: {
        total: allExpenses.length,
        total_amount: totalExpenses,
        by_category: expensesByCategory,
      },
      financial: {
        total_revenue: totalRevenue,
        total_expenses: totalExpenses,
        profit: profit,
        profit_margin: profitMargin,
      },
      occupancy: {
        current_occupancy_rate: currentOccupancyRate,
        average_occupancy_rate: averageOccupancyRate,
      },
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
}

