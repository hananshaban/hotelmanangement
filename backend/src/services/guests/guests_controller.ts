import type { Request, Response, NextFunction } from 'express';
import db from '../../config/database.js';
import type { CreateGuestRequest, UpdateGuestRequest, GuestResponse } from './guests_types.js';
import { logCreate, logUpdate, logDelete } from '../audit/audit_utils.js';

// Get all guests
export async function getGuestsHandler(
  req: Request,
  res: Response<GuestResponse[]>,
  next: NextFunction,
) {
  try {
    const { search } = req.query;

    let query = db('guests')
      .select('*')
      .whereNull('deleted_at')
      .orderBy('created_at', 'desc');

    if (search) {
      query = query.where(function () {
        this.where('name', 'ilike', `%${search}%`)
          .orWhere('email', 'ilike', `%${search}%`)
          .orWhere('phone', 'ilike', `%${search}%`);
      });
    }

    const guests = await query;

    const response: GuestResponse[] = guests.map((guest) => ({
      id: guest.id,
      name: guest.name,
      email: guest.email || undefined,
      phone: guest.phone || undefined,
      past_stays: guest.past_stays || 0,
      notes: guest.notes || undefined,
      created_at: guest.created_at,
      updated_at: guest.updated_at,
    }));

    res.json(response);
  } catch (error) {
    next(error);
  }
}

// Get single guest
export async function getGuestHandler(
  req: Request<{ id: string }>,
  res: Response<GuestResponse>,
  next: NextFunction,
) {
  try {
    const { id } = req.params;

    const guest = await db('guests')
      .where({ id })
      .whereNull('deleted_at')
      .first();

    if (!guest) {
      res.status(404).json({
        error: 'Guest not found',
      } as any);
      return;
    }

    const response: GuestResponse = {
      id: guest.id,
      name: guest.name,
      email: guest.email || undefined,
      phone: guest.phone || undefined,
      past_stays: guest.past_stays || 0,
      notes: guest.notes || undefined,
      created_at: guest.created_at,
      updated_at: guest.updated_at,
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
}

// Create guest
export async function createGuestHandler(
  req: Request<{}, GuestResponse, CreateGuestRequest>,
  res: Response<GuestResponse>,
  next: NextFunction,
) {
  try {
    const { name, email, phone, past_stays = 0, notes } = req.body;

    // Validation
    if (!name) {
      res.status(400).json({
        error: 'name is required',
      } as any);
      return;
    }

    // Email validation if provided
    if (email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        res.status(400).json({
          error: 'Invalid email format',
        } as any);
        return;
      }
    }

    // Check for duplicate email if provided
    if (email) {
      const existingGuest = await db('guests')
        .where({ email })
        .whereNull('deleted_at')
        .first();

      if (existingGuest) {
        res.status(409).json({
          error: 'Guest with this email already exists',
        } as any);
        return;
      }
    }

    // Create guest
    const [newGuest] = await db('guests')
      .insert({
        name,
        email: email || null,
        phone: phone || null,
        past_stays: past_stays || 0,
        notes: notes || null,
      })
      .returning('*');

    const response: GuestResponse = {
      id: newGuest.id,
      name: newGuest.name,
      email: newGuest.email || undefined,
      phone: newGuest.phone || undefined,
      past_stays: newGuest.past_stays || 0,
      notes: newGuest.notes || undefined,
      created_at: newGuest.created_at,
      updated_at: newGuest.updated_at,
    };

    res.status(201).json(response);

    // Audit log: guest created
    logCreate(req, 'guest', newGuest.id, {
      name: newGuest.name,
      email: newGuest.email,
      phone: newGuest.phone,
    }).catch((err) => console.error('Audit log failed:', err));
  } catch (error) {
    next(error);
  }
}

// Update guest
export async function updateGuestHandler(
  req: Request<{ id: string }, GuestResponse, UpdateGuestRequest>,
  res: Response<GuestResponse>,
  next: NextFunction,
) {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Check if guest exists
    const existing = await db('guests')
      .where({ id })
      .whereNull('deleted_at')
      .first();

    if (!existing) {
      res.status(404).json({
        error: 'Guest not found',
      } as any);
      return;
    }

    const updateData: any = {
      updated_at: new Date(),
    };

    if (updates.name !== undefined) {
      updateData.name = updates.name;
    }

    if (updates.email !== undefined) {
      // Email validation if provided
      if (updates.email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(updates.email)) {
          res.status(400).json({
            error: 'Invalid email format',
          } as any);
          return;
        }

        // Check for duplicate email (excluding current guest)
        const existingGuest = await db('guests')
          .where({ email: updates.email })
          .where('id', '!=', id)
          .whereNull('deleted_at')
          .first();

        if (existingGuest) {
          res.status(409).json({
            error: 'Guest with this email already exists',
          } as any);
          return;
        }
      }
      updateData.email = updates.email || null;
    }

    if (updates.phone !== undefined) {
      updateData.phone = updates.phone || null;
    }

    if (updates.past_stays !== undefined) {
      updateData.past_stays = updates.past_stays || 0;
    }

    if (updates.notes !== undefined) {
      updateData.notes = updates.notes || null;
    }

    // Update guest
    const [updated] = await db('guests')
      .where({ id })
      .update(updateData)
      .returning('*');

    const response: GuestResponse = {
      id: updated.id,
      name: updated.name,
      email: updated.email || undefined,
      phone: updated.phone || undefined,
      past_stays: updated.past_stays || 0,
      notes: updated.notes || undefined,
      created_at: updated.created_at,
      updated_at: updated.updated_at,
    };

    res.json(response);

    // Audit log: guest updated
    logUpdate(req, 'guest', id, {
      name: existing.name,
      email: existing.email,
      phone: existing.phone,
    }, {
      name: updated.name,
      email: updated.email,
      phone: updated.phone,
    }).catch((err) => console.error('Audit log failed:', err));
  } catch (error) {
    next(error);
  }
}

// Delete guest (soft delete)
export async function deleteGuestHandler(
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction,
) {
  try {
    const { id } = req.params;

    const guest = await db('guests')
      .where({ id })
      .whereNull('deleted_at')
      .first();

    if (!guest) {
      res.status(404).json({
        error: 'Guest not found',
      });
      return;
    }

    // Soft delete
    await db('guests').where({ id }).update({
      deleted_at: new Date(),
    });

    res.status(204).send();

    // Audit log: guest deleted
    logDelete(req, 'guest', id, {
      name: guest.name,
      email: guest.email,
      phone: guest.phone,
    }).catch((err) => console.error('Audit log failed:', err));
  } catch (error) {
    next(error);
  }
}

