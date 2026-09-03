import { Request, Response, Router } from 'express';
import { query } from '../../database/db.js';
import { authMiddleware } from '../../common/middleware/authMiddleware.js';
import { siteContextMiddleware } from '../../common/middleware/siteContextMiddleware.js';
import { requirePermission } from '../../common/middleware/rbacMiddleware.js';
import { logAudit } from '../audit/audit.controller.js';

const router = Router();
router.use(authMiddleware);
router.use(siteContextMiddleware);

// GET /api/gates - List gates for current site
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const orgId = req.user!.organizationId;
    const siteId = req.siteId;

    if (!siteId) {
      res.status(400).json({ success: false, error: { code: 'NO_ACTIVE_SITE', message: 'No active site selected.' } });
      return;
    }

    const gatesRes = await query(`
      SELECT id, organization_id, site_id, name, code, gate_type, is_active, created_at
      FROM gates
      WHERE organization_id = $1 AND site_id = $2 AND deleted_at IS NULL
      ORDER BY name ASC
    `, [orgId, siteId]);

    res.json({ success: true, data: gatesRes.rows });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'GATES_FETCH_FAILED', message: 'Failed to retrieve gates.' } });
  }
});

// POST /api/gates - Create a new logical gate
router.post('/', requirePermission('site:manage'), async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, code, gate_type = 'MAIN' } = req.body;
    const orgId = req.user!.organizationId;
    const siteId = req.siteId;

    if (!siteId) {
      res.status(400).json({ success: false, error: { code: 'NO_ACTIVE_SITE', message: 'No active site selected.' } });
      return;
    }

    if (!name || !code) {
      res.status(400).json({ success: false, error: { code: 'INVALID_INPUT', message: 'Gate Name and Code are required.' } });
      return;
    }

    const cleanCode = code.trim().toUpperCase();
    const cleanName = name.trim();

    // Check duplicate code within site
    const dupRes = await query(`
      SELECT id FROM gates 
      WHERE site_id = $1 AND UPPER(code) = $2 AND deleted_at IS NULL
    `, [siteId, cleanCode]);

    if (dupRes.rows.length > 0) {
      res.status(409).json({ success: false, error: { code: 'DUPLICATE_GATE_CODE', message: `Gate code "${cleanCode}" already exists on this site.` } });
      return;
    }

    const insertRes = await query(`
      INSERT INTO gates (organization_id, site_id, name, code, gate_type, is_active)
      VALUES ($1, $2, $3, $4, $5, TRUE)
      RETURNING *
    `, [orgId, siteId, cleanName, cleanCode, gate_type]);

    const newGate = insertRes.rows[0];

    await logAudit({
      userId: req.user!.userId,
      organizationId: orgId,
      siteId,
      action: 'GATE_CREATED',
      entityType: 'Gate',
      entityId: String(newGate.id),
      req,
      newValues: newGate,
    });

    res.status(201).json({ success: true, message: 'Gate created successfully', data: newGate });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'GATE_CREATE_FAILED', message: 'Failed to create gate.' } });
  }
});

// PUT /api/gates/:id - Update gate
router.put('/:id', requirePermission('site:manage'), async (req: Request, res: Response): Promise<void> => {
  try {
    const gateId = String(req.params.id);
    const { name, code, gate_type, is_active } = req.body;
    const orgId = req.user!.organizationId;
    const siteId = req.siteId;

    const oldRes = await query(`
      SELECT * FROM gates WHERE id = $1 AND organization_id = $2 AND site_id = $3 AND deleted_at IS NULL
    `, [gateId, orgId, siteId]);

    if (oldRes.rows.length === 0) {
      res.status(404).json({ success: false, error: { code: 'GATE_NOT_FOUND', message: 'Gate not found on this site.' } });
      return;
    }

    await query(`
      UPDATE gates
      SET name = COALESCE($1, name),
          code = COALESCE($2, code),
          gate_type = COALESCE($3, gate_type),
          is_active = COALESCE($4, is_active),
          updated_at = NOW()
      WHERE id = $5 AND organization_id = $6 AND site_id = $7
    `, [name, code ? code.trim().toUpperCase() : null, gate_type, is_active, gateId, orgId, siteId]);

    await logAudit({
      userId: req.user!.userId,
      organizationId: orgId,
      siteId,
      action: 'GATE_UPDATED',
      entityType: 'Gate',
      entityId: gateId,
      req,
      newValues: { name, code, gate_type, is_active },
    });

    res.json({ success: true, message: 'Gate updated successfully.' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'GATE_UPDATE_FAILED', message: 'Failed to update gate.' } });
  }
});

// DELETE /api/gates/:id - Soft delete gate
router.delete('/:id', requirePermission('site:manage'), async (req: Request, res: Response): Promise<void> => {
  try {
    const gateId = String(req.params.id);
    const orgId = req.user!.organizationId;
    const siteId = req.siteId;

    const oldRes = await query(`
      SELECT * FROM gates WHERE id = $1 AND organization_id = $2 AND site_id = $3 AND deleted_at IS NULL
    `, [gateId, orgId, siteId]);

    if (oldRes.rows.length === 0) {
      res.status(404).json({ success: false, error: { code: 'GATE_NOT_FOUND', message: 'Gate not found on this site.' } });
      return;
    }

    await query(`
      UPDATE gates SET deleted_at = NOW(), is_active = FALSE WHERE id = $1 AND organization_id = $2 AND site_id = $3
    `, [gateId, orgId, siteId]);

    await logAudit({
      userId: req.user!.userId,
      organizationId: orgId,
      siteId,
      action: 'GATE_DELETED',
      entityType: 'Gate',
      entityId: gateId,
      req,
    });

    res.json({ success: true, message: 'Gate deleted successfully.' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'GATE_DELETE_FAILED', message: 'Failed to delete gate.' } });
  }
});

export const gateRouter = router;
