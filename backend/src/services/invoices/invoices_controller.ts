import type { Request, Response, NextFunction } from 'express';
import db from '../../config/database.js';
import type { CreateInvoiceRequest, UpdateInvoiceRequest, InvoiceResponse } from './invoices_types.js';
import { logCreate, logUpdate, logDelete, logAction } from '../audit/audit_utils.js';

// Default hotel ID for backward compatibility
const DEFAULT_HOTEL_ID = '00000000-0000-0000-0000-000000000000';

// Get all invoices
export async function getInvoicesHandler(
  req: Request,
  res: Response<InvoiceResponse[]>,
  next: NextFunction,
) {
  try {
    const hotelId = (req as any).hotelId || DEFAULT_HOTEL_ID;
    const { status, search, reservation_id, guest_id } = req.query;

    let query = db('invoices')
      .select(
        'invoices.*',
        'reservations.id as reservation_number',
        'guests.name as guest_name',
        'guests.email as guest_email',
        'guests.phone as guest_phone',
      )
      .leftJoin('reservations', 'invoices.reservation_id', 'reservations.id')
      .join('guests', 'invoices.guest_id', 'guests.id')
      .where('invoices.hotel_id', hotelId)
      .whereNull('invoices.deleted_at')
      .orderBy('invoices.created_at', 'desc');

    if (status) {
      query = query.where('invoices.status', status as string);
    }

    if (reservation_id) {
      query = query.where('invoices.reservation_id', reservation_id as string);
    }

    if (guest_id) {
      query = query.where('invoices.guest_id', guest_id as string);
    }

    if (search) {
      query = query.where(function () {
        this.where('invoices.id', 'ilike', `%${search}%`)
          .orWhere('reservations.id', 'ilike', `%${search}%`)
          .orWhere('guests.name', 'ilike', `%${search}%`);
      });
    }

    const invoices = await query;

    const response: InvoiceResponse[] = invoices.map((invoice) => ({
      id: invoice.id,
      reservation_id: invoice.reservation_id || undefined,
      reservation_number: invoice.reservation_number || undefined,
      guest_id: invoice.guest_id,
      guest_name: invoice.guest_name,
      guest_email: invoice.guest_email || undefined,
      guest_phone: invoice.guest_phone || undefined,
      issue_date: invoice.issue_date,
      due_date: invoice.due_date,
      amount: parseFloat(invoice.amount),
      status: invoice.status,
      payment_method: invoice.payment_method || undefined,
      notes: invoice.notes || undefined,
      paid_at: invoice.paid_at || undefined,
      created_at: invoice.created_at,
      updated_at: invoice.updated_at,
    }));

    res.json(response);
  } catch (error) {
    next(error);
  }
}

// Get single invoice
export async function getInvoiceHandler(
  req: Request<{ id: string }>,
  res: Response<InvoiceResponse>,
  next: NextFunction,
) {
  try {
    const hotelId = (req as any).hotelId || DEFAULT_HOTEL_ID;
    const { id } = req.params;

    const invoice = await db('invoices')
      .select(
        'invoices.*',
        'reservations.id as reservation_number',
        'guests.name as guest_name',
        'guests.email as guest_email',
        'guests.phone as guest_phone',
      )
      .leftJoin('reservations', 'invoices.reservation_id', 'reservations.id')
      .join('guests', 'invoices.guest_id', 'guests.id')
      .where('invoices.id', id)
      .where('invoices.hotel_id', hotelId)
      .whereNull('invoices.deleted_at')
      .first();

    if (!invoice) {
      res.status(404).json({
        error: 'Invoice not found',
      } as any);
      return;
    }

    const response: InvoiceResponse = {
      id: invoice.id,
      reservation_id: invoice.reservation_id || undefined,
      reservation_number: invoice.reservation_number || undefined,
      guest_id: invoice.guest_id,
      guest_name: invoice.guest_name,
      guest_email: invoice.guest_email || undefined,
      guest_phone: invoice.guest_phone || undefined,
      issue_date: invoice.issue_date,
      due_date: invoice.due_date,
      amount: parseFloat(invoice.amount),
      status: invoice.status,
      payment_method: invoice.payment_method || undefined,
      notes: invoice.notes || undefined,
      paid_at: invoice.paid_at || undefined,
      created_at: invoice.created_at,
      updated_at: invoice.updated_at,
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
}

// Create invoice
export async function createInvoiceHandler(
  req: Request<{}, InvoiceResponse, CreateInvoiceRequest>,
  res: Response<InvoiceResponse>,
  next: NextFunction,
) {
  try {
    const hotelId = (req as any).hotelId || DEFAULT_HOTEL_ID;
    const {
      reservation_id,
      guest_id,
      issue_date,
      due_date,
      amount,
      status = 'Pending',
      payment_method,
      notes,
    } = req.body;

    // Validation
    if (!guest_id || !issue_date || !due_date || amount === undefined) {
      res.status(400).json({
        error: 'guest_id, issue_date, due_date, and amount are required',
      } as any);
      return;
    }

    const issueDate = new Date(issue_date);
    const dueDate = new Date(due_date);

    if (dueDate < issueDate) {
      res.status(400).json({
        error: 'due_date must be on or after issue_date',
      } as any);
      return;
    }

    if (amount <= 0) {
      res.status(400).json({
        error: 'amount must be greater than 0',
      } as any);
      return;
    }

    // Check if guest exists and belongs to the same hotel
    const guest = await db('guests').where({ id: guest_id, hotel_id: hotelId }).first();
    if (!guest) {
      res.status(404).json({
        error: 'Guest not found',
      } as any);
      return;
    }

    // Check if reservation exists if provided and belongs to the same hotel
    if (reservation_id) {
      const reservation = await db('reservations')
        .where({ id: reservation_id, hotel_id: hotelId })
        .whereNull('deleted_at')
        .first();
      if (!reservation) {
        res.status(404).json({
          error: 'Reservation not found',
        } as any);
        return;
      }
    }

    // Create invoice
    const [newInvoice] = await db('invoices')
      .insert({
        hotel_id: hotelId,
        reservation_id: reservation_id || null,
        guest_id,
        issue_date: issueDate.toISOString().split('T')[0],
        due_date: dueDate.toISOString().split('T')[0],
        amount,
        status,
        payment_method: payment_method || null,
        notes: notes || null,
        paid_at: status === 'Paid' ? new Date() : null,
      })
      .returning('*');

    // Fetch full invoice with guest details
    const fullInvoice = await db('invoices')
      .select(
        'invoices.*',
        'reservations.id as reservation_number',
        'guests.name as guest_name',
        'guests.email as guest_email',
        'guests.phone as guest_phone',
      )
      .leftJoin('reservations', 'invoices.reservation_id', 'reservations.id')
      .join('guests', 'invoices.guest_id', 'guests.id')
      .where('invoices.id', newInvoice.id)
      .first();

    const response: InvoiceResponse = {
      id: fullInvoice.id,
      reservation_id: fullInvoice.reservation_id || undefined,
      reservation_number: fullInvoice.reservation_number || undefined,
      guest_id: fullInvoice.guest_id,
      guest_name: fullInvoice.guest_name,
      guest_email: fullInvoice.guest_email || undefined,
      guest_phone: fullInvoice.guest_phone || undefined,
      issue_date: fullInvoice.issue_date,
      due_date: fullInvoice.due_date,
      amount: parseFloat(fullInvoice.amount),
      status: fullInvoice.status,
      payment_method: fullInvoice.payment_method || undefined,
      notes: fullInvoice.notes || undefined,
      paid_at: fullInvoice.paid_at || undefined,
      created_at: fullInvoice.created_at,
      updated_at: fullInvoice.updated_at,
    };

    res.status(201).json(response);

    // Audit log: invoice created
    logCreate(req, 'invoice', fullInvoice.id, {
      guest_id,
      guest_name: fullInvoice.guest_name,
      reservation_id: reservation_id || null,
      amount,
      status,
      issue_date,
      due_date,
    }).catch((err) => console.error('Audit log failed:', err));
  } catch (error) {
    next(error);
  }
}

// Update invoice
export async function updateInvoiceHandler(
  req: Request<{ id: string }, InvoiceResponse, UpdateInvoiceRequest>,
  res: Response<InvoiceResponse>,
  next: NextFunction,
) {
  try {
    const hotelId = (req as any).hotelId || DEFAULT_HOTEL_ID;
    const { id } = req.params;
    const updates = req.body;

    // Check if invoice exists and belongs to the same hotel
    const existing = await db('invoices')
      .where({ id, hotel_id: hotelId })
      .whereNull('deleted_at')
      .first();

    if (!existing) {
      res.status(404).json({
        error: 'Invoice not found',
      } as any);
      return;
    }

    const updateData: any = {
      updated_at: new Date(),
    };

    if (updates.reservation_id !== undefined) {
      updateData.reservation_id = updates.reservation_id || null;
    }

    if (updates.guest_id !== undefined) {
      // Check if guest exists and belongs to the same hotel
      const guest = await db('guests').where({ id: updates.guest_id, hotel_id: hotelId }).first();
      if (!guest) {
        res.status(404).json({
          error: 'Guest not found',
        } as any);
        return;
      }
      updateData.guest_id = updates.guest_id;
    }

    if (updates.issue_date) {
      updateData.issue_date = new Date(updates.issue_date).toISOString().split('T')[0];
    }

    if (updates.due_date) {
      updateData.due_date = new Date(updates.due_date).toISOString().split('T')[0];
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

    if (updates.status !== undefined) {
      updateData.status = updates.status;
      // Set paid_at when status changes to Paid
      if (updates.status === 'Paid' && existing.status !== 'Paid') {
        updateData.paid_at = new Date();
      } else if (updates.status !== 'Paid' && existing.status === 'Paid') {
        updateData.paid_at = null;
      }
    }

    if (updates.payment_method !== undefined) {
      updateData.payment_method = updates.payment_method || null;
    }

    if (updates.notes !== undefined) {
      updateData.notes = updates.notes || null;
    }

    // Validate dates
    const issueDate = updateData.issue_date
      ? new Date(updateData.issue_date)
      : new Date(existing.issue_date);
    const dueDate = updateData.due_date
      ? new Date(updateData.due_date)
      : new Date(existing.due_date);

    if (dueDate < issueDate) {
      res.status(400).json({
        error: 'due_date must be on or after issue_date',
      } as any);
      return;
    }

    // Update invoice
    await db('invoices').where({ id }).update(updateData);

    // Fetch updated invoice
    const updated = await db('invoices')
      .select(
        'invoices.*',
        'reservations.id as reservation_number',
        'guests.name as guest_name',
        'guests.email as guest_email',
        'guests.phone as guest_phone',
      )
      .leftJoin('reservations', 'invoices.reservation_id', 'reservations.id')
      .join('guests', 'invoices.guest_id', 'guests.id')
      .where('invoices.id', id)
      .first();

    const response: InvoiceResponse = {
      id: updated.id,
      reservation_id: updated.reservation_id || undefined,
      reservation_number: updated.reservation_number || undefined,
      guest_id: updated.guest_id,
      guest_name: updated.guest_name,
      guest_email: updated.guest_email || undefined,
      guest_phone: updated.guest_phone || undefined,
      issue_date: updated.issue_date,
      due_date: updated.due_date,
      amount: parseFloat(updated.amount),
      status: updated.status,
      payment_method: updated.payment_method || undefined,
      notes: updated.notes || undefined,
      paid_at: updated.paid_at || undefined,
      created_at: updated.created_at,
      updated_at: updated.updated_at,
    };

    res.json(response);

    // Audit log: invoice updated (with special handling for payment)
    const action = updates.status === 'Paid' && existing.status !== 'Paid' 
      ? 'RECORD_PAYMENT' 
      : 'UPDATE_INVOICE';
    
    if (action === 'RECORD_PAYMENT') {
      logAction(req, action, 'invoice', id, {
        amount: parseFloat(updated.amount),
        payment_method: updated.payment_method,
        guest_name: updated.guest_name,
      }).catch((err) => console.error('Audit log failed:', err));
    } else {
      logUpdate(req, 'invoice', id, {
        status: existing.status,
        amount: parseFloat(existing.amount),
        payment_method: existing.payment_method,
      }, {
        status: updated.status,
        amount: parseFloat(updated.amount),
        payment_method: updated.payment_method,
      }).catch((err) => console.error('Audit log failed:', err));
    }
  } catch (error) {
    next(error);
  }
}

// Delete invoice (soft delete)
export async function deleteInvoiceHandler(
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction,
) {
  try {
    const hotelId = (req as any).hotelId || DEFAULT_HOTEL_ID;
    const { id } = req.params;

    const invoice = await db('invoices')
      .where({ id, hotel_id: hotelId })
      .whereNull('deleted_at')
      .first();

    if (!invoice) {
      res.status(404).json({
        error: 'Invoice not found',
      });
      return;
    }

    // Soft delete
    await db('invoices').where({ id }).update({
      deleted_at: new Date(),
    });

    res.status(204).send();

    // Audit log: invoice deleted
    logDelete(req, 'invoice', id, {
      guest_id: invoice.guest_id,
      reservation_id: invoice.reservation_id,
      amount: parseFloat(invoice.amount),
      status: invoice.status,
    }).catch((err) => console.error('Audit log failed:', err));
  } catch (error) {
    next(error);
  }
}



