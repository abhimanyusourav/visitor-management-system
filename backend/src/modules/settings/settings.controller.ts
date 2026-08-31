import { Request, Response, Router } from 'express';
import { query } from '../../database/db.js';
import { authMiddleware } from '../../common/middleware/authMiddleware.js';
import { requirePermission } from '../../common/middleware/rbacMiddleware.js';
import { logAudit } from '../audit/audit.controller.js';

const router = Router();
router.use(authMiddleware);

// GET /api/settings - Fetch merged organization & site settings
router.get('/', async (req: Request, res: Response) => {
  try {
    const orgId = req.user!.organizationId;
    const siteId = req.siteId;

    const orgRes = await query(`SELECT settings FROM organizations WHERE id = $1`, [orgId]);
    let siteSettings = {};
    if (siteId) {
      const siteRes = await query(`SELECT settings FROM sites WHERE id = $1`, [siteId]);
      if (siteRes.rows.length > 0) {
        siteSettings = siteRes.rows[0].settings || {};
      }
    }

    const mergedSettings = {
      approvalRequiredForVendors: true,
      approvalRequiredForGuests: false,
      approvalRequiredForContractors: true,
      badgePrintFormat: 'STANDARD_A4', // or 'THERMAL_BADGE'
      dataRetentionDays: 90,
      safetyInstructions: 'Visitors must wear safety helmets, safety shoes, and display their visitor badge at all times while on the factory floor.',
      workingHoursStart: '08:00',
      workingHoursEnd: '18:00',
      ...(orgRes.rows[0]?.settings || {}),
      ...siteSettings,
    };

    res.json({ success: true, data: mergedSettings });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SETTINGS_FETCH_FAILED', message: err.message } });
  }
});

// PUT /api/settings - Update settings
router.put('/', requirePermission('settings:manage'), async (req: Request, res: Response): Promise<void> => {
  try {
    const settings = req.body;
    const orgId = req.user!.organizationId;
    const siteId = req.siteId;

    if (siteId) {
      await query(`
        UPDATE sites
        SET settings = $1, updated_at = NOW()
        WHERE id = $2 AND organization_id = $3
      `, [JSON.stringify(settings), siteId, orgId]);
    } else {
      await query(`
        UPDATE organizations
        SET settings = $1, updated_at = NOW()
        WHERE id = $2
      `, [JSON.stringify(settings), orgId]);
    }

    await logAudit({
      userId: req.user!.userId,
      organizationId: orgId,
      siteId,
      action: 'SETTINGS_UPDATED',
      entityType: 'Settings',
      entityId: siteId || orgId,
      req,
      newValues: settings,
    });

    res.json({ success: true, message: 'Settings saved successfully.' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SETTINGS_UPDATE_FAILED', message: err.message } });
  }
});

export const settingsRouter = router;
