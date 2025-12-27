import type { Request, Response, NextFunction } from 'express';
import db from '../../config/database.js';
import type {
  CreateMaintenanceRequestRequest,
  UpdateMaintenanceRequestRequest,
  MaintenanceRequestResponse,
} from './maintenance_types.js';

// Get all maintenance requests
export async function getMaintenanceRequestsHandler(
  req: Request,
  res: Response<MaintenanceRequestResponse[]>,
  next: NextFunction,
) {
  try {
    const { status, priority, search, room_id } = req.query;

    let query = db('maintenance_requests')
      .select(
        'maintenance_requests.*',
        'rooms.room_number',
        'assigned_user.first_name as assigned_to_first_name',
        'assigned_user.last_name as assigned_to_last_name',
      )
      .join('rooms', 'maintenance_requests.room_id', 'rooms.id')
      .leftJoin('users as assigned_user', 'maintenance_requests.assigned_to', 'assigned_user.id')
      .whereNull('maintenance_requests.deleted_at')
      .orderBy('maintenance_requests.created_at', 'desc');

    if (status) {
      query = query.where('maintenance_requests.status', status as string);
    }

    if (priority) {
      query = query.where('maintenance_requests.priority', priority as string);
    }

    if (room_id) {
      query = query.where('maintenance_requests.room_id', room_id as string);
    }

    if (search) {
      query = query.where(function () {
        this.where('maintenance_requests.title', 'ilike', `%${search}%`)
          .orWhere('maintenance_requests.description', 'ilike', `%${search}%`)
          .orWhere('rooms.room_number', 'ilike', `%${search}%`);
      });
    }

    const requests = await query;

    const response: MaintenanceRequestResponse[] = requests.map((request) => {
      const item: MaintenanceRequestResponse = {
        id: request.id,
        room_id: request.room_id,
        room_number: request.room_number,
        title: request.title,
        description: request.description,
        priority: request.priority,
        status: request.status,
        created_at: request.created_at,
        updated_at: request.updated_at,
      };
      if (request.assigned_to) {
        item.assigned_to = request.assigned_to;
      }
      if (request.assigned_to_first_name && request.assigned_to_last_name) {
        item.assigned_to_name = `${request.assigned_to_first_name} ${request.assigned_to_last_name}`;
      }
      if (request.completed_at) {
        item.completed_at = request.completed_at;
      }
      return item;
    });

    res.json(response);
  } catch (error) {
    next(error);
  }
}

// Get single maintenance request
export async function getMaintenanceRequestHandler(
  req: Request<{ id: string }>,
  res: Response<MaintenanceRequestResponse>,
  next: NextFunction,
) {
  try {
    const { id } = req.params;

    const request = await db('maintenance_requests')
      .select(
        'maintenance_requests.*',
        'rooms.room_number',
        'assigned_user.first_name as assigned_to_first_name',
        'assigned_user.last_name as assigned_to_last_name',
      )
      .join('rooms', 'maintenance_requests.room_id', 'rooms.id')
      .leftJoin('users as assigned_user', 'maintenance_requests.assigned_to', 'assigned_user.id')
      .where('maintenance_requests.id', id)
      .whereNull('maintenance_requests.deleted_at')
      .first();

    if (!request) {
      res.status(404).json({
        error: 'Maintenance request not found',
      } as any);
      return;
    }

    const response: MaintenanceRequestResponse = {
      id: request.id,
      room_id: request.room_id,
      room_number: request.room_number,
      title: request.title,
      description: request.description,
      priority: request.priority,
      status: request.status,
      created_at: request.created_at,
      updated_at: request.updated_at,
    };
    if (request.assigned_to) {
      response.assigned_to = request.assigned_to;
    }
    if (request.assigned_to_first_name && request.assigned_to_last_name) {
      response.assigned_to_name = `${request.assigned_to_first_name} ${request.assigned_to_last_name}`;
    }
    if (request.completed_at) {
      response.completed_at = request.completed_at;
    }

    res.json(response);
  } catch (error) {
    next(error);
  }
}

// Create maintenance request
export async function createMaintenanceRequestHandler(
  req: Request<{}, MaintenanceRequestResponse, CreateMaintenanceRequestRequest>,
  res: Response<MaintenanceRequestResponse>,
  next: NextFunction,
) {
  try {
    const { room_id, title, description, priority = 'Medium', status = 'Open', assigned_to } = req.body;

    // Validation
    if (!room_id || !title || !description) {
      res.status(400).json({
        error: 'room_id, title, and description are required',
      } as any);
      return;
    }

    // Check if room exists
    const room = await db('rooms').where({ id: room_id }).first();
    if (!room) {
      res.status(404).json({
        error: 'Room not found',
      } as any);
      return;
    }

    // Check if assigned user exists if provided
    if (assigned_to) {
      const user = await db('users').where({ id: assigned_to }).first();
      if (!user) {
        res.status(404).json({
          error: 'Assigned user not found',
        } as any);
        return;
      }
    }

    // Create maintenance request
    const [newRequest] = await db('maintenance_requests')
      .insert({
        room_id,
        title,
        description,
        priority,
        status,
        assigned_to: assigned_to || null,
        completed_at: status === 'Repaired' ? new Date() : null,
      })
      .returning('*');

    // Fetch full request with room and user details
    const fullRequest = await db('maintenance_requests')
      .select(
        'maintenance_requests.*',
        'rooms.room_number',
        'assigned_user.first_name as assigned_to_first_name',
        'assigned_user.last_name as assigned_to_last_name',
      )
      .join('rooms', 'maintenance_requests.room_id', 'rooms.id')
      .leftJoin('users as assigned_user', 'maintenance_requests.assigned_to', 'assigned_user.id')
      .where('maintenance_requests.id', newRequest.id)
      .first();

    const response: MaintenanceRequestResponse = {
      id: fullRequest.id,
      room_id: fullRequest.room_id,
      room_number: fullRequest.room_number,
      title: fullRequest.title,
      description: fullRequest.description,
      priority: fullRequest.priority,
      status: fullRequest.status,
      created_at: fullRequest.created_at,
      updated_at: fullRequest.updated_at,
    };
    if (fullRequest.assigned_to) {
      response.assigned_to = fullRequest.assigned_to;
    }
    if (fullRequest.assigned_to_first_name && fullRequest.assigned_to_last_name) {
      response.assigned_to_name = `${fullRequest.assigned_to_first_name} ${fullRequest.assigned_to_last_name}`;
    }
    if (fullRequest.completed_at) {
      response.completed_at = fullRequest.completed_at;
    }

    res.status(201).json(response);
  } catch (error) {
    next(error);
  }
}

// Update maintenance request
export async function updateMaintenanceRequestHandler(
  req: Request<{ id: string }, MaintenanceRequestResponse, UpdateMaintenanceRequestRequest>,
  res: Response<MaintenanceRequestResponse>,
  next: NextFunction,
) {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Check if request exists
    const existing = await db('maintenance_requests')
      .where({ id })
      .whereNull('deleted_at')
      .first();

    if (!existing) {
      res.status(404).json({
        error: 'Maintenance request not found',
      } as any);
      return;
    }

    const updateData: any = {
      updated_at: new Date(),
    };

    if (updates.room_id !== undefined) {
      // Check if room exists
      const room = await db('rooms').where({ id: updates.room_id }).first();
      if (!room) {
        res.status(404).json({
          error: 'Room not found',
        } as any);
        return;
      }
      updateData.room_id = updates.room_id;
    }

    if (updates.title !== undefined) {
      updateData.title = updates.title;
    }

    if (updates.description !== undefined) {
      updateData.description = updates.description;
    }

    if (updates.priority !== undefined) {
      updateData.priority = updates.priority;
    }

    if (updates.status !== undefined) {
      updateData.status = updates.status;
      // Set completed_at when status changes to Repaired
      if (updates.status === 'Repaired' && existing.status !== 'Repaired') {
        updateData.completed_at = new Date();
      } else if (updates.status !== 'Repaired' && existing.status === 'Repaired') {
        updateData.completed_at = null;
      }
    }

    if (updates.assigned_to !== undefined) {
      if (updates.assigned_to) {
        // Check if user exists
        const user = await db('users').where({ id: updates.assigned_to }).first();
        if (!user) {
          res.status(404).json({
            error: 'Assigned user not found',
          } as any);
          return;
        }
      }
      updateData.assigned_to = updates.assigned_to || null;
    }

    // Update maintenance request
    await db('maintenance_requests').where({ id }).update(updateData);

    // Fetch updated request
    const updated = await db('maintenance_requests')
      .select(
        'maintenance_requests.*',
        'rooms.room_number',
        'assigned_user.first_name as assigned_to_first_name',
        'assigned_user.last_name as assigned_to_last_name',
      )
      .join('rooms', 'maintenance_requests.room_id', 'rooms.id')
      .leftJoin('users as assigned_user', 'maintenance_requests.assigned_to', 'assigned_user.id')
      .where('maintenance_requests.id', id)
      .first();

    const response: MaintenanceRequestResponse = {
      id: updated.id,
      room_id: updated.room_id,
      room_number: updated.room_number,
      title: updated.title,
      description: updated.description,
      priority: updated.priority,
      status: updated.status,
      created_at: updated.created_at,
      updated_at: updated.updated_at,
    };
    if (updated.assigned_to) {
      response.assigned_to = updated.assigned_to;
    }
    if (updated.assigned_to_first_name && updated.assigned_to_last_name) {
      response.assigned_to_name = `${updated.assigned_to_first_name} ${updated.assigned_to_last_name}`;
    }
    if (updated.completed_at) {
      response.completed_at = updated.completed_at;
    }

    res.json(response);
  } catch (error) {
    next(error);
  }
}

// Delete maintenance request (soft delete)
export async function deleteMaintenanceRequestHandler(
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction,
) {
  try {
    const { id } = req.params;

    const request = await db('maintenance_requests')
      .where({ id })
      .whereNull('deleted_at')
      .first();

    if (!request) {
      res.status(404).json({
        error: 'Maintenance request not found',
      });
      return;
    }

    // Soft delete
    await db('maintenance_requests').where({ id }).update({
      deleted_at: new Date(),
    });

    res.status(204).send();
  } catch (error) {
    next(error);
  }
}

