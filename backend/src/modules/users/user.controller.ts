import { Request, Response, Router } from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../../database/db.js';
import { config } from '../../config/env.js';
import { authMiddleware } from '../../common/middleware/authMiddleware.js';
import { requirePermission } from '../../common/middleware/rbacMiddleware.js';
import { logAudit } from '../audit/audit.controller.js';

const router = Router();
router.use(authMiddleware);

// GET /api/users/roles - List available roles
router.get('/roles', async (req: Request, res: Response) => {
  try {
    const rolesRes = await query(`SELECT id, name, slug, description FROM roles ORDER BY id ASC`);
    res.json({ success: true, data: rolesRes.rows });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'ROLES_FETCH_FAILED', message: err.message } });
  }
});

// GET /api/users - List system users
router.get('/', requirePermission('user:manage'), async (req: Request, res: Response) => {
  try {
    const orgId = req.user!.organizationId;

    const usersRes = await query(`
      SELECT 
        u.id, u.organization_id, u.role_id, u.email, u.first_name, u.last_name,
        u.phone, u.is_active, u.last_login_at, u.created_at,
        r.name as role_name, r.slug as role_slug
      FROM users u
      JOIN roles r ON u.role_id = r.id
      WHERE u.organization_id = $1 AND u.deleted_at IS NULL
      ORDER BY u.created_at DESC
    `, [orgId]);

    // Attach assigned sites for each user
    const usersWithSites = await Promise.all(usersRes.rows.map(async (u: any) => {
      const sitesRes = await query(`
        SELECT s.id, s.name, s.code, us.is_primary
        FROM user_sites us
        JOIN sites s ON us.site_id = s.id
        WHERE us.user_id = $1
      `, [u.id]);
      return {
        ...u,
        assignedSites: sitesRes.rows,
      };
    }));

    res.json({ success: true, data: usersWithSites });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'USERS_FETCH_FAILED', message: err.message } });
  }
});

// POST /api/users - Create User
router.post('/', requirePermission('user:manage'), async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password, first_name, last_name, phone, role_id, site_ids } = req.body;
    const orgId = req.user!.organizationId;

    if (!email || !password || !first_name || !last_name || !role_id) {
      res.status(400).json({ success: false, error: { code: 'INVALID_INPUT', message: 'All required user fields must be provided.' } });
      return;
    }

    // Check duplicate email
    const existing = await query(`SELECT id FROM users WHERE LOWER(email) = LOWER($1)`, [email.trim()]);
    if (existing.rows.length > 0) {
      res.status(400).json({ success: false, error: { code: 'EMAIL_EXISTS', message: 'A user with this email address already exists.' } });
      return;
    }

    const passwordHash = await bcrypt.hash(password, config.jwt.bcryptSaltRounds);

    const userRes = await query(`
      INSERT INTO users (organization_id, role_id, email, password_hash, first_name, last_name, phone)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, organization_id, role_id, email, first_name, last_name, phone, is_active, created_at
    `, [orgId, role_id, email.trim().toLowerCase(), passwordHash, first_name.trim(), last_name.trim(), phone || null]);

    const newUser = userRes.rows[0];

    // Assign sites
    if (Array.isArray(site_ids)) {
      for (let i = 0; i < site_ids.length; i++) {
        await query(`
          INSERT INTO user_sites (user_id, site_id, is_primary)
          VALUES ($1, $2, $3)
          ON CONFLICT DO NOTHING
        `, [newUser.id, site_ids[i], i === 0]);
      }
    }

    await logAudit({
      userId: req.user!.userId,
      organizationId: orgId,
      siteId: req.siteId,
      action: 'USER_CREATED',
      entityType: 'User',
      entityId: String(newUser.id),
      req,
      newValues: { email: newUser.email, role_id, first_name, last_name },
    });

    res.status(201).json({ success: true, message: 'User created successfully', data: newUser });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'USER_CREATE_FAILED', message: err.message } });
  }
});

// PUT /api/users/:id - Update User
router.put('/:id', requirePermission('user:manage'), async (req: Request, res: Response): Promise<void> => {
  try {
    const targetUserId = String(req.params.id);
    const { first_name, last_name, phone, role_id, site_ids, is_active } = req.body;
    const orgId = req.user!.organizationId;

    const oldRes = await query(`SELECT * FROM users WHERE id = $1 AND organization_id = $2`, [targetUserId, orgId]);
    if (oldRes.rows.length === 0) {
      res.status(404).json({ success: false, error: { code: 'USER_NOT_FOUND', message: 'User not found.' } });
      return;
    }

    await query(`
      UPDATE users
      SET first_name = COALESCE($1, first_name),
          last_name = COALESCE($2, last_name),
          phone = COALESCE($3, phone),
          role_id = COALESCE($4, role_id),
          is_active = COALESCE($5, is_active),
          updated_at = NOW()
      WHERE id = $6 AND organization_id = $7
    `, [first_name, last_name, phone, role_id, is_active, targetUserId, orgId]);

    // Update sites if passed
    if (Array.isArray(site_ids)) {
      await query(`DELETE FROM user_sites WHERE user_id = $1`, [targetUserId]);
      for (let i = 0; i < site_ids.length; i++) {
        await query(`
          INSERT INTO user_sites (user_id, site_id, is_primary)
          VALUES ($1, $2, $3)
        `, [targetUserId, site_ids[i], i === 0]);
      }
    }

    await logAudit({
      userId: req.user!.userId,
      organizationId: orgId,
      siteId: req.siteId,
      action: 'USER_UPDATED',
      entityType: 'User',
      entityId: targetUserId,
      req,
      oldValues: oldRes.rows[0],
      newValues: req.body,
    });

    res.json({ success: true, message: 'User updated successfully.' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'USER_UPDATE_FAILED', message: err.message } });
  }
});

// POST /api/users/:id/reset-password - Admin Password Reset
router.post('/:id/reset-password', requirePermission('user:manage'), async (req: Request, res: Response): Promise<void> => {
  try {
    const targetUserId = String(req.params.id);
    const { new_password } = req.body;
    const orgId = req.user!.organizationId;

    if (!new_password || new_password.length < 8) {
      res.status(400).json({ success: false, error: { code: 'WEAK_PASSWORD', message: 'Password must be at least 8 characters long' } });
      return;
    }

    const newHash = await bcrypt.hash(new_password, config.jwt.bcryptSaltRounds);
    await query(`
      UPDATE users 
      SET password_hash = $1, failed_login_attempts = 0, locked_until = NULL, updated_at = NOW()
      WHERE id = $2 AND organization_id = $3
    `, [newHash, targetUserId, orgId]);

    await logAudit({
      userId: req.user!.userId,
      organizationId: orgId,
      siteId: req.siteId,
      action: 'USER_PASSWORD_RESET_BY_ADMIN',
      entityType: 'User',
      entityId: targetUserId,
      req,
    });

    res.json({ success: true, message: 'User password has been reset successfully.' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'PASSWORD_RESET_FAILED', message: err.message } });
  }
});

export const userRouter = router;
