/**
 * Authentication Routes — PRD §2.2
 * 
 * Handles user login, registration, token refresh, and logout.
 * Implements rate limiting, audit logging, and JWT token management.
 */

import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { db } from '../../services/databaseService.js';
import { checkLoginRateLimit, resetLoginRateLimit } from '../../cache/cacheService.js';
import { authenticateToken } from '../../middleware/auth.js';

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || 'vigilos-secret-key-2024';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '15m';
const REFRESH_EXPIRES_IN_DAYS = parseInt(process.env.REFRESH_TOKEN_EXPIRY_DAYS || '7');

/**
 * POST /auth/login
 * User login with rate limiting and audit logging
 */
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const clientIP = req.ip || req.socket.remoteAddress || 'unknown';

  try {
    // Check login rate limit per IP
    const rateCheck = await checkLoginRateLimit(clientIP);
    if (!rateCheck.allowed) {
      await db.createAuditLog({
        tenantId: 'system',
        action: 'LOGIN_RATE_LIMITED',
        resource: 'auth',
        details: { email, reason: `Rate limited: ${rateCheck.attempts} attempts` },
        ipAddress: clientIP,
      });

      return res.status(429).json({
        success: false,
        error: 'Too many login attempts',
        message: `Account locked. Try again in ${rateCheck.retryAfterSec} seconds.`,
        retryAfterSec: rateCheck.retryAfterSec,
        remaining: rateCheck.remaining,
      });
    }

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Email and password are required',
      });
    }

    // Find user by email
    const user = await db.getUserByEmail(email);
    if (!user) {
      await db.createAuditLog({
        tenantId: 'system',
        action: 'LOGIN_FAILED',
        resource: 'auth',
        details: { email, reason: 'User not found' },
        ipAddress: clientIP,
      });

      return res.status(401).json({
        success: false,
        error: 'Invalid email or password',
        attemptsRemaining: rateCheck.remaining - 1,
      });
    }

    // Validate password
    const isValidPassword = await bcrypt.compare(password, user.passwordHash);
    if (!isValidPassword) {
      await db.createAuditLog({
        tenantId: user.tenantId,
        userId: user.id,
        action: 'LOGIN_FAILED',
        resource: 'auth',
        details: { email, reason: 'Invalid password' },
        ipAddress: clientIP,
      });

      return res.status(401).json({
        success: false,
        error: 'Invalid email or password',
        attemptsRemaining: rateCheck.remaining - 1,
      });
    }

    // Check user status
    if (user.status !== 'ACTIVE') {
      return res.status(403).json({
        success: false,
        error: `Account is ${user.status.toLowerCase()}`,
      });
    }

    // Successful login — reset rate limit
    await resetLoginRateLimit(clientIP);

    // Generate access token
    const accessToken = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role,
        tenantId: user.tenantId,
        name: user.name,
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    // Generate refresh token
    const refreshToken = await db.createRefreshToken({
      token: crypto.randomBytes(40).toString('hex'),
      userId: user.id,
      tenantId: user.tenantId,
      expiresAt: new Date(Date.now() + REFRESH_EXPIRES_IN_DAYS * 24 * 60 * 60 * 1000),
    });

    // Log successful login
    await db.createAuditLog({
      tenantId: user.tenantId,
      userId: user.id,
      action: 'LOGIN_SUCCESS',
      resource: 'auth',
      details: { email, role: user.role },
      ipAddress: clientIP,
      userAgent: req.headers['user-agent'],
    });

    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          tenantId: user.tenantId,
        },
        accessToken,
        refreshToken: refreshToken.token,
        expiresIn: JWT_EXPIRES_IN,
        refreshExpiresIn: `${REFRESH_EXPIRES_IN_DAYS}d`,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * POST /auth/register
 * Register new user
 */
router.post('/register', async (req, res) => {
  const { name, email, password, role, tenantId, officerId } = req.body;

  try {
    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Name, email, and password are required',
      });
    }

    // Check if email already exists
    const existingUser = await db.getUserByEmail(email);
    if (existingUser) {
      return res.status(409).json({
        success: false,
        error: 'Email already registered',
      });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Create user
    const newUser = await db.createUser({
      name,
      email,
      passwordHash,
      role: role || 'PUBLIC_USER',
      tenantId: tenantId || 'ws-semarang-01',
      officerId,
    });

    // Generate tokens
    const accessToken = jwt.sign(
      {
        id: newUser.id,
        email: newUser.email,
        role: newUser.role,
        tenantId: newUser.tenantId,
        name: newUser.name,
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    const refreshToken = await db.createRefreshToken({
      userId: newUser.id,
      tenantId: newUser.tenantId,
      expiresAt: new Date(Date.now() + REFRESH_EXPIRES_IN_DAYS * 24 * 60 * 60 * 1000),
    });

    // Log registration
    await db.createAuditLog({
      tenantId: newUser.tenantId,
      userId: newUser.id,
      action: 'REGISTER_SUCCESS',
      resource: 'auth',
      details: { email, role: newUser.role },
      ipAddress: req.ip,
    });

    res.status(201).json({
      success: true,
      data: {
        user: {
          id: newUser.id,
          email: newUser.email,
          name: newUser.name,
          role: newUser.role,
          tenantId: newUser.tenantId,
        },
        accessToken,
        refreshToken: refreshToken.token,
        expiresIn: JWT_EXPIRES_IN,
      },
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * GET /auth/me
 * Get current user profile (Protected)
 */
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const user = await db.getUserById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    // Return user without sensitive fields
    const { passwordHash, ...safeUser } = user;
    res.json({ success: true, data: safeUser });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * PUT /auth/profile
 * Update user profile (Protected)
 */
router.put('/profile', authenticateToken, async (req, res) => {
  const { name, email } = req.body;

  try {
    const updated = await db.updateUser(req.user.id, { name, email });
    if (!updated) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const { passwordHash, ...safeUser } = updated;
    res.json({ success: true, data: safeUser });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * POST /auth/refresh
 * Refresh access token
 */
router.post('/refresh', async (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return res.status(400).json({ success: false, error: 'Refresh token required' });
  }

  try {
    // Validate refresh token
    const tokenRecord = await db.getRefreshToken(refreshToken);
    if (!tokenRecord || tokenRecord.revoked) {
      await db.createAuditLog({
        tenantId: 'system',
        action: 'REFRESH_FAILED',
        resource: 'auth',
        details: { reason: 'Invalid or revoked refresh token' },
        ipAddress: req.ip,
      });

      return res.status(401).json({
        success: false,
        error: 'Invalid or expired refresh token',
      });
    }

    // Check expiry
    if (new Date(tokenRecord.expiresAt) <= new Date()) {
      return res.status(401).json({
        success: false,
        error: 'Refresh token expired',
      });
    }

    // Get user
    const user = await db.getUserById(tokenRecord.userId);
    if (!user || user.status !== 'ACTIVE') {
      return res.status(401).json({ success: false, error: 'User not found or inactive' });
    }

    // Generate new access token
    const accessToken = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role,
        tenantId: user.tenantId,
        name: user.name,
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    // Log token refresh
    await db.createAuditLog({
      tenantId: user.tenantId,
      userId: user.id,
      action: 'TOKEN_REFRESHED',
      resource: 'auth',
      ipAddress: req.ip,
    });

    res.json({ success: true, data: { accessToken, expiresIn: JWT_EXPIRES_IN } });
  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * POST /auth/logout
 * Invalidate refresh token
 */
router.post('/logout', authenticateToken, async (req, res) => {
  const { refreshToken } = req.body;

  try {
    if (refreshToken) {
      await db.revokeRefreshToken(refreshToken);
    }

    // Log logout
    await db.createAuditLog({
      tenantId: req.user.tenantId,
      userId: req.user.id,
      action: 'LOGOUT',
      resource: 'auth',
      ipAddress: req.ip,
    });

    res.json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

export default router;
