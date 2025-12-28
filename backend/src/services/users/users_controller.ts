import type { Request, Response, NextFunction } from 'express';
import db from '../../config/database.js';
import { hashPassword } from '../auth/auth_utils.js';
import type { CreateUserRequest, UpdateUserRequest, UserResponse } from './users_types.js';
import { requireRole } from '../auth/auth_middleware.js';
import { logCreate, logUpdate, logDelete } from '../audit/audit_utils.js';

/**
 * Get all users (staff)
 */
export async function getUsersHandler(
  req: Request,
  res: Response<UserResponse[]>,
  next: NextFunction,
) {
  try {
    const users = await db('users')
      .select('id', 'email', 'first_name', 'last_name', 'role', 'is_active', 'last_login', 'created_at', 'updated_at')
      .whereNull('deleted_at')
      .orderBy('created_at', 'desc');

    res.json(users as UserResponse[]);
  } catch (error) {
    next(error);
  }
}

/**
 * Get single user
 */
export async function getUserHandler(
  req: Request<{ id: string }>,
  res: Response<UserResponse>,
  next: NextFunction,
) {
  try {
    const { id } = req.params;

    const user = await db('users')
      .select('id', 'email', 'first_name', 'last_name', 'role', 'is_active', 'last_login', 'created_at', 'updated_at')
      .where({ id })
      .whereNull('deleted_at')
      .first();

    if (!user) {
      res.status(404).json({
        error: 'User not found',
      } as any);
      return;
    }

    res.json(user as UserResponse);
  } catch (error) {
    next(error);
  }
}

/**
 * Create new user (staff member)
 */
export async function createUserHandler(
  req: Request<{}, UserResponse, CreateUserRequest>,
  res: Response<UserResponse>,
  next: NextFunction,
) {
  try {
    const { email, password, first_name, last_name, role, is_active = true } = req.body;

    // Validation
    if (!email || !password || !first_name || !last_name || !role) {
      res.status(400).json({
        error: 'Email, password, first name, last name, and role are required',
      } as any);
      return;
    }

    // Validate role
    const validRoles = ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'FRONT_DESK', 'HOUSEKEEPING', 'MAINTENANCE', 'VIEWER'];
    if (!validRoles.includes(role)) {
      res.status(400).json({
        error: 'Invalid role',
      } as any);
      return;
    }

    // Check if user already exists
    const existingUser = await db('users')
      .where({ email: email.toLowerCase() })
      .whereNull('deleted_at')
      .first();

    if (existingUser) {
      res.status(409).json({
        error: 'User with this email already exists',
      } as any);
      return;
    }

    // Hash password
    const passwordHash = await hashPassword(password);

    // Create user
    const [user] = await db('users')
      .insert({
        email: email.toLowerCase(),
        password_hash: passwordHash,
        first_name,
        last_name,
        role,
        is_active,
      })
      .returning(['id', 'email', 'first_name', 'last_name', 'role', 'is_active', 'last_login', 'created_at', 'updated_at']);

    res.status(201).json(user as UserResponse);

    // Audit log: user created
    logCreate(req, 'user', user.id, {
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
      role: user.role,
    }).catch((err) => console.error('Audit log failed:', err));
  } catch (error) {
    next(error);
  }
}

/**
 * Update user
 */
export async function updateUserHandler(
  req: Request<{ id: string }, UserResponse, UpdateUserRequest>,
  res: Response<UserResponse>,
  next: NextFunction,
) {
  try {
    const { id } = req.params;
    const { email, first_name, last_name, role, is_active, password } = req.body;

    // Check if user exists
    const existingUser = await db('users')
      .where({ id })
      .whereNull('deleted_at')
      .first();

    if (!existingUser) {
      res.status(404).json({
        error: 'User not found',
      } as any);
      return;
    }

    const updateData: any = {
      updated_at: new Date(),
    };

    if (email !== undefined) {
      // Check if email is already taken by another user
      const emailTaken = await db('users')
        .where({ email: email.toLowerCase() })
        .where('id', '!=', id)
        .whereNull('deleted_at')
        .first();

      if (emailTaken) {
        res.status(409).json({
          error: 'Email already in use by another user',
        } as any);
        return;
      }

      updateData.email = email.toLowerCase();
    }

    if (first_name !== undefined) updateData.first_name = first_name;
    if (last_name !== undefined) updateData.last_name = last_name;
    if (is_active !== undefined) updateData.is_active = is_active;

    if (role !== undefined) {
      const validRoles = ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'FRONT_DESK', 'HOUSEKEEPING', 'MAINTENANCE', 'VIEWER'];
      if (!validRoles.includes(role)) {
        res.status(400).json({
          error: 'Invalid role',
        } as any);
        return;
      }
      updateData.role = role;
    }

    if (password) {
      updateData.password_hash = await hashPassword(password);
    }

    // Update user
    const [updatedUser] = await db('users')
      .where({ id })
      .update(updateData)
      .returning(['id', 'email', 'first_name', 'last_name', 'role', 'is_active', 'last_login', 'created_at', 'updated_at']);

    res.json(updatedUser as UserResponse);

    // Audit log: user updated
    logUpdate(req, 'user', id, {
      email: existingUser.email,
      first_name: existingUser.first_name,
      last_name: existingUser.last_name,
      role: existingUser.role,
      is_active: existingUser.is_active,
    }, {
      email: updatedUser.email,
      first_name: updatedUser.first_name,
      last_name: updatedUser.last_name,
      role: updatedUser.role,
      is_active: updatedUser.is_active,
    }).catch((err) => console.error('Audit log failed:', err));
  } catch (error) {
    next(error);
  }
}

/**
 * Delete user (soft delete)
 */
export async function deleteUserHandler(
  req: Request<{ id: string }>,
  res: Response<{ success: boolean; message: string }>,
  next: NextFunction,
) {
  try {
    const { id } = req.params;

    // Check if user exists
    const existingUser = await db('users')
      .where({ id })
      .whereNull('deleted_at')
      .first();

    if (!existingUser) {
      res.status(404).json({
        error: 'User not found',
      } as any);
      return;
    }

    // Prevent deleting yourself
    const currentUserId = (req as any).user?.userId;
    if (currentUserId === id) {
      res.status(400).json({
        error: 'You cannot delete your own account',
      } as any);
      return;
    }

    // Soft delete
    await db('users')
      .where({ id })
      .update({
        deleted_at: new Date(),
        updated_at: new Date(),
      });

    res.json({
      success: true,
      message: 'User deleted successfully',
    });

    // Audit log: user deleted
    logDelete(req, 'user', id, {
      email: existingUser.email,
      first_name: existingUser.first_name,
      last_name: existingUser.last_name,
      role: existingUser.role,
    }).catch((err) => console.error('Audit log failed:', err));
  } catch (error) {
    next(error);
  }
}

