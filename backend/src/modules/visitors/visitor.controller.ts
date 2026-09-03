import { Request, Response, Router } from 'express';
import { query } from '../../database/db.js';
import { authMiddleware } from '../../common/middleware/authMiddleware.js';
import { siteContextMiddleware } from '../../common/middleware/siteContextMiddleware.js';
import { requirePermission } from '../../common/middleware/rbacMiddleware.js';
import { logAudit } from '../audit/audit.controller.js';
import { storageService } from '../storage/storage.service.js';

const router = Router();
router.use(authMiddleware);
router.use(siteContextMiddleware);

// GET /api/visitors - Search & list visitor directory with site-aware privacy filtering
router.get('/', async (req: Request, res: Response) => {
  try {
    const { search, visitorType, isBlacklisted, page = '1', limit = '20' } = req.query;
    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);
    const offset = (pageNum - 1) * limitNum;
    const orgId = req.user!.organizationId;
    const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';
    const allowedSites = req.user!.allowedSiteIds || [];

    const conditions: string[] = ['v.organization_id = $1', 'v.deleted_at IS NULL'];
    const params: any[] = [orgId];

    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(v.full_name ILIKE $${params.length} OR v.mobile_number ILIKE $${params.length} OR v.company_name ILIKE $${params.length} OR v.email ILIKE $${params.length})`);
    }

    if (visitorType) {
      params.push(visitorType);
      conditions.push(`v.default_visitor_type = $${params.length}`);
    }

    if (isBlacklisted !== undefined) {
      params.push(isBlacklisted === 'true');
      conditions.push(`v.is_blacklisted = $${params.length}`);
    }

    const whereClause = conditions.join(' AND ');

    const countRes = await query(`
      SELECT COUNT(*) as total
      FROM visitors v
      WHERE ${whereClause}
    `, params);
    const total = parseInt(countRes.rows[0]?.total || '0', 10);

    params.push(limitNum, offset);
    const limitParamIndex = params.length - 1;
    const offsetParamIndex = params.length;

    const visitorsRes = await query(`
      SELECT 
        v.id, v.first_name, v.last_name, v.full_name, v.email, v.mobile_number,
        v.company_name, v.designation, v.default_visitor_type, v.id_type,
        v.id_number_masked, v.photo_url, v.notes, v.is_blacklisted, v.blacklist_reason,
        v.created_at, v.updated_at,
        (SELECT COUNT(*) FROM visits vt WHERE vt.visitor_id = v.id AND vt.deleted_at IS NULL) as total_visits_count,
        (SELECT MAX(check_in_time) FROM visits vt WHERE vt.visitor_id = v.id AND vt.deleted_at IS NULL) as last_visit_date
      FROM visitors v
      WHERE ${whereClause}
      ORDER BY v.updated_at DESC
      LIMIT $${limitParamIndex} OFFSET $${offsetParamIndex}
    `, params);

    // Filter sensitive fields for non-superadmins cross-site
    const sanitizedVisitors = visitorsRes.rows.map((row: any) => {
      if (!isSuperAdmin) {
        return {
          ...row,
          notes: null, // Protect cross-site internal notes
          blacklist_reason: row.is_blacklisted ? 'Security Flag' : null,
        };
      }
      return row;
    });

    res.json({
      success: true,
      data: sanitizedVisitors,
      meta: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      }
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'VISITORS_FETCH_FAILED', message: 'Failed to retrieve visitor directory.' } });
  }
});

// POST /api/visitors/lookup - Instant search by phone for fast auto-fill (Minimal necessary disclosure)
router.post('/lookup', async (req: Request, res: Response): Promise<void> => {
  try {
    const { mobile_number } = req.body;
    const orgId = req.user!.organizationId;

    if (!mobile_number) {
      res.status(400).json({ success: false, error: { code: 'INVALID_INPUT', message: 'Mobile number is required' } });
      return;
    }

    // Return ONLY minimal necessary registration fields - Never leak internal notes, full history, or raw tokens
    const visitorRes = await query(`
      SELECT 
        id, first_name, last_name, full_name, email, mobile_number,
        company_name, designation, default_visitor_type, id_type,
        id_number_masked, photo_url, is_blacklisted
      FROM visitors
      WHERE organization_id = $1 AND (mobile_number = $2 OR mobile_number LIKE $3) AND deleted_at IS NULL
      LIMIT 1
    `, [orgId, mobile_number.trim(), `%${mobile_number.trim()}%`]);

    if (visitorRes.rows.length === 0) {
      res.json({ success: true, data: null, message: 'No existing visitor found with this mobile number.' });
      return;
    }

    const v = visitorRes.rows[0];
    res.json({
      success: true,
      data: {
        id: v.id,
        first_name: v.first_name,
        last_name: v.last_name,
        full_name: v.full_name,
        email: v.email,
        mobile_number: v.mobile_number,
        company_name: v.company_name,
        designation: v.designation,
        default_visitor_type: v.default_visitor_type,
        id_type: v.id_type,
        id_number_masked: v.id_number_masked,
        photo_url: v.photo_url,
        is_blacklisted: v.is_blacklisted,
      },
      message: 'Visitor profile found'
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'LOOKUP_FAILED', message: 'Failed to lookup visitor profile.' } });
  }
});

// GET /api/visitors/:id/history - Dedicated site-authorized visit history
router.get('/:id/history', async (req: Request, res: Response): Promise<void> => {
  try {
    const visitorId = String(req.params.id);
    const orgId = req.user!.organizationId;
    const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';
    const allowedSites = req.user!.allowedSiteIds || [];

    const historyParams: any[] = [visitorId, orgId];
    let siteFilter = '';
    if (!isSuperAdmin) {
      historyParams.push(allowedSites);
      siteFilter = `AND v.site_id = ANY($${historyParams.length})`;
    }

    const visitsRes = await query(`
      SELECT 
        v.id, v.visit_code, v.site_id, v.visitor_type, v.purpose, v.status,
        v.expected_date, v.expected_time, v.check_in_time, v.check_out_time,
        s.name as site_name, s.code as site_code,
        e.first_name as host_first_name, e.last_name as host_last_name,
        d.name as department_name,
        vp.pass_number, vp.status as pass_status
      FROM visits v
      JOIN sites s ON v.site_id = s.id
      JOIN employees e ON v.host_employee_id = e.id
      JOIN departments d ON v.department_id = d.id
      LEFT JOIN visitor_passes vp ON vp.visit_id = v.id
      WHERE v.visitor_id = $1 AND v.organization_id = $2 ${siteFilter} AND v.deleted_at IS NULL
      ORDER BY v.created_at DESC
    `, historyParams);

    res.json({
      success: true,
      data: visitsRes.rows
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'HISTORY_FETCH_FAILED', message: 'Failed to retrieve visitor history.' } });
  }
});

// GET /api/visitors/:id - Profile and site-scoped past visits
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const visitorId = String(req.params.id);
    const orgId = req.user!.organizationId;
    const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';
    const allowedSites = req.user!.allowedSiteIds || [];

    const visitorRes = await query(`
      SELECT * FROM visitors WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL
    `, [visitorId, orgId]);

    if (visitorRes.rows.length === 0) {
      res.status(404).json({ success: false, error: { code: 'VISITOR_NOT_FOUND', message: 'Visitor profile not found.' } });
      return;
    }

    const visitor = visitorRes.rows[0];

    // Fetch visits history strictly scoped to user's authorized sites
    const visitsParams: any[] = [visitorId, orgId];
    let siteFilter = '';
    if (!isSuperAdmin) {
      visitsParams.push(allowedSites);
      siteFilter = `AND v.site_id = ANY($${visitsParams.length})`;
    }

    const visitsRes = await query(`
      SELECT 
        v.id, v.visit_code, v.site_id, v.visitor_type, v.purpose, v.status,
        v.expected_date, v.expected_time, v.check_in_time, v.check_out_time,
        s.name as site_name, s.code as site_code,
        e.first_name as host_first_name, e.last_name as host_last_name,
        d.name as department_name,
        vp.pass_number, vp.status as pass_status
      FROM visits v
      JOIN sites s ON v.site_id = s.id
      JOIN employees e ON v.host_employee_id = e.id
      JOIN departments d ON v.department_id = d.id
      LEFT JOIN visitor_passes vp ON vp.visit_id = v.id
      WHERE v.visitor_id = $1 AND v.organization_id = $2 ${siteFilter} AND v.deleted_at IS NULL
      ORDER BY v.created_at DESC
    `, visitsParams);

    // Mask internal notes and blacklist details for non-superadmins cross-site
    const safeVisitor = {
      ...visitor,
      notes: isSuperAdmin ? visitor.notes : null,
      blacklist_reason: isSuperAdmin ? visitor.blacklist_reason : (visitor.is_blacklisted ? 'Security Flag' : null),
      visits: visitsRes.rows,
    };

    res.json({
      success: true,
      data: safeVisitor,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'VISITOR_FETCH_FAILED', message: err.message } });
  }
});

// POST /api/visitors - Create or update reusable visitor profile
router.post('/', requirePermission('visitor:create'), async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      first_name, last_name, email, mobile_number, company_name, designation,
      default_visitor_type, id_type, id_number, photo_base64, notes
    } = req.body;
    const orgId = req.user!.organizationId;

    if (!first_name || !last_name || !mobile_number) {
      res.status(400).json({ success: false, error: { code: 'INVALID_INPUT', message: 'First name, last name, and mobile number are required.' } });
      return;
    }

    let photo_url: string | null = null;
    if (photo_base64 && photo_base64.startsWith('data:image')) {
      photo_url = await storageService.saveBase64Photo(photo_base64, 'visitor');
    }

    // Mask ID number if provided
    let id_number_masked: string | null = null;
    if (id_number && id_number.trim().length > 0) {
      const clean = id_number.trim();
      id_number_masked = clean.length > 4 ? `XXXX-XXXX-${clean.slice(-4)}` : clean;
    }

    const fullName = `${first_name.trim()} ${last_name.trim()}`;

    // Check if visitor with same mobile already exists in org
    const existing = await query(`
      SELECT id, photo_url FROM visitors WHERE organization_id = $1 AND mobile_number = $2 AND deleted_at IS NULL
    `, [orgId, mobile_number.trim()]);

    let resultVisitor;
    if (existing.rows.length > 0) {
      const vId = existing.rows[0].id;
      const finalPhoto = photo_url || existing.rows[0].photo_url;

      const updateRes = await query(`
        UPDATE visitors
        SET first_name = $1, last_name = $2, full_name = $3, email = $4,
            company_name = $5, designation = $6, default_visitor_type = $7,
            id_type = COALESCE($8, id_type), id_number_masked = COALESCE($9, id_number_masked),
            photo_url = COALESCE($10, photo_url), notes = COALESCE($11, notes), updated_at = NOW()
        WHERE id = $12
        RETURNING *
      `, [
        first_name.trim(), last_name.trim(), fullName, email || null,
        company_name || null, designation || null, default_visitor_type || 'Guest',
        id_type || null, id_number_masked, finalPhoto, notes || null, vId
      ]);
      resultVisitor = updateRes.rows[0];

      await logAudit({
        userId: req.user!.userId,
        organizationId: orgId,
        siteId: req.siteId,
        action: 'VISITOR_PROFILE_UPDATED',
        entityType: 'Visitor',
        entityId: String(vId),
        req,
        newValues: resultVisitor,
      });
    } else {
      const insertRes = await query(`
        INSERT INTO visitors (
          organization_id, first_name, last_name, full_name, email, mobile_number,
          company_name, designation, default_visitor_type, id_type, id_number_masked,
          photo_url, notes
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING *
      `, [
        orgId, first_name.trim(), last_name.trim(), fullName, email || null, mobile_number.trim(),
        company_name || null, designation || null, default_visitor_type || 'Guest',
        id_type || null, id_number_masked, photo_url, notes || null
      ]);
      resultVisitor = insertRes.rows[0];

      await logAudit({
        userId: req.user!.userId,
        organizationId: orgId,
        siteId: req.siteId,
        action: 'VISITOR_PROFILE_CREATED',
        entityType: 'Visitor',
        entityId: String(resultVisitor.id),
        req,
        newValues: resultVisitor,
      });
    }

    res.status(201).json({ success: true, message: 'Visitor profile saved successfully', data: resultVisitor });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'VISITOR_SAVE_FAILED', message: 'Failed to save visitor profile.' } });
  }
});

// POST /api/visitors/:id/blacklist - Blacklist or flag visitor
router.post('/:id/blacklist', requirePermission('visitor:blacklist'), async (req: Request, res: Response): Promise<void> => {
  try {
    const visitorId = String(req.params.id);
    const { is_blacklisted, blacklist_reason } = req.body;
    const orgId = req.user!.organizationId;

    await query(`
      UPDATE visitors
      SET is_blacklisted = $1, blacklist_reason = $2, updated_at = NOW()
      WHERE id = $3 AND organization_id = $4
    `, [Boolean(is_blacklisted), blacklist_reason || null, visitorId, orgId]);

    await logAudit({
      userId: req.user!.userId,
      organizationId: orgId,
      siteId: req.siteId,
      action: is_blacklisted ? 'VISITOR_BLACKLISTED' : 'VISITOR_UNBLACKLISTED',
      entityType: 'Visitor',
      entityId: visitorId,
      req,
      newValues: { is_blacklisted, blacklist_reason },
    });

    res.json({ success: true, message: `Visitor ${is_blacklisted ? 'blacklisted' : 'removed from blacklist'} successfully.` });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'BLACKLIST_UPDATE_FAILED', message: 'Failed to update visitor blacklist status.' } });
  }
});

export const visitorRouter = router;
