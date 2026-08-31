import { Request, Response, Router } from 'express';
import { query } from '../../database/db.js';
import { authMiddleware } from '../../common/middleware/authMiddleware.js';
import { requirePermission } from '../../common/middleware/rbacMiddleware.js';
import { logAudit } from '../audit/audit.controller.js';

const router = Router();
router.use(authMiddleware);

// GET /api/organizations/current
router.get('/current', async (req: Request, res: Response): Promise<void> => {
  try {
    const orgRes = await query(`
      SELECT id, name, code, slug, logo_url, is_active, settings, created_at
      FROM organizations
      WHERE id = $1
    `, [req.user!.organizationId]);

    if (orgRes.rows.length === 0) {
      res.status(404).json({ success: false, error: { code: 'ORG_NOT_FOUND', message: 'Organization not found' } });
      return;
    }

    res.json({ success: true, data: orgRes.rows[0] });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'ORG_FETCH_FAILED', message: err.message } });
  }
});

// PUT /api/organizations/current
router.put('/current', requirePermission('org:manage'), async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, logo_url, settings } = req.body;
    const orgId = req.user!.organizationId;

    const oldRes = await query(`SELECT name, logo_url, settings FROM organizations WHERE id = $1`, [orgId]);

    await query(`
      UPDATE organizations
      SET name = COALESCE($1, name),
          logo_url = COALESCE($2, logo_url),
          settings = COALESCE($3, settings),
          updated_at = NOW()
      WHERE id = $4
    `, [name, logo_url, settings ? JSON.stringify(settings) : null, orgId]);

    await logAudit({
      userId: req.user!.userId,
      organizationId: orgId,
      action: 'ORGANIZATION_UPDATED',
      entityType: 'Organization',
      entityId: orgId,
      req,
      oldValues: oldRes.rows[0],
      newValues: { name, logo_url, settings },
    });

    res.json({ success: true, message: 'Organization settings updated successfully.' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'ORG_UPDATE_FAILED', message: err.message } });
  }
});

export const organizationRouter = router;
