import { Request, Response, NextFunction } from 'express';
import { RoleSlug } from '../types/index.js';

export function requirePermission(permissionCode: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' }
      });
      return;
    }

    if (req.user.role === 'SUPER_ADMIN') {
      return next();
    }

    if (!req.user.permissions.includes(permissionCode)) {
      res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: `You lack the required permission (${permissionCode}) to perform this action.`,
        }
      });
      return;
    }

    next();
  };
}

export function requireRole(roles: RoleSlug[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' }
      });
      return;
    }

    if (req.user.role === 'SUPER_ADMIN' || roles.includes(req.user.role)) {
      return next();
    }

    res.status(403).json({
      success: false,
      error: {
        code: 'FORBIDDEN_ROLE',
        message: 'Your role is not authorized to access this resource.',
      }
    });
  };
}
