import { Request, Response, NextFunction } from 'express';

export function siteContextMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    next();
    return;
  }

  // Client requests site context via X-Site-Id header
  const requestedSiteId = (req.headers['x-site-id'] as string) || (req.query.site_id as string);

  if (requestedSiteId) {
    // Validate that the user is authorized for this site
    if (!req.user.allowedSiteIds.includes(requestedSiteId) && req.user.role !== 'SUPER_ADMIN') {
      res.status(403).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED_SITE_ACCESS',
          message: 'You are not authorized to access or operate on this factory site.',
        }
      });
      return;
    }
    req.siteId = requestedSiteId;
    req.user.activeSiteId = requestedSiteId;
  } else if (req.user.allowedSiteIds.length > 0) {
    // Default to the user's primary/first site
    req.siteId = req.user.allowedSiteIds[0];
    req.user.activeSiteId = req.user.allowedSiteIds[0];
  }

  next();
}
