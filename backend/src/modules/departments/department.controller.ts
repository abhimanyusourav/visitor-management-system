import { Request, Response, Router } from 'express';
import { query } from '../../database/db.js';
import { authMiddleware } from '../../common/middleware/authMiddleware.js';
import { requireRole } from '../../common/middleware/rbacMiddleware.js';
import { logAudit } from '../audit/audit.controller.js';

const router = Router();
router.use(authMiddleware);

// GET /api/departments - View all plant departments (read-only access for all authenticated users)
router.get('/', async (req: Request, res: Response) => {
  try {
    const orgId = req.user!.organizationId;
    const deptsRes = await query(`
      SELECT id, name, code, description, is_active, site_id, created_at
      FROM departments
      WHERE organization_id = $1 AND deleted_at IS NULL
      ORDER BY name ASC
    `, [orgId]);

    res.json({ success: true, data: deptsRes.rows });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'DEPTS_FETCH_FAILED', message: err.message } });
  }
});

// POST /api/departments - Only Super Admin can create departments
router.post('/', requireRole(['SUPER_ADMIN']), async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, code, description, siteId } = req.body;
    const orgId = req.user!.organizationId;

    if (!name || !code) {
      res.status(400).json({ success: false, error: { code: 'INVALID_INPUT', message: 'Department Name and Code are required.' } });
      return;
    }

    const cleanCode = code.trim().toUpperCase();
    const cleanName = name.trim();

    // Check duplicate department code
    const dupCodeRes = await query(`
      SELECT id, name FROM departments
      WHERE organization_id = $1 AND UPPER(code) = $2 AND deleted_at IS NULL
    `, [orgId, cleanCode]);

    if (dupCodeRes.rows.length > 0) {
      res.status(409).json({
        success: false,
        error: {
          code: 'DUPLICATE_DEPT_CODE',
          message: `Department code "${cleanCode}" is already used by department "${dupCodeRes.rows[0].name}". Please use a unique department code.`
        }
      });
      return;
    }

    const insertRes = await query(`
      INSERT INTO departments (organization_id, site_id, name, code, description)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [orgId, siteId || null, cleanName, cleanCode, description?.trim() || cleanName]);

    const newDept = insertRes.rows[0];

    await logAudit({
      userId: req.user!.userId,
      organizationId: orgId,
      siteId: req.siteId,
      action: 'DEPARTMENT_CREATED',
      entityType: 'Department',
      entityId: String(newDept.id),
      req,
      newValues: newDept,
    });

    res.status(201).json({ success: true, message: 'Department created successfully', data: newDept });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'DEPT_CREATE_FAILED', message: err.message } });
  }
});

// PUT /api/departments/:id - Only Super Admin can update departments
router.put('/:id', requireRole(['SUPER_ADMIN']), async (req: Request, res: Response): Promise<void> => {
  try {
    const deptId = String(req.params.id);
    const { name, code, description, is_active } = req.body;
    const orgId = req.user!.organizationId;

    const oldRes = await query(`SELECT * FROM departments WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`, [deptId, orgId]);
    if (oldRes.rows.length === 0) {
      res.status(404).json({ success: false, error: { code: 'DEPT_NOT_FOUND', message: 'Department not found.' } });
      return;
    }

    await query(`
      UPDATE departments
      SET name = COALESCE($1, name),
          code = COALESCE($2, code),
          description = COALESCE($3, description),
          is_active = COALESCE($4, is_active),
          updated_at = NOW()
      WHERE id = $5 AND organization_id = $6
    `, [name?.trim(), code?.trim().toUpperCase(), description?.trim(), is_active, deptId, orgId]);

    await logAudit({
      userId: req.user!.userId,
      organizationId: orgId,
      siteId: req.siteId,
      action: 'DEPARTMENT_UPDATED',
      entityType: 'Department',
      entityId: deptId,
      req,
      oldValues: oldRes.rows[0],
      newValues: req.body,
    });

    res.json({ success: true, message: 'Department updated successfully.' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'DEPT_UPDATE_FAILED', message: err.message } });
  }
});

// DELETE /api/departments/:id - Only Super Admin can delete departments
router.delete('/:id', requireRole(['SUPER_ADMIN']), async (req: Request, res: Response): Promise<void> => {
  try {
    const deptId = String(req.params.id);
    const orgId = req.user!.organizationId;

    const oldRes = await query(`SELECT * FROM departments WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`, [deptId, orgId]);
    if (oldRes.rows.length === 0) {
      res.status(404).json({ success: false, error: { code: 'DEPT_NOT_FOUND', message: 'Department not found or already deleted.' } });
      return;
    }

    // Soft delete department
    await query(`
      UPDATE departments
      SET deleted_at = NOW(),
          is_active = FALSE,
          updated_at = NOW()
      WHERE id = $1 AND organization_id = $2
    `, [deptId, orgId]);

    await logAudit({
      userId: req.user!.userId,
      organizationId: orgId,
      siteId: req.siteId,
      action: 'DEPARTMENT_DELETED',
      entityType: 'Department',
      entityId: deptId,
      req,
      oldValues: oldRes.rows[0],
    });

    res.json({ success: true, message: 'Department deleted successfully.' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'DEPT_DELETE_FAILED', message: err.message } });
  }
});

export const departmentRouter = router;

