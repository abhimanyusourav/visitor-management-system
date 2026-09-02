import { Request, Response, Router } from 'express';
import crypto from 'crypto';
import { query } from '../../database/db.js';
import { authMiddleware } from '../../common/middleware/authMiddleware.js';
import { siteContextMiddleware } from '../../common/middleware/siteContextMiddleware.js';
import { requirePermission } from '../../common/middleware/rbacMiddleware.js';
import { logAudit } from '../audit/audit.controller.js';
import { storageService } from '../storage/storage.service.js';
import { createNotification } from '../notifications/notification.service.js';

const router = Router();
router.use(authMiddleware);
router.use(siteContextMiddleware);

// Collision-safe, site-prefixed visit code generator
async function generateVisitCode(siteId: string): Promise<string> {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const siteRes = await query(`SELECT code FROM sites WHERE id = $1`, [siteId]);
  const siteCode = siteRes.rows[0]?.code
    ? siteRes.rows[0].code.replace(/[^A-Z0-9]/gi, '').slice(0, 4).toUpperCase()
    : 'SITE';
  const randomSuffix = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `VIS-${dateStr}-${siteCode}-${randomSuffix}`;
}

// GET /api/visits/currently-inside - Dedicated Live On-Site Rollcall
router.get('/currently-inside', requirePermission('inside:view'), async (req: Request, res: Response): Promise<void> => {
  try {
    const siteId = req.siteId;
    if (!siteId) {
      res.status(400).json({ success: false, error: { code: 'NO_ACTIVE_SITE', message: 'No active site selected.' } });
      return;
    }

    const insideRes = await query(`
      SELECT 
        v.id, v.visit_code, v.visitor_type, v.purpose, v.status,
        v.expected_date, v.expected_time, v.check_in_time, v.accompanying_count,
        v.remarks, v.emergency_muster_status, v.assembly_point,
        vt.id as visitor_id, vt.full_name as visitor_name, vt.mobile_number,
        vt.company_name, vt.designation as visitor_designation, vt.photo_url as visitor_photo,
        vt.id_type, vt.id_number_masked,
        e.id as host_id, e.first_name as host_first_name, e.last_name as host_last_name,
        e.email as host_email, e.phone as host_phone,
        d.id as department_id, d.name as department_name,
        s.name as site_name, s.code as site_code,
        vp.id as pass_id, vp.pass_number, vp.qr_token, vp.status as pass_status,
        vv.vehicle_type, vv.vehicle_number
      FROM visits v
      JOIN visitors vt ON v.visitor_id = vt.id
      JOIN employees e ON v.host_employee_id = e.id
      JOIN departments d ON v.department_id = d.id
      JOIN sites s ON v.site_id = s.id
      LEFT JOIN visitor_passes vp ON vp.visit_id = v.id
      LEFT JOIN visit_vehicles vv ON vv.visit_id = v.id
      WHERE v.site_id = $1 AND v.status = 'CHECKED_IN' AND v.deleted_at IS NULL
      ORDER BY v.check_in_time DESC
    `, [siteId]);

    res.json({
      success: true,
      data: insideRes.rows,
      meta: {
        totalInside: insideRes.rows.length,
        totalHeadcount: insideRes.rows.reduce((acc, row) => acc + 1 + (row.accompanying_count || 0), 0),
        generatedAt: new Date().toISOString(),
      }
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'CURRENTLY_INSIDE_FAILED', message: 'Failed to retrieve live rollcall.' } });
  }
});

// GET /api/visits/emergency-export - 1-Click Safety Evacuation Manifest
router.get('/emergency-export', requirePermission('emergency:export'), async (req: Request, res: Response): Promise<void> => {
  try {
    const siteId = req.siteId;
    if (!siteId) {
      res.status(400).json({ success: false, error: { code: 'NO_ACTIVE_SITE', message: 'No active site selected.' } });
      return;
    }

    const exportRes = await query(`
      SELECT 
        v.id as visit_id, v.visit_code, vt.full_name as visitor_name, vt.company_name, vt.mobile_number,
        (e.first_name || ' ' || COALESCE(e.last_name, '')) as host_name, d.name as department,
        v.visitor_type, v.check_in_time, v.accompanying_count, vv.vehicle_number,
        vp.pass_number, v.emergency_muster_status, v.assembly_point
      FROM visits v
      JOIN visitors vt ON v.visitor_id = vt.id
      JOIN employees e ON v.host_employee_id = e.id
      JOIN departments d ON v.department_id = d.id
      LEFT JOIN visitor_passes vp ON vp.visit_id = v.id
      LEFT JOIN visit_vehicles vv ON vv.visit_id = v.id
      WHERE v.site_id = $1 AND v.status = 'CHECKED_IN' AND v.deleted_at IS NULL
      ORDER BY v.check_in_time ASC
    `, [siteId]);

    const siteRes = await query(`SELECT name, code, address, city FROM sites WHERE id = $1`, [siteId]);
    const siteInfo = siteRes.rows[0];

    await logAudit({
      userId: req.user!.userId,
      organizationId: req.user!.organizationId,
      siteId,
      action: 'EMERGENCY_EVACUATION_EXPORT',
      entityType: 'Site',
      entityId: siteId,
      req,
      metadata: { totalVisitorsInside: exportRes.rows.length }
    });

    res.json({
      success: true,
      data: {
        site: siteInfo,
        exportedAt: new Date().toISOString(),
        exportedBy: `${req.user!.firstName} ${req.user!.lastName} (${req.user!.role})`,
        totalHeadcount: exportRes.rows.reduce((acc, row) => acc + 1 + (row.accompanying_count || 0), 0),
        records: exportRes.rows,
      }
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'EMERGENCY_EXPORT_FAILED', message: 'Failed to export emergency manifest.' } });
  }
});

// PUT /api/visits/:id/muster-status - Update emergency evacuation muster status
router.put('/:id/muster-status', requirePermission('emergency:export'), async (req: Request, res: Response): Promise<void> => {
  try {
    const visitId = String(req.params.id);
    const { muster_status, assembly_point } = req.body;
    const orgId = req.user!.organizationId;
    const siteId = req.siteId;

    const validStatuses = ['SAFE', 'MISSING', 'INJURED', 'NOT_VERIFIED'];
    if (!muster_status || !validStatuses.includes(muster_status)) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_MUSTER_STATUS', message: 'Valid statuses: SAFE, MISSING, INJURED, NOT_VERIFIED' }
      });
      return;
    }

    const updateRes = await query(`
      UPDATE visits
      SET emergency_muster_status = $1, assembly_point = COALESCE($2, assembly_point), updated_at = NOW()
      WHERE id = $3 AND organization_id = $4 AND site_id = $5 AND status = 'CHECKED_IN'
      RETURNING id, emergency_muster_status, assembly_point
    `, [muster_status, assembly_point || null, visitId, orgId, siteId]);

    if (updateRes.rows.length === 0) {
      res.status(404).json({ success: false, error: { code: 'VISIT_NOT_FOUND', message: 'Active on-site visit not found.' } });
      return;
    }

    await logAudit({
      userId: req.user!.userId,
      organizationId: orgId,
      siteId,
      action: 'EMERGENCY_MUSTER_STATUS_UPDATED',
      entityType: 'Visit',
      entityId: visitId,
      req,
      newValues: { muster_status, assembly_point }
    });

    res.json({ success: true, message: 'Muster status updated successfully.', data: updateRes.rows[0] });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'MUSTER_UPDATE_FAILED', message: 'Failed to update muster status.' } });
  }
});

// GET /api/visits - Paginated Visits List with Site Scoping
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      status, visitorType, hostId, search, startDate, endDate,
      page = '1', limit = '20'
    } = req.query;

    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);
    const offset = (pageNum - 1) * limitNum;

    const orgId = req.user!.organizationId;
    const siteId = req.siteId;

    const conditions: string[] = ['v.organization_id = $1', 'v.deleted_at IS NULL'];
    const params: any[] = [orgId];

    if (siteId) {
      params.push(siteId);
      conditions.push(`v.site_id = $${params.length}`);
    }

    if (status) {
      params.push(status);
      conditions.push(`v.status = $${params.length}`);
    }

    if (visitorType) {
      params.push(visitorType);
      conditions.push(`v.visitor_type = $${params.length}`);
    }

    if (hostId) {
      params.push(hostId);
      conditions.push(`v.host_employee_id = $${params.length}`);
    }

    // Role-specific scope: If regular employee, only show their visits
    if (req.user!.role === 'EMPLOYEE') {
      const empId = req.user!.employeeId;
      if (empId) {
        params.push(empId);
        conditions.push(`v.host_employee_id = $${params.length}`);
      }
    }

    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(vt.full_name ILIKE $${params.length} OR vt.mobile_number ILIKE $${params.length} OR vt.company_name ILIKE $${params.length} OR v.visit_code ILIKE $${params.length} OR vv.vehicle_number ILIKE $${params.length})`);
    }

    if (startDate) {
      params.push(startDate);
      conditions.push(`v.expected_date >= $${params.length}`);
    }

    if (endDate) {
      params.push(endDate);
      conditions.push(`v.expected_date <= $${params.length}`);
    }

    const whereClause = conditions.join(' AND ');

    const countRes = await query(`
      SELECT COUNT(DISTINCT v.id) as total
      FROM visits v
      JOIN visitors vt ON v.visitor_id = vt.id
      LEFT JOIN visit_vehicles vv ON vv.visit_id = v.id
      WHERE ${whereClause}
    `, params);
    const total = parseInt(countRes.rows[0]?.total || '0', 10);

    params.push(limitNum, offset);
    const visitsRes = await query(`
      SELECT 
        v.id, v.visit_code, v.visitor_type, v.purpose, v.status,
        v.expected_date, v.expected_time, v.expected_exit_time,
        v.check_in_time, v.check_out_time, v.accompanying_count, v.remarks,
        v.created_at, v.approved_at, v.emergency_muster_status,
        vt.id as visitor_id, vt.full_name as visitor_name, vt.mobile_number,
        vt.company_name, vt.photo_url as visitor_photo,
        e.id as host_id, e.first_name as host_first_name, e.last_name as host_last_name,
        d.name as department_name,
        s.name as site_name, s.code as site_code,
        vp.id as pass_id, vp.pass_number, vp.qr_token, vp.status as pass_status,
        vv.vehicle_type, vv.vehicle_number
      FROM visits v
      JOIN visitors vt ON v.visitor_id = vt.id
      JOIN employees e ON v.host_employee_id = e.id
      JOIN departments d ON v.department_id = d.id
      JOIN sites s ON v.site_id = s.id
      LEFT JOIN visitor_passes vp ON vp.visit_id = v.id
      LEFT JOIN visit_vehicles vv ON vv.visit_id = v.id
      WHERE ${whereClause}
      ORDER BY v.created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `, params);

    res.json({
      success: true,
      data: visitsRes.rows,
      meta: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      }
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'VISITS_FETCH_FAILED', message: 'Failed to retrieve visits.' } });
  }
});

// POST /api/visits - Create Walk-In or Expected Visit
router.post('/', requirePermission('visitor:create'), async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      visitor_id, first_name, last_name, email, mobile_number, company_name, designation,
      photo_base64, id_type, id_number,
      visitor_type = 'Guest', purpose, host_employee_id, department_id,
      expected_date, expected_time, expected_exit_time, accompanying_count = 0, remarks,
      vehicle_type, vehicle_number, gate_id,
      auto_check_in = false,
    } = req.body;

    const orgId = req.user!.organizationId;
    const siteId = req.siteId;

    if (!siteId) {
      res.status(400).json({ success: false, error: { code: 'NO_ACTIVE_SITE', message: 'No active site selected.' } });
      return;
    }

    if (!host_employee_id || !purpose) {
      res.status(400).json({ success: false, error: { code: 'INVALID_INPUT', message: 'Host employee and visit purpose are required.' } });
      return;
    }

    // Verify host employee belongs to this organization
    const hostCheck = await query(`
      SELECT id, department_id, user_id FROM employees WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL
    `, [host_employee_id, orgId]);

    if (hostCheck.rows.length === 0) {
      res.status(400).json({ success: false, error: { code: 'INVALID_HOST', message: 'Selected host employee is not valid.' } });
      return;
    }

    // 1. Resolve or Create Visitor Profile
    let finalVisitorId = visitor_id;
    let finalPhotoUrl: string | null = null;

    if (photo_base64 && typeof photo_base64 === 'string' && photo_base64.startsWith('data:image')) {
      finalPhotoUrl = await storageService.saveBase64Photo(photo_base64, 'visitor');
    }

    let id_masked: string | null = null;
    if (id_number && typeof id_number === 'string' && id_number.trim()) {
      const clean = id_number.trim();
      id_masked = clean.length > 4 ? `XXXX-XXXX-${clean.slice(-4)}` : clean;
    }

    if (!finalVisitorId) {
      if (!first_name || !last_name || !mobile_number) {
        res.status(400).json({ success: false, error: { code: 'INVALID_INPUT', message: 'Visitor name and mobile number are required.' } });
        return;
      }

      // Check if visitor already exists with same phone in org
      const existing = await query(`
        SELECT id, photo_url FROM visitors WHERE organization_id = $1 AND mobile_number = $2 AND deleted_at IS NULL
      `, [orgId, mobile_number.trim()]);

      if (existing.rows.length > 0) {
        finalVisitorId = existing.rows[0].id;
        if (finalPhotoUrl) {
          await query(`UPDATE visitors SET photo_url = $1 WHERE id = $2`, [finalPhotoUrl, finalVisitorId]);
        }
      } else {
        const fullName = `${first_name.trim()} ${last_name.trim()}`;
        const vInsert = await query(`
          INSERT INTO visitors (
            organization_id, first_name, last_name, full_name, email, mobile_number,
            company_name, designation, default_visitor_type, id_type, id_number_masked, photo_url
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          RETURNING id
        `, [
          orgId, first_name.trim(), last_name.trim(), fullName, email || null, mobile_number.trim(),
          company_name || null, designation || null, visitor_type, id_type || null, id_masked, finalPhotoUrl
        ]);
        finalVisitorId = vInsert.rows[0].id;
      }
    }

    // Resolve department
    let finalDeptId = department_id;
    if (!finalDeptId) {
      finalDeptId = hostCheck.rows[0].department_id;
    }

    // 2. Generate Collision-Safe Visit Code
    let visitCode = await generateVisitCode(siteId);
    const scheduledDate = expected_date || new Date().toISOString().slice(0, 10);
    const scheduledTime = expected_time || new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

    // Initial Status
    let initialStatus = 'REGISTERED';
    let checkInTime: string | null = null;
    let checkedInBy: string | null = null;

    if (auto_check_in) {
      initialStatus = 'CHECKED_IN';
      checkInTime = new Date().toISOString();
      checkedInBy = req.user!.userId;
    }

    // 3. Insert Visit Record
    const visitRes = await query(`
      INSERT INTO visits (
        organization_id, site_id, visitor_id, host_employee_id, department_id,
        visit_code, visitor_type, purpose, status, expected_date, expected_time,
        expected_exit_time, check_in_time, accompanying_count, remarks, checked_in_by_user_id, entry_gate_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      RETURNING *
    `, [
      orgId, siteId, finalVisitorId, host_employee_id, finalDeptId,
      visitCode, visitor_type, purpose, initialStatus, scheduledDate, scheduledTime,
      expected_exit_time || null, checkInTime, accompanying_count, remarks || null, checkedInBy, gate_id || null
    ]);

    const newVisit = visitRes.rows[0];

    // 4. Create Vehicle Record if provided
    if (vehicle_number && typeof vehicle_number === 'string' && vehicle_number.trim()) {
      await query(`
        INSERT INTO visit_vehicles (visit_id, vehicle_type, vehicle_number)
        VALUES ($1, $2, $3)
      `, [newVisit.id, vehicle_type || 'FOUR_WHEELER', vehicle_number.trim().toUpperCase()]);
    }

    // 5. Generate Cryptographic High-Entropy QR Token, SHA-256 Hash, and Pass
    const qrToken = 'qr_' + crypto.randomBytes(24).toString('hex');
    const qrTokenHash = crypto.createHash('sha256').update(qrToken).digest('hex');
    const passNumber = `PASS-${visitCode.replace('VIS-', '')}`;
    const validUntil = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await query(`
      INSERT INTO visitor_passes (visit_id, pass_number, qr_token, qr_token_hash, pass_type, status, valid_until)
      VALUES ($1, $2, $3, $4, 'STANDARD', 'ACTIVE', $5)
    `, [newVisit.id, passNumber, qrToken, qrTokenHash, validUntil.toISOString()]);

    // 6. Notify Host Employee if host has linked user account
    if (hostCheck.rows[0].user_id) {
      await createNotification({
        organizationId: orgId,
        siteId,
        recipientUserId: hostCheck.rows[0].user_id,
        type: auto_check_in ? 'VISITOR_ARRIVED' : 'VISIT_SCHEDULED',
        title: auto_check_in ? 'Visitor Checked In at Gate' : 'New Expected Visitor Scheduled',
        message: `${first_name || 'Visitor'} from ${company_name || 'Organization'} has a visit scheduled (${visitCode}).`,
        data: { visitId: newVisit.id, visitCode }
      });
    }

    await logAudit({
      userId: req.user!.userId,
      organizationId: orgId,
      siteId,
      action: auto_check_in ? 'VISIT_REGISTERED_AND_CHECKED_IN' : 'VISIT_REGISTERED',
      entityType: 'Visit',
      entityId: String(newVisit.id),
      req,
      newValues: { visitCode, status: initialStatus, visitorId: finalVisitorId },
    });

    res.status(201).json({
      success: true,
      message: auto_check_in ? 'Visitor checked in successfully.' : 'Visit registered successfully.',
      data: {
        ...newVisit,
        pass_number: passNumber,
        qr_token: qrToken,
      }
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'VISIT_CREATE_FAILED', message: 'Failed to create visit record.' } });
  }
});

// GET /api/visits/:id - Detailed Visit View with Site Scoping
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const visitId = String(req.params.id);
    const orgId = req.user!.organizationId;

    const visitRes = await query(`
      SELECT 
        v.*,
        vt.full_name as visitor_name, vt.mobile_number, vt.email as visitor_email,
        vt.company_name, vt.designation as visitor_designation, vt.photo_url as visitor_photo,
        vt.id_type, vt.id_number_masked, vt.notes as visitor_notes,
        e.first_name as host_first_name, e.last_name as host_last_name,
        e.email as host_email, e.phone as host_phone, e.designation as host_designation,
        d.name as department_name, d.code as department_code,
        s.name as site_name, s.code as site_code, s.address as site_address,
        vp.id as pass_id, vp.pass_number, vp.qr_token, vp.status as pass_status, vp.printed_count,
        vv.vehicle_type, vv.vehicle_number, vv.driver_name
      FROM visits v
      JOIN visitors vt ON v.visitor_id = vt.id
      JOIN employees e ON v.host_employee_id = e.id
      JOIN departments d ON v.department_id = d.id
      JOIN sites s ON v.site_id = s.id
      LEFT JOIN visitor_passes vp ON vp.visit_id = v.id
      LEFT JOIN visit_vehicles vv ON vv.visit_id = v.id
      WHERE v.id = $1 AND v.organization_id = $2 AND v.deleted_at IS NULL
    `, [visitId, orgId]);

    if (visitRes.rows.length === 0) {
      res.status(404).json({ success: false, error: { code: 'VISIT_NOT_FOUND', message: 'Visit not found.' } });
      return;
    }

    const visit = visitRes.rows[0];

    // Enforce site authorization
    if (req.user!.role !== 'SUPER_ADMIN' && !req.user!.allowedSiteIds.includes(visit.site_id)) {
      res.status(403).json({ success: false, error: { code: 'UNAUTHORIZED_SITE_ACCESS', message: 'You are not authorized for this site.' } });
      return;
    }

    // Role-specific check: If employee, must be host
    if (req.user!.role === 'EMPLOYEE' && req.user!.employeeId && visit.host_employee_id !== req.user!.employeeId) {
      res.status(403).json({ success: false, error: { code: 'UNAUTHORIZED_ACCESS', message: 'You are not authorized to view this visit.' } });
      return;
    }

    res.json({ success: true, data: visit });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'VISIT_FETCH_FAILED', message: 'Failed to retrieve visit details.' } });
  }
});

// POST /api/visits/:id/check-in - Atomic Gate Check In
router.post('/:id/check-in', requirePermission('visit:checkin'), async (req: Request, res: Response): Promise<void> => {
  try {
    const visitId = String(req.params.id);
    const { photo_base64, gate_id } = req.body;
    const orgId = req.user!.organizationId;
    const siteId = req.siteId;

    if (!siteId) {
      res.status(400).json({ success: false, error: { code: 'NO_ACTIVE_SITE', message: 'No active site selected.' } });
      return;
    }

    // Check visit existence and site ownership
    const visitRes = await query(`
      SELECT v.*, vt.id as visitor_id, vt.full_name as visitor_name, e.user_id as host_user_id
      FROM visits v
      JOIN visitors vt ON v.visitor_id = vt.id
      JOIN employees e ON v.host_employee_id = e.id
      WHERE v.id = $1 AND v.organization_id = $2 AND v.deleted_at IS NULL
    `, [visitId, orgId]);

    if (visitRes.rows.length === 0) {
      res.status(404).json({ success: false, error: { code: 'VISIT_NOT_FOUND', message: 'Visit record not found.' } });
      return;
    }

    const visit = visitRes.rows[0];

    // Enforce site isolation
    if (visit.site_id !== siteId) {
      res.status(403).json({
        success: false,
        error: { code: 'UNAUTHORIZED_SITE_ACCESS', message: 'This visit is registered for a different plant site.' }
      });
      return;
    }

    if (visit.status === 'CHECKED_IN') {
      res.status(409).json({ success: false, error: { code: 'ALREADY_CHECKED_IN', message: 'Visitor is already checked in.' } });
      return;
    }

    if (visit.status === 'CHECKED_OUT') {
      res.status(400).json({ success: false, error: { code: 'ALREADY_CHECKED_OUT', message: 'This visit has already completed and checked out.' } });
      return;
    }

    if (visit.status === 'REJECTED' || visit.status === 'CANCELLED') {
      res.status(400).json({ success: false, error: { code: 'INVALID_VISIT_STATUS', message: `Cannot check in visit with status "${visit.status}".` } });
      return;
    }

    // Save photo if captured during gate check-in
    if (photo_base64 && typeof photo_base64 === 'string' && photo_base64.startsWith('data:image')) {
      const photoUrl = await storageService.saveBase64Photo(photo_base64, 'gate_checkin');
      await query(`UPDATE visitors SET photo_url = $1 WHERE id = $2`, [photoUrl, visit.visitor_id]);
    }

    const checkInTime = new Date().toISOString();

    // Atomic update with status check
    const updateRes = await query(`
      UPDATE visits 
      SET status = 'CHECKED_IN', check_in_time = $1, checked_in_by_user_id = $2, entry_gate_id = $3, updated_at = NOW()
      WHERE id = $4 AND organization_id = $5 AND site_id = $6 AND status IN ('REGISTERED', 'APPROVED', 'PRE_REGISTERED')
      RETURNING *
    `, [checkInTime, req.user!.userId, gate_id || null, visitId, orgId, siteId]);

    if (updateRes.rows.length === 0) {
      res.status(409).json({
        success: false,
        error: { code: 'CHECKIN_CONFLICT', message: 'Check-in failed due to concurrent modification or invalid visit status.' }
      });
      return;
    }

    // Ensure active pass exists
    await query(`
      UPDATE visitor_passes
      SET status = 'ACTIVE'
      WHERE visit_id = $1
    `, [visitId]);

    if (visit.host_user_id) {
      await createNotification({
        organizationId: orgId,
        siteId,
        recipientUserId: visit.host_user_id,
        type: 'VISITOR_ARRIVED',
        title: 'Your Visitor Has Arrived',
        message: `${visit.visitor_name} has checked in at the security gate for visit ${visit.visit_code}.`,
        data: { visitId, visitCode: visit.visit_code }
      });
    }

    await logAudit({
      userId: req.user!.userId,
      organizationId: orgId,
      siteId,
      action: 'VISITOR_CHECKED_IN',
      entityType: 'Visit',
      entityId: visitId,
      req,
      newValues: { status: 'CHECKED_IN', checkInTime }
    });

    res.json({ success: true, message: 'Visitor checked in successfully.' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'CHECKIN_FAILED', message: 'Failed to process visitor check-in.' } });
  }
});

// POST /api/visits/:id/check-out - Atomic Gate Check Out
router.post('/:id/check-out', requirePermission('visit:checkout'), async (req: Request, res: Response): Promise<void> => {
  try {
    const visitId = String(req.params.id);
    const { gate_id } = req.body;
    const orgId = req.user!.organizationId;
    const siteId = req.siteId;

    if (!siteId) {
      res.status(400).json({ success: false, error: { code: 'NO_ACTIVE_SITE', message: 'No active site selected.' } });
      return;
    }

    const checkRes = await query(`
      SELECT v.*, vt.full_name as visitor_name
      FROM visits v
      JOIN visitors vt ON v.visitor_id = vt.id
      WHERE v.id = $1 AND v.organization_id = $2 AND v.deleted_at IS NULL
    `, [visitId, orgId]);

    if (checkRes.rows.length === 0) {
      res.status(404).json({ success: false, error: { code: 'VISIT_NOT_FOUND', message: 'Visit record not found.' } });
      return;
    }

    const visit = checkRes.rows[0];

    // Enforce site isolation
    if (visit.site_id !== siteId) {
      res.status(403).json({
        success: false,
        error: { code: 'UNAUTHORIZED_SITE_ACCESS', message: 'This visit belongs to a different plant site.' }
      });
      return;
    }

    if (visit.status === 'CHECKED_OUT') {
      res.status(409).json({ success: false, error: { code: 'ALREADY_CHECKED_OUT', message: 'Visitor is already checked out.' } });
      return;
    }

    if (visit.status !== 'CHECKED_IN') {
      res.status(400).json({
        success: false,
        error: { code: 'NOT_CHECKED_IN', message: `Cannot check out a visitor who is not checked in (status: "${visit.status}").` }
      });
      return;
    }

    const checkOutTime = new Date().toISOString();

    // Atomic update with status constraint
    const updateRes = await query(`
      UPDATE visits 
      SET status = 'CHECKED_OUT', check_out_time = $1, checked_out_by_user_id = $2, exit_gate_id = $3, updated_at = NOW()
      WHERE id = $4 AND organization_id = $5 AND site_id = $6 AND status = 'CHECKED_IN'
      RETURNING *
    `, [checkOutTime, req.user!.userId, gate_id || null, visitId, orgId, siteId]);

    if (updateRes.rows.length === 0) {
      res.status(409).json({
        success: false,
        error: { code: 'CHECKOUT_CONFLICT', message: 'Check-out failed due to concurrent modification.' }
      });
      return;
    }

    // Invalidate QR pass token on checkout immediately
    await query(`
      UPDATE visitor_passes 
      SET status = 'USED'
      WHERE visit_id = $1
    `, [visitId]);

    await logAudit({
      userId: req.user!.userId,
      organizationId: orgId,
      siteId,
      action: 'VISITOR_CHECKED_OUT',
      entityType: 'Visit',
      entityId: visitId,
      req,
      newValues: { status: 'CHECKED_OUT', checkOutTime }
    });

    res.json({ success: true, message: 'Visitor checked out successfully.' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'CHECKOUT_FAILED', message: 'Failed to process visitor check-out.' } });
  }
});

// POST /api/visits/:id/approve - Host / Admin Approval with Host Employee Validation
router.post('/:id/approve', requirePermission('visit:approve'), async (req: Request, res: Response): Promise<void> => {
  try {
    const visitId = String(req.params.id);
    const orgId = req.user!.organizationId;

    const visitRes = await query(`
      SELECT v.id, v.site_id, v.host_employee_id, v.status, v.visit_code
      FROM visits v
      WHERE v.id = $1 AND v.organization_id = $2 AND v.deleted_at IS NULL
    `, [visitId, orgId]);

    if (visitRes.rows.length === 0) {
      res.status(404).json({ success: false, error: { code: 'VISIT_NOT_FOUND', message: 'Visit not found.' } });
      return;
    }

    const visit = visitRes.rows[0];

    // Enforce host employee authorization: regular employees can ONLY approve their own visits
    if (req.user!.role === 'EMPLOYEE') {
      if (!req.user!.employeeId || visit.host_employee_id !== req.user!.employeeId) {
        res.status(403).json({
          success: false,
          error: {
            code: 'UNAUTHORIZED_HOST_APPROVAL',
            message: 'You may only approve visits where you are designated as the host employee.',
          }
        });
        return;
      }
    } else if (req.user!.role !== 'SUPER_ADMIN') {
      // Site Admin / Admin: check site authorization
      if (!req.user!.allowedSiteIds.includes(visit.site_id)) {
        res.status(403).json({
          success: false,
          error: { code: 'UNAUTHORIZED_SITE_ACCESS', message: 'You are not authorized to approve visits for this site.' }
        });
        return;
      }
    }

    await query(`
      UPDATE visits 
      SET status = 'APPROVED', approved_by_user_id = $1, approved_at = NOW(), updated_at = NOW()
      WHERE id = $2 AND organization_id = $3
    `, [req.user!.userId, visitId, orgId]);

    await logAudit({
      userId: req.user!.userId,
      organizationId: orgId,
      siteId: visit.site_id,
      action: 'VISIT_APPROVED',
      entityType: 'Visit',
      entityId: visitId,
      req,
    });

    res.json({ success: true, message: 'Visit approved successfully.' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'APPROVE_FAILED', message: 'Failed to approve visit.' } });
  }
});

// POST /api/visits/:id/reject - Host / Admin Rejection with Host Employee Validation
router.post('/:id/reject', requirePermission('visit:approve'), async (req: Request, res: Response): Promise<void> => {
  try {
    const visitId = String(req.params.id);
    const { rejection_reason } = req.body;
    const orgId = req.user!.organizationId;

    const visitRes = await query(`
      SELECT v.id, v.site_id, v.host_employee_id, v.status, v.visit_code
      FROM visits v
      WHERE v.id = $1 AND v.organization_id = $2 AND v.deleted_at IS NULL
    `, [visitId, orgId]);

    if (visitRes.rows.length === 0) {
      res.status(404).json({ success: false, error: { code: 'VISIT_NOT_FOUND', message: 'Visit not found.' } });
      return;
    }

    const visit = visitRes.rows[0];

    // Enforce host employee authorization: regular employees can ONLY reject their own visits
    if (req.user!.role === 'EMPLOYEE') {
      if (!req.user!.employeeId || visit.host_employee_id !== req.user!.employeeId) {
        res.status(403).json({
          success: false,
          error: {
            code: 'UNAUTHORIZED_HOST_APPROVAL',
            message: 'You may only reject visits where you are designated as the host employee.',
          }
        });
        return;
      }
    } else if (req.user!.role !== 'SUPER_ADMIN') {
      // Site Admin / Admin: check site authorization
      if (!req.user!.allowedSiteIds.includes(visit.site_id)) {
        res.status(403).json({
          success: false,
          error: { code: 'UNAUTHORIZED_SITE_ACCESS', message: 'You are not authorized to reject visits for this site.' }
        });
        return;
      }
    }

    await query(`
      UPDATE visits 
      SET status = 'REJECTED', approved_by_user_id = $1, rejection_reason = $2, updated_at = NOW()
      WHERE id = $3 AND organization_id = $4
    `, [req.user!.userId, rejection_reason || 'Visit rejected by host.', visitId, orgId]);

    await logAudit({
      userId: req.user!.userId,
      organizationId: orgId,
      siteId: visit.site_id,
      action: 'VISIT_REJECTED',
      entityType: 'Visit',
      entityId: visitId,
      req,
      newValues: { rejection_reason }
    });

    res.json({ success: true, message: 'Visit rejected.' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'REJECT_FAILED', message: 'Failed to reject visit.' } });
  }
});

export const visitRouter = router;
