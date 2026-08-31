import { Request, Response, Router } from 'express';
import { query } from '../../database/db.js';
import { authMiddleware } from '../../common/middleware/authMiddleware.js';
import { requirePermission } from '../../common/middleware/rbacMiddleware.js';
import { logAudit } from '../audit/audit.controller.js';

const router = Router();
router.use(authMiddleware);

// GET /api/sites
router.get('/', async (req: Request, res: Response) => {
  try {
    const orgId = req.user!.organizationId;
    let sitesRes;

    if (req.user!.role === 'SUPER_ADMIN' || req.user!.role === 'ADMIN') {
      sitesRes = await query(`
        SELECT id, organization_id, name, code, address, city, state, country, postal_code, timezone, phone, email, is_active, settings, created_at
        FROM sites
        WHERE organization_id = $1 AND deleted_at IS NULL
        ORDER BY name ASC
      `, [orgId]);
    } else {
      sitesRes = await query(`
        SELECT s.id, s.organization_id, s.name, s.code, s.address, s.city, s.state, s.country, s.postal_code, s.timezone, s.phone, s.email, s.is_active, s.settings, s.created_at
        FROM user_sites us
        JOIN sites s ON us.site_id = s.id
        WHERE us.user_id = $1 AND s.deleted_at IS NULL
        ORDER BY us.is_primary DESC, s.name ASC
      `, [req.user!.userId]);
    }

    res.json({ success: true, data: sitesRes.rows });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SITES_FETCH_FAILED', message: err.message } });
  }
});

// POST /api/sites
router.post('/', requirePermission('site:manage'), async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, code, address, city, state, postal_code, timezone, phone, email } = req.body;
    const orgId = req.user!.organizationId;

    if (!name || !code || !address || !city) {
      res.status(400).json({ success: false, error: { code: 'INVALID_INPUT', message: 'Name, code, address, and city are required.' } });
      return;
    }

    const insertRes = await query(`
      INSERT INTO sites (organization_id, name, code, address, city, state, postal_code, timezone, phone, email)
      VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8, 'Asia/Kolkata'), $9, $10)
      RETURNING *
    `, [orgId, name, code.toUpperCase(), address, city, state || '', postal_code || '', timezone, phone || null, email || null]);

    const newSite = insertRes.rows[0];

    await logAudit({
      userId: req.user!.userId,
      organizationId: orgId,
      siteId: String(newSite.id),
      action: 'SITE_CREATED',
      entityType: 'Site',
      entityId: String(newSite.id),
      req,
      newValues: newSite,
    });

    res.status(201).json({ success: true, message: 'Site created successfully', data: newSite });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SITE_CREATE_FAILED', message: err.message } });
  }
});

// GET /api/sites/:id
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const siteId = String(req.params.id);
    if (!req.user!.allowedSiteIds.includes(siteId) && req.user!.role !== 'SUPER_ADMIN') {
      res.status(403).json({ success: false, error: { code: 'UNAUTHORIZED_SITE', message: 'Not authorized for this site.' } });
      return;
    }

    const siteRes = await query(`
      SELECT * FROM sites WHERE id = $1 AND deleted_at IS NULL
    `, [siteId]);

    if (siteRes.rows.length === 0) {
      res.status(404).json({ success: false, error: { code: 'SITE_NOT_FOUND', message: 'Site not found.' } });
      return;
    }

    res.json({ success: true, data: siteRes.rows[0] });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SITE_FETCH_FAILED', message: err.message } });
  }
});

// PUT /api/sites/:id
router.put('/:id', requirePermission('site:manage'), async (req: Request, res: Response): Promise<void> => {
  try {
    const siteId = String(req.params.id);
    const { name, address, city, state, postal_code, timezone, phone, email, settings } = req.body;

    const oldRes = await query(`SELECT * FROM sites WHERE id = $1 AND organization_id = $2`, [siteId, req.user!.organizationId]);
    if (oldRes.rows.length === 0) {
      res.status(404).json({ success: false, error: { code: 'SITE_NOT_FOUND', message: 'Site not found.' } });
      return;
    }

    await query(`
      UPDATE sites
      SET name = COALESCE($1, name),
          address = COALESCE($2, address),
          city = COALESCE($3, city),
          state = COALESCE($4, state),
          postal_code = COALESCE($5, postal_code),
          timezone = COALESCE($6, timezone),
          phone = COALESCE($7, phone),
          email = COALESCE($8, email),
          settings = COALESCE($9, settings),
          updated_at = NOW()
      WHERE id = $10 AND organization_id = $11
    `, [name, address, city, state, postal_code, timezone, phone, email, settings ? JSON.stringify(settings) : null, siteId, req.user!.organizationId]);

    await logAudit({
      userId: req.user!.userId,
      organizationId: req.user!.organizationId,
      siteId,
      action: 'SITE_UPDATED',
      entityType: 'Site',
      entityId: siteId,
      req,
      oldValues: oldRes.rows[0],
      newValues: req.body,
    });

    res.json({ success: true, message: 'Site updated successfully.' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SITE_UPDATE_FAILED', message: err.message } });
  }
});

export const siteRouter = router;
