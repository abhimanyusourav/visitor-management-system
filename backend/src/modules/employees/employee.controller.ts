import { Request, Response, Router } from 'express';
import { query } from '../../database/db.js';
import { authMiddleware } from '../../common/middleware/authMiddleware.js';
import { requireRole } from '../../common/middleware/rbacMiddleware.js';
import { logAudit } from '../audit/audit.controller.js';

const router = Router();
router.use(authMiddleware);

// GET /api/employees - Available for authenticated users to view hosts/directory
router.get('/', async (req: Request, res: Response) => {
  try {
    const { departmentId, search, activeOnly = 'true' } = req.query;
    const orgId = req.user!.organizationId;

    const conditions: string[] = ['e.organization_id = $1', 'e.deleted_at IS NULL'];
    const params: any[] = [orgId];

    if (activeOnly === 'true') {
      conditions.push('e.is_active = TRUE');
    }

    if (departmentId) {
      params.push(departmentId);
      conditions.push(`e.department_id = $${params.length}`);
    }

    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(e.first_name ILIKE $${params.length} OR e.last_name ILIKE $${params.length} OR e.email ILIKE $${params.length} OR e.employee_code ILIKE $${params.length})`);
    }

    const empRes = await query(`
      SELECT 
        e.id, e.organization_id, e.user_id, e.department_id, e.employee_code,
        e.first_name, e.last_name, e.email, e.phone, e.designation, e.photo_url, e.is_active,
        d.name as department_name, d.code as department_code
      FROM employees e
      JOIN departments d ON e.department_id = d.id
      WHERE ${conditions.join(' AND ')}
      ORDER BY e.first_name ASC, e.last_name ASC
    `, params);

    res.json({ success: true, data: empRes.rows });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'EMPLOYEES_FETCH_FAILED', message: err.message } });
  }
});

// POST /api/employees - Only Super Admin can add employees
router.post('/', requireRole(['SUPER_ADMIN']), async (req: Request, res: Response): Promise<void> => {
  try {
    const { employee_code, first_name, last_name, email, phone, designation, department_id, site_ids } = req.body;
    const orgId = req.user!.organizationId;

    if (!employee_code || !first_name || !designation || !department_id) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_INPUT', message: 'Employee Code, First Name, Designation, and Department are required.' }
      });
      return;
    }

    const cleanCode = employee_code.trim().toUpperCase();
    const cleanFirstName = first_name.trim();
    const cleanLastName = last_name && typeof last_name === 'string' && last_name.trim() ? last_name.trim() : null;
    const cleanEmail = email && typeof email === 'string' && email.trim() ? email.trim().toLowerCase() : null;
    const cleanPhone = phone && typeof phone === 'string' && phone.trim() ? phone.trim() : null;

    // 1. Check duplicate Employee Code
    const dupCodeRes = await query(`
      SELECT id, first_name, last_name, employee_code
      FROM employees
      WHERE organization_id = $1 AND UPPER(employee_code) = $2 AND deleted_at IS NULL
    `, [orgId, cleanCode]);

    if (dupCodeRes.rows.length > 0) {
      const match = dupCodeRes.rows[0];
      const matchName = `${match.first_name}${match.last_name ? ' ' + match.last_name : ''}`;
      res.status(409).json({
        success: false,
        error: {
          code: 'DUPLICATE_EMPLOYEE_CODE',
          message: `Employee Code "${cleanCode}" is already assigned to ${matchName}. Please choose a unique Employee Code.`
        }
      });
      return;
    }

    // 2. Check duplicate Email (if provided)
    if (cleanEmail) {
      const dupEmailRes = await query(`
        SELECT id, first_name, last_name, employee_code
        FROM employees
        WHERE organization_id = $1 AND LOWER(email) = $2 AND deleted_at IS NULL
      `, [orgId, cleanEmail]);

      if (dupEmailRes.rows.length > 0) {
        const match = dupEmailRes.rows[0];
        const matchName = `${match.first_name}${match.last_name ? ' ' + match.last_name : ''}`;
        res.status(409).json({
          success: false,
          error: {
            code: 'DUPLICATE_EMAIL',
            message: `Email address "${cleanEmail}" is already registered with employee ${matchName} (${match.employee_code}). Each employee must have a unique email address.`
          }
        });
        return;
      }
    }

    // 3. Check duplicate Phone (if provided)
    if (cleanPhone) {
      const dupPhoneRes = await query(`
        SELECT id, first_name, last_name, employee_code
        FROM employees
        WHERE organization_id = $1 AND phone = $2 AND deleted_at IS NULL
      `, [orgId, cleanPhone]);

      if (dupPhoneRes.rows.length > 0) {
        const match = dupPhoneRes.rows[0];
        const matchName = `${match.first_name}${match.last_name ? ' ' + match.last_name : ''}`;
        res.status(409).json({
          success: false,
          error: {
            code: 'DUPLICATE_PHONE',
            message: `Phone number "${cleanPhone}" is already registered with employee ${matchName} (${match.employee_code}).`
          }
        });
        return;
      }
    }

    const insertRes = await query(`
      INSERT INTO employees (organization_id, department_id, employee_code, first_name, last_name, email, phone, designation)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `, [orgId, department_id, cleanCode, cleanFirstName, cleanLastName, cleanEmail, cleanPhone, designation.trim()]);

    const newEmp = insertRes.rows[0];

    // Assign sites
    const sitesToAssign = Array.isArray(site_ids) && site_ids.length > 0 ? site_ids : (req.siteId ? [req.siteId] : []);
    for (const siteId of sitesToAssign) {
      await query(`
        INSERT INTO employee_sites (employee_id, site_id)
        VALUES ($1, $2)
        ON CONFLICT DO NOTHING
      `, [newEmp.id, siteId]);
    }

    await logAudit({
      userId: req.user!.userId,
      organizationId: orgId,
      siteId: req.siteId,
      action: 'EMPLOYEE_CREATED',
      entityType: 'Employee',
      entityId: String(newEmp.id),
      req,
      newValues: newEmp,
    });

    res.status(201).json({ success: true, message: 'Employee added successfully', data: newEmp });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'EMPLOYEE_CREATE_FAILED', message: err.message } });
  }
});

// PUT /api/employees/:id - Only Super Admin can update employees
router.put('/:id', requireRole(['SUPER_ADMIN']), async (req: Request, res: Response): Promise<void> => {
  try {
    const empId = String(req.params.id);
    const { first_name, last_name, email, phone, designation, department_id, is_active } = req.body;
    const orgId = req.user!.organizationId;

    const oldRes = await query(`SELECT * FROM employees WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`, [empId, orgId]);
    if (oldRes.rows.length === 0) {
      res.status(404).json({ success: false, error: { code: 'EMPLOYEE_NOT_FOUND', message: 'Employee not found.' } });
      return;
    }

    const cleanLastName = last_name !== undefined ? (last_name && typeof last_name === 'string' && last_name.trim() ? last_name.trim() : null) : oldRes.rows[0].last_name;
    const cleanEmail = email !== undefined ? (email && typeof email === 'string' && email.trim() ? email.trim().toLowerCase() : null) : oldRes.rows[0].email;
    const cleanPhone = phone !== undefined ? (phone && typeof phone === 'string' && phone.trim() ? phone.trim() : null) : oldRes.rows[0].phone;

    // Check duplicate Email for update (excluding self)
    if (cleanEmail) {
      const dupEmailRes = await query(`
        SELECT id, first_name, last_name, employee_code
        FROM employees
        WHERE organization_id = $1 AND LOWER(email) = $2 AND id != $3 AND deleted_at IS NULL
      `, [orgId, cleanEmail, empId]);

      if (dupEmailRes.rows.length > 0) {
        const match = dupEmailRes.rows[0];
        const matchName = `${match.first_name}${match.last_name ? ' ' + match.last_name : ''}`;
        res.status(409).json({
          success: false,
          error: {
            code: 'DUPLICATE_EMAIL',
            message: `Email address "${cleanEmail}" is already used by employee ${matchName} (${match.employee_code}).`
          }
        });
        return;
      }
    }

    // Check duplicate Phone for update (excluding self)
    if (cleanPhone) {
      const dupPhoneRes = await query(`
        SELECT id, first_name, last_name, employee_code
        FROM employees
        WHERE organization_id = $1 AND phone = $2 AND id != $3 AND deleted_at IS NULL
      `, [orgId, cleanPhone, empId]);

      if (dupPhoneRes.rows.length > 0) {
        const match = dupPhoneRes.rows[0];
        const matchName = `${match.first_name}${match.last_name ? ' ' + match.last_name : ''}`;
        res.status(409).json({
          success: false,
          error: {
            code: 'DUPLICATE_PHONE',
            message: `Phone number "${cleanPhone}" is already used by employee ${matchName} (${match.employee_code}).`
          }
        });
        return;
      }
    }

    await query(`
      UPDATE employees
      SET first_name = COALESCE($1, first_name),
          last_name = $2,
          email = $3,
          phone = $4,
          designation = COALESCE($5, designation),
          department_id = COALESCE($6, department_id),
          is_active = COALESCE($7, is_active),
          updated_at = NOW()
      WHERE id = $8 AND organization_id = $9
    `, [
      first_name?.trim() || null,
      cleanLastName,
      cleanEmail,
      cleanPhone,
      designation?.trim() || null,
      department_id || null,
      is_active !== undefined ? is_active : null,
      empId,
      orgId
    ]);

    await logAudit({
      userId: req.user!.userId,
      organizationId: orgId,
      siteId: req.siteId,
      action: 'EMPLOYEE_UPDATED',
      entityType: 'Employee',
      entityId: empId,
      req,
      oldValues: oldRes.rows[0],
      newValues: req.body,
    });

    res.json({ success: true, message: 'Employee updated successfully.' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'EMPLOYEE_UPDATE_FAILED', message: err.message } });
  }
});

// DELETE /api/employees/:id - Only Super Admin can delete employees
router.delete('/:id', requireRole(['SUPER_ADMIN']), async (req: Request, res: Response): Promise<void> => {
  try {
    const empId = String(req.params.id);
    const orgId = req.user!.organizationId;

    const oldRes = await query(`SELECT * FROM employees WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`, [empId, orgId]);
    if (oldRes.rows.length === 0) {
      res.status(404).json({ success: false, error: { code: 'EMPLOYEE_NOT_FOUND', message: 'Employee not found or already deleted.' } });
      return;
    }

    // Soft delete employee
    await query(`
      UPDATE employees
      SET deleted_at = NOW(),
          is_active = FALSE,
          updated_at = NOW()
      WHERE id = $1 AND organization_id = $2
    `, [empId, orgId]);

    // Clean up employee site mappings
    await query(`DELETE FROM employee_sites WHERE employee_id = $1`, [empId]);

    await logAudit({
      userId: req.user!.userId,
      organizationId: orgId,
      siteId: req.siteId,
      action: 'EMPLOYEE_DELETED',
      entityType: 'Employee',
      entityId: empId,
      req,
      oldValues: oldRes.rows[0],
    });

    res.json({ success: true, message: 'Employee deleted successfully.' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'EMPLOYEE_DELETE_FAILED', message: err.message } });
  }
});

export const employeeRouter = router;

