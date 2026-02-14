import type { Request, Response, NextFunction } from 'express';
import db from '../../config/database.js';
import {
  generateToken,
  generateRefreshToken,
  hashPassword,
  comparePassword,
  type JwtPayload,
} from './auth_utils.js';
import type { LoginRequest, RegisterRequest, AuthResponse } from './auth_types.js';
import { logAction, logCreate } from '../audit/audit_utils.js';

export async function loginHandler(
  req: Request<{}, AuthResponse, LoginRequest>,
  res: Response<AuthResponse>,
  next: NextFunction,
) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({
        error: 'Email and password are required',
      } as any);
      return;
    }

    // Find user by email
    const user = await db('users')
      .where({ email: email.toLowerCase() })
      .whereNull('deleted_at')
      .first();

    if (!user) {
      res.status(401).json({
        error: 'Invalid email or password',
      } as any);
      return;
    }

    // Check if user is active
    if (!user.is_active) {
      res.status(401).json({
        error: 'Account is inactive',
      } as any);
      return;
    }

    // Verify password
    const isValidPassword = await comparePassword(password, user.password_hash);
    if (!isValidPassword) {
      res.status(401).json({
        error: 'Invalid email or password',
      } as any);
      return;
    }

    // Generate tokens
    const tokenPayload: JwtPayload = {
      userId: user.id,
      email: user.email,
      role: user.role,
    };

    const token = generateToken(tokenPayload);
    const refreshToken = generateRefreshToken();

    // Update user with refresh token and last login
    await db('users')
      .where({ id: user.id })
      .update({
        refresh_token: refreshToken,
        refresh_token_expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        last_login: new Date(),
      });

    // Fetch user's hotels
    let hotels = [];
    if (user.role === 'SUPER_ADMIN') {
      // SUPER_ADMIN sees all hotels
      hotels = await db('hotels')
        .whereNull('deleted_at')
        .select('id', 'hotel_name')
        .orderBy('hotel_name', 'asc');
    } else {
      // Other users see only assigned hotels
      hotels = await db('hotels')
        .join('user_hotels', 'hotels.id', 'user_hotels.hotel_id')
        .where('user_hotels.user_id', user.id)
        .whereNull('hotels.deleted_at')
        .select('hotels.id', 'hotels.hotel_name')
        .orderBy('hotels.hotel_name', 'asc');
    }

    // Auto-assign to default hotel if user has no hotels (Phase 1 backward compatibility)
    if (hotels.length === 0 && user.role !== 'SUPER_ADMIN') {
      const DEFAULT_HOTEL_ID = '00000000-0000-0000-0000-000000000000';
      
      // Check if default hotel exists
      const defaultHotel = await db('hotels')
        .where({ id: DEFAULT_HOTEL_ID })
        .whereNull('deleted_at')
        .first();

      if (defaultHotel) {
        // Auto-assign user to default hotel
        try {
          await db('user_hotels').insert({
            user_id: user.id,
            hotel_id: DEFAULT_HOTEL_ID,
          });
          
          console.log(`[Auth] Auto-assigned user ${user.email} to default hotel`);
          
          // Add to hotels list
          hotels = [{ id: defaultHotel.id, hotel_name: defaultHotel.hotel_name }];
        } catch (error) {
          // Ignore duplicate key errors (user already assigned)
          console.error('[Auth] Failed to auto-assign user to default hotel:', error);
        }
      }
    }

    // Set first hotel as active (if any)
    const activeHotelId = hotels.length > 0 ? hotels[0].id : undefined;

    // Return user data and token
    res.json({
      user: {
        id: user.id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        role: user.role,
      },
      token,
      refreshToken,
      hotels,
      activeHotelId,
    } as any);

    // Audit log: user login
    logAction(req, 'USER_LOGIN', 'user', user.id, {
      email: user.email,
      role: user.role,
    }).catch((err) => console.error('Audit log failed:', err));
  } catch (error) {
    next(error);
  }
}

export async function registerHandler(
  req: Request<{}, AuthResponse, RegisterRequest>,
  res: Response<AuthResponse>,
  next: NextFunction,
) {
  try {
    const { email, password, first_name, last_name, role = 'VIEWER' } = req.body;

    if (!email || !password || !first_name || !last_name) {
      res.status(400).json({
        error: 'Email, password, first name, and last name are required',
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
        is_active: true,
      })
      .returning(['id', 'email', 'first_name', 'last_name', 'role']);

    // Generate tokens
    const tokenPayload: JwtPayload = {
      userId: user.id,
      email: user.email,
      role: user.role,
    };

    const token = generateToken(tokenPayload);
    const refreshToken = generateRefreshToken();

    // Update user with refresh token
    await db('users')
      .where({ id: user.id })
      .update({
        refresh_token: refreshToken,
        refresh_token_expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });

    res.status(201).json({
      user: {
        id: user.id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        role: user.role,
      },
      token,
      refreshToken,
    } as any);

    // Audit log: user registered
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

export async function refreshTokenHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      res.status(400).json({
        error: 'Refresh token is required',
      });
      return;
    }

    // Find user by refresh token
    const user = await db('users')
      .where({ refresh_token: refreshToken })
      .where('refresh_token_expires_at', '>', new Date())
      .whereNull('deleted_at')
      .first();

    if (!user) {
      res.status(401).json({
        error: 'Invalid or expired refresh token',
      });
      return;
    }

    // Check if user is still active
    if (!user.is_active) {
      res.status(401).json({
        error: 'Account is inactive',
      });
      return;
    }

    // Generate new access token
    const tokenPayload: JwtPayload = {
      userId: user.id,
      email: user.email,
      role: user.role,
    };

    const token = generateToken(tokenPayload);
    
    // Rotate refresh token for security (best practice)
    const newRefreshToken = generateRefreshToken();
    
    // Update user with new refresh token
    await db('users')
      .where({ id: user.id })
      .update({
        refresh_token: newRefreshToken,
        refresh_token_expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      });

    res.json({
      token,
      refreshToken: newRefreshToken,
    });
  } catch (error) {
    next(error);
  }
}

export async function meHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const userId = (req as any).user?.userId;

    if (!userId) {
      res.status(401).json({
        error: 'Unauthorized',
      });
      return;
    }

    const user = await db('users')
      .where({ id: userId })
      .whereNull('deleted_at')
      .select('id', 'email', 'first_name', 'last_name', 'role', 'is_active')
      .first();

    if (!user) {
      res.status(404).json({
        error: 'User not found',
      });
      return;
    }

    // Fetch user's hotels
    let hotels = [];
    if (user.role === 'SUPER_ADMIN') {
      // SUPER_ADMIN sees all hotels
      hotels = await db('hotels')
        .whereNull('deleted_at')
        .select('id', 'hotel_name')
        .orderBy('hotel_name', 'asc');
    } else {
      // Other users see only assigned hotels
      hotels = await db('hotels')
        .join('user_hotels', 'hotels.id', 'user_hotels.hotel_id')
        .where('user_hotels.user_id', user.id)
        .whereNull('hotels.deleted_at')
        .select('hotels.id', 'hotels.hotel_name')
        .orderBy('hotels.hotel_name', 'asc');
    }

    res.json({
      user: {
        id: user.id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        role: user.role,
      },
      hotels,
    });
  } catch (error) {
    next(error);
  }
}

