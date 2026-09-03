import { Request, Response, Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query } from '../../database/db.js';
import { config } from '../../config/env.js';
import { authMiddleware } from '../../common/middleware/authMiddleware.js';
import { authRateLimiter } from '../../common/middleware/rateLimiter.js';
import { logAudit } from '../audit/audit.controller.js';

const router = Router();

// POST /api/auth/login
router.post('/login', authRateLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_CREDENTIALS', message: 'Email and password are required.' }
      });
      return;
    }

    // Query user by email
    const userRes = await query(`
      SELECT 
        u.id, u.organization_id, u.role_id, u.email, u.password_hash,
        u.first_name, u.last_name, u.phone, u.is_active, u.failed_login_attempts,
        u.locked_until, r.slug as role_slug, r.name as role_name,
        o.name as organization_name, o.code as organization_code
      FROM users u
      JOIN roles r ON u.role_id = r.id
      JOIN organizations o ON u.organization_id = o.id
      WHERE LOWER(u.email) = LOWER($1) AND u.deleted_at IS NULL
    `, [email.trim()]);

    if (userRes.rows.length === 0) {
      await logAudit({
        action: 'LOGIN_FAILED',
        entityType: 'User',
        entityId: 'UNKNOWN',
        req,
        metadata: { attemptedEmail: email.trim(), reason: 'USER_NOT_FOUND' }
      });
      res.status(401).json({
        success: false,
        error: { code: 'AUTH_FAILED', message: 'Invalid email or password.' }
      });
      return;
    }

    const user = userRes.rows[0];

    // Check if account is locked
    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      res.status(403).json({
        success: false,
        error: {
          code: 'ACCOUNT_LOCKED',
          message: 'Account is temporarily locked due to consecutive failed logins. Please try again later.'
        }
      });
      return;
    }

    if (!user.is_active) {
      res.status(403).json({
        success: false,
        error: { code: 'ACCOUNT_DISABLED', message: 'Your account has been deactivated. Please contact an administrator.' }
      });
      return;
    }

    // Verify password
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      const newFailed = (user.failed_login_attempts || 0) + 1;
      let lockUntil: string | null = null;
      if (newFailed >= 5) {
        // Lock for 15 minutes
        lockUntil = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      }

      await query(`
        UPDATE users 
        SET failed_login_attempts = $1, locked_until = $2
        WHERE id = $3
      `, [newFailed, lockUntil, user.id]);

      await logAudit({
        userId: user.id,
        organizationId: user.organization_id,
        action: 'LOGIN_FAILED',
        entityType: 'User',
        entityId: user.id,
        req,
        metadata: { attemptedEmail: email.trim(), reason: 'PASSWORD_MISMATCH', failedCount: newFailed }
      });

      res.status(401).json({
        success: false,
        error: { code: 'AUTH_FAILED', message: 'Invalid email or password.' }
      });
      return;
    }

    // Reset failed login attempts & update last login
    await query(`
      UPDATE users 
      SET failed_login_attempts = 0, locked_until = NULL, last_login_at = NOW()
      WHERE id = $1
    `, [user.id]);

    // Fetch user permissions
    const permRes = await query(`
      SELECT p.code 
      FROM permissions p
      JOIN role_permissions rp ON p.id = rp.permission_id
      WHERE rp.role_id = $1
    `, [user.role_id]);
    const permissions = permRes.rows.map((p: any) => p.code);

    // Fetch user authorized sites
    let authorizedSites: any[] = [];
    if (user.role_slug === 'SUPER_ADMIN' || user.role_slug === 'ADMIN') {
      const allSitesRes = await query(`
        SELECT id, name, code, city, timezone 
        FROM sites 
        WHERE organization_id = $1 AND deleted_at IS NULL
        ORDER BY name ASC
      `, [user.organization_id]);
      authorizedSites = allSitesRes.rows;
    } else {
      const userSitesRes = await query(`
        SELECT s.id, s.name, s.code, s.city, s.timezone, us.is_primary
        FROM user_sites us
        JOIN sites s ON us.site_id = s.id
        WHERE us.user_id = $1 AND s.deleted_at IS NULL
        ORDER BY us.is_primary DESC, s.name ASC
      `, [user.id]);
      authorizedSites = userSitesRes.rows;
    }

    const defaultSite = authorizedSites[0] || null;

    // Generate JWT Token
    const payload = {
      userId: user.id,
      organizationId: user.organization_id,
      role: user.role_slug,
    };

    const token = jwt.sign(payload, config.jwt.secret, {
      expiresIn: config.jwt.expiresIn as any,
    });

    // Calculate cookie maxAge consistent with JWT expiry (e.g. 2h -> 7,200,000 ms)
    const expiryMs = (() => {
      const expStr = String(config.jwt.expiresIn).toLowerCase().trim();
      if (expStr.endsWith('h')) return parseInt(expStr, 10) * 3600 * 1000;
      if (expStr.endsWith('d')) return parseInt(expStr, 10) * 86400 * 1000;
      if (expStr.endsWith('m')) return parseInt(expStr, 10) * 60 * 1000;
      return 2 * 3600 * 1000;
    })();

    // Set secure HttpOnly cookie aligned with JWT expiration
    res.cookie('access_token', token, {
      httpOnly: true,
      secure: config.env === 'production',
      sameSite: 'lax',
      maxAge: expiryMs,
    });

    await logAudit({
      userId: user.id,
      organizationId: user.organization_id,
      siteId: defaultSite?.id,
      action: 'USER_LOGIN',
      entityType: 'User',
      entityId: user.id,
      req,
    });

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        token,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name,
          phone: user.phone,
          role: user.role_slug,
          roleName: user.role_name,
          organizationId: user.organization_id,
          organizationName: user.organization_name,
          organizationCode: user.organization_code,
          permissions,
          authorizedSites,
          activeSite: defaultSite,
        }
      }
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'LOGIN_FAILED', message: err.message } });
  }
});

// POST /api/auth/logout
router.post('/logout', authMiddleware, async (req: Request, res: Response) => {
  res.clearCookie('access_token');
  if (req.user) {
    await logAudit({
      userId: req.user.userId,
      organizationId: req.user.organizationId,
      siteId: req.siteId,
      action: 'USER_LOGOUT',
      entityType: 'User',
      entityId: req.user.userId,
      req,
    });
  }
  res.json({ success: true, message: 'Logged out successfully.' });
});

// GET /api/auth/me
router.get('/me', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userRes = await query(`
      SELECT 
        u.id, u.organization_id, u.email, u.first_name, u.last_name, u.phone,
        r.slug as role_slug, r.name as role_name,
        o.name as organization_name, o.code as organization_code
      FROM users u
      JOIN roles r ON u.role_id = r.id
      JOIN organizations o ON u.organization_id = o.id
      WHERE u.id = $1
    `, [req.user!.userId]);

    if (userRes.rows.length === 0) {
      res.status(404).json({ success: false, error: { code: 'USER_NOT_FOUND', message: 'User not found' } });
      return;
    }

    const user = userRes.rows[0];

    // Sites
    let authorizedSites: any[] = [];
    if (user.role_slug === 'SUPER_ADMIN' || user.role_slug === 'ADMIN') {
      const allSitesRes = await query(`
        SELECT id, name, code, city, timezone 
        FROM sites 
        WHERE organization_id = $1 AND deleted_at IS NULL
        ORDER BY name ASC
      `, [user.organization_id]);
      authorizedSites = allSitesRes.rows;
    } else {
      const userSitesRes = await query(`
        SELECT s.id, s.name, s.code, s.city, s.timezone, us.is_primary
        FROM user_sites us
        JOIN sites s ON us.site_id = s.id
        WHERE us.user_id = $1 AND s.deleted_at IS NULL
        ORDER BY us.is_primary DESC, s.name ASC
      `, [user.id]);
      authorizedSites = userSitesRes.rows;
    }

    const activeSite = authorizedSites.find(s => s.id === req.siteId) || authorizedSites[0] || null;

    res.json({
      success: true,
      data: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        phone: user.phone,
        role: user.role_slug,
        roleName: user.role_name,
        organizationId: user.organization_id,
        organizationName: user.organization_name,
        organizationCode: user.organization_code,
        permissions: req.user!.permissions,
        authorizedSites,
        activeSite,
      }
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'ME_FETCH_FAILED', message: err.message } });
  }
});

// POST /api/auth/change-password
router.post('/change-password', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      res.status(400).json({ success: false, error: { code: 'INVALID_INPUT', message: 'Current and new password are required' } });
      return;
    }

    if (newPassword.length < 8) {
      res.status(400).json({ success: false, error: { code: 'WEAK_PASSWORD', message: 'Password must be at least 8 characters long' } });
      return;
    }

    const userRes = await query(`SELECT password_hash FROM users WHERE id = $1`, [req.user!.userId]);
    const isMatch = await bcrypt.compare(currentPassword, userRes.rows[0].password_hash);
    if (!isMatch) {
      res.status(400).json({ success: false, error: { code: 'PASSWORD_MISMATCH', message: 'Current password is incorrect' } });
      return;
    }

    const newHash = await bcrypt.hash(newPassword, config.jwt.bcryptSaltRounds);
    await query(`UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2`, [newHash, req.user!.userId]);

    await logAudit({
      userId: req.user!.userId,
      organizationId: req.user!.organizationId,
      siteId: req.siteId,
      action: 'PASSWORD_CHANGED',
      entityType: 'User',
      entityId: req.user!.userId,
      req,
    });

    res.json({ success: true, message: 'Password updated successfully' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'PASSWORD_CHANGE_FAILED', message: err.message } });
  }
});

export const authRouter = router;
