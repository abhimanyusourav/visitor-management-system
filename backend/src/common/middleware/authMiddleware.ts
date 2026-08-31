import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../../config/env.js';
import { query } from '../../database/db.js';
import { UserContext, RoleSlug } from '../types/index.js';

declare global {
  namespace Express {
    interface Request {
      user?: UserContext;
      siteId?: string;
    }
  }
}

export async function authMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    let token: string | undefined;

    // Check Authorization header
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    } else if (req.cookies && req.cookies.access_token) {
      token = req.cookies.access_token;
    }

    if (!token) {
      res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required. No token provided.',
        }
      });
      return;
    }

    // Verify JWT
    const decoded = jwt.verify(token, config.jwt.secret) as any;

    // Load active user permissions & sites
    const userRes = await query(`
      SELECT 
        u.id, u.organization_id, u.email, u.first_name, u.last_name, u.is_active,
        r.slug as role_slug
      FROM users u
      JOIN roles r ON u.role_id = r.id
      WHERE u.id = $1 AND u.deleted_at IS NULL
    `, [decoded.userId]);

    if (userRes.rows.length === 0 || !userRes.rows[0].is_active) {
      res.status(401).json({
        success: false,
        error: {
          code: 'USER_INACTIVE_OR_NOT_FOUND',
          message: 'User account is deactivated or not found.',
        }
      });
      return;
    }

    const user = userRes.rows[0];

    // Load permissions for role
    const permRes = await query(`
      SELECT p.code 
      FROM permissions p
      JOIN role_permissions rp ON p.id = rp.permission_id
      JOIN users u ON u.role_id = rp.role_id
      WHERE u.id = $1
    `, [user.id]);

    const permissions = permRes.rows.map((p: any) => p.code);

    // Load authorized site IDs
    let allowedSiteIds: string[] = [];
    if (user.role_slug === 'SUPER_ADMIN' || user.role_slug === 'ADMIN') {
      // Super Admin and Org Admin have access to all sites within their organization
      const allSitesRes = await query(`
        SELECT id FROM sites WHERE organization_id = $1 AND deleted_at IS NULL
      `, [user.organization_id]);
      allowedSiteIds = allSitesRes.rows.map((s: any) => s.id);
    } else {
      const userSitesRes = await query(`
        SELECT site_id FROM user_sites WHERE user_id = $1
      `, [user.id]);
      allowedSiteIds = userSitesRes.rows.map((s: any) => s.site_id);
    }

    req.user = {
      userId: user.id,
      organizationId: user.organization_id,
      role: user.role_slug as RoleSlug,
      permissions,
      allowedSiteIds,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
    };

    next();
  } catch (err: any) {
    res.status(401).json({
      success: false,
      error: {
        code: 'INVALID_TOKEN',
        message: 'Authentication token is invalid or has expired.',
      }
    });
  }
}
