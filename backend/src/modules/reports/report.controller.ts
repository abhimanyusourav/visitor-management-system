import { Request, Response, Router } from 'express';
import { query } from '../../database/db.js';
import { authMiddleware } from '../../common/middleware/authMiddleware.js';
import { siteContextMiddleware } from '../../common/middleware/siteContextMiddleware.js';
import { requirePermission } from '../../common/middleware/rbacMiddleware.js';

const router = Router();
router.use(authMiddleware);
router.use(siteContextMiddleware);

// GET /api/dashboard/stats - Fast Summary Cards
router.get('/dashboard/stats', async (req: Request, res: Response): Promise<void> => {
  try {
    const orgId = req.user!.organizationId;
    const siteId = req.siteId;

    const conditions: string[] = ['organization_id = $1', 'deleted_at IS NULL'];
    const params: any[] = [orgId];

    if (siteId) {
      params.push(siteId);
      conditions.push(`site_id = $${params.length}`);
    }

    const where = conditions.join(' AND ');

    // 1. Today's Total
    const todayRes = await query(`
      SELECT COUNT(*) as total FROM visits WHERE ${where} AND expected_date = CURRENT_DATE
    `, params);

    // 2. Currently Inside
    const insideRes = await query(`
      SELECT COUNT(*) as total FROM visits WHERE ${where} AND status = 'CHECKED_IN'
    `, params);

    // 3. Expected Today
    const expectedRes = await query(`
      SELECT COUNT(*) as total FROM visits WHERE ${where} AND expected_date = CURRENT_DATE AND status IN ('REGISTERED', 'APPROVED')
    `, params);

    // 4. Pending Approval
    const pendingRes = await query(`
      SELECT COUNT(*) as total FROM visits WHERE ${where} AND status = 'PENDING_APPROVAL'
    `, params);

    // 5. Checked Out Today
    const checkedOutRes = await query(`
      SELECT COUNT(*) as total FROM visits WHERE ${where} AND status = 'CHECKED_OUT' AND DATE(check_out_time) = CURRENT_DATE
    `, params);

    // 6. Contractors currently inside
    const contractorRes = await query(`
      SELECT COUNT(*) as total FROM visits WHERE ${where} AND status = 'CHECKED_IN' AND visitor_type = 'Contractor'
    `, params);

    res.json({
      success: true,
      data: {
        todayVisitors: parseInt(todayRes.rows[0]?.total || '0', 10),
        currentlyInside: parseInt(insideRes.rows[0]?.total || '0', 10),
        expectedToday: parseInt(expectedRes.rows[0]?.total || '0', 10),
        pendingApproval: parseInt(pendingRes.rows[0]?.total || '0', 10),
        checkedOutToday: parseInt(checkedOutRes.rows[0]?.total || '0', 10),
        contractorsInside: parseInt(contractorRes.rows[0]?.total || '0', 10),
      }
    });
  } catch (err: any) {
    console.error('Dashboard stats error:', err);
    res.status(500).json({ success: false, error: { code: 'DASHBOARD_STATS_FAILED', message: 'Failed to retrieve dashboard metrics.' } });
  }
});

// GET /api/dashboard/charts - Analytical Charts Breakdown
router.get('/dashboard/charts', async (req: Request, res: Response): Promise<void> => {
  try {
    const orgId = req.user!.organizationId;
    const siteId = req.siteId;

    const conditions: string[] = ['organization_id = $1', 'deleted_at IS NULL'];
    const params: any[] = [orgId];

    if (siteId) {
      params.push(siteId);
      conditions.push(`site_id = $${params.length}`);
    }

    const where = conditions.join(' AND ');

    // 1. Last 7 days visitor trends
    const trendRes = await query(`
      SELECT expected_date::text as date, COUNT(*) as count
      FROM visits
      WHERE ${where} AND expected_date >= CURRENT_DATE - INTERVAL '6 days'
      GROUP BY expected_date
      ORDER BY expected_date ASC
    `, params);

    // 2. Breakdown by Department
    const deptConditions = conditions.map(c => `v.${c}`).join(' AND ');
    const deptRes = await query(`
      SELECT d.name as department, COUNT(v.id) as count
      FROM visits v
      JOIN departments d ON v.department_id = d.id
      WHERE ${deptConditions}
      GROUP BY d.name
      ORDER BY count DESC
      LIMIT 6
    `, params);

    // 3. Breakdown by Visitor Type
    const typeRes = await query(`
      SELECT visitor_type, COUNT(*) as count
      FROM visits
      WHERE ${where}
      GROUP BY visitor_type
      ORDER BY count DESC
    `, params);

    // 4. Breakdown by Purpose
    const purposeRes = await query(`
      SELECT purpose, COUNT(*) as count
      FROM visits
      WHERE ${where}
      GROUP BY purpose
      ORDER BY count DESC
      LIMIT 5
    `, params);

    res.json({
      success: true,
      data: {
        visitsByDay: trendRes.rows,
        visitsByDepartment: deptRes.rows,
        visitorTypeDistribution: typeRes.rows,
        visitsByPurpose: purposeRes.rows,
      }
    });
  } catch (err: any) {
    console.error('Dashboard charts error:', err);
    res.status(500).json({ success: false, error: { code: 'DASHBOARD_CHARTS_FAILED', message: 'Failed to retrieve chart analytics.' } });
  }
});

// GET /api/reports/visitor-log - Detailed Multi-Parametric Report
router.get('/visitor-log', requirePermission('report:view'), async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      startDate, endDate, siteId, visitorType, departmentId, hostId, status,
      page = '1', limit = '50'
    } = req.query;

    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);
    const offset = (pageNum - 1) * limitNum;

    const orgId = req.user!.organizationId;
    const targetSiteId = siteId || req.siteId;

    const conditions: string[] = ['v.organization_id = $1', 'v.deleted_at IS NULL'];
    const params: any[] = [orgId];

    if (targetSiteId && req.user!.role !== 'SUPER_ADMIN') {
      params.push(targetSiteId);
      conditions.push(`v.site_id = $${params.length}`);
    }

    if (startDate) {
      params.push(startDate);
      conditions.push(`v.expected_date >= $${params.length}`);
    }

    if (endDate) {
      params.push(endDate);
      conditions.push(`v.expected_date <= $${params.length}`);
    }

    if (visitorType) {
      params.push(visitorType);
      conditions.push(`v.visitor_type = $${params.length}`);
    }

    if (departmentId) {
      params.push(departmentId);
      conditions.push(`v.department_id = $${params.length}`);
    }

    if (hostId) {
      params.push(hostId);
      conditions.push(`v.host_employee_id = $${params.length}`);
    }

    if (status) {
      params.push(status);
      conditions.push(`v.status = $${params.length}`);
    }

    const where = conditions.join(' AND ');

    const countRes = await query(`
      SELECT COUNT(*) as total
      FROM visits v
      WHERE ${where}
    `, params);
    const total = parseInt(countRes.rows[0]?.total || '0', 10);

    params.push(limitNum, offset);
    const reportRes = await query(`
      SELECT 
        v.id, v.visit_code, v.visitor_type, v.purpose, v.status,
        v.expected_date, v.expected_time, v.check_in_time, v.check_out_time,
        v.accompanying_count,
        vt.full_name as visitor_name, vt.mobile_number, vt.company_name,
        (e.first_name || ' ' || e.last_name) as host_name,
        d.name as department_name,
        s.name as site_name, s.code as site_code,
        vp.pass_number,
        vv.vehicle_number
      FROM visits v
      JOIN visitors vt ON v.visitor_id = vt.id
      JOIN employees e ON v.host_employee_id = e.id
      JOIN departments d ON v.department_id = d.id
      JOIN sites s ON v.site_id = s.id
      LEFT JOIN visitor_passes vp ON vp.visit_id = v.id
      LEFT JOIN visit_vehicles vv ON vv.visit_id = v.id
      WHERE ${where}
      ORDER BY v.created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `, params);

    res.json({
      success: true,
      data: reportRes.rows,
      meta: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      }
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'REPORT_FETCH_FAILED', message: 'Failed to generate visitor log report.' } });
  }
});

// GET /api/reports/export/csv - CSV Stream
router.get('/export/csv', requirePermission('report:export'), async (req: Request, res: Response): Promise<void> => {
  try {
    const { startDate, endDate, siteId, visitorType, status } = req.query;
    const orgId = req.user!.organizationId;
    const targetSiteId = siteId || req.siteId;

    const conditions: string[] = ['v.organization_id = $1', 'v.deleted_at IS NULL'];
    const params: any[] = [orgId];

    if (targetSiteId && req.user!.role !== 'SUPER_ADMIN') {
      params.push(targetSiteId);
      conditions.push(`v.site_id = $${params.length}`);
    }

    if (startDate) {
      params.push(startDate);
      conditions.push(`v.expected_date >= $${params.length}`);
    }

    if (endDate) {
      params.push(endDate);
      conditions.push(`v.expected_date <= $${params.length}`);
    }

    if (visitorType) {
      params.push(visitorType);
      conditions.push(`v.visitor_type = $${params.length}`);
    }

    if (status) {
      params.push(status);
      conditions.push(`v.status = $${params.length}`);
    }

    const where = conditions.join(' AND ');

    const rowsRes = await query(`
      SELECT 
        v.visit_code, vt.full_name as visitor_name, vt.company_name, vt.mobile_number,
        v.visitor_type, v.purpose, (e.first_name || ' ' || e.last_name) as host_name,
        d.name as department, s.name as site, v.status,
        v.expected_date, v.check_in_time, v.check_out_time,
        vp.pass_number, vv.vehicle_number
      FROM visits v
      JOIN visitors vt ON v.visitor_id = vt.id
      JOIN employees e ON v.host_employee_id = e.id
      JOIN departments d ON v.department_id = d.id
      JOIN sites s ON v.site_id = s.id
      LEFT JOIN visitor_passes vp ON vp.visit_id = v.id
      LEFT JOIN visit_vehicles vv ON vv.visit_id = v.id
      WHERE ${where}
      ORDER BY v.created_at DESC
      LIMIT 5000
    `, params);

    const headers = ['Visit Code', 'Visitor Name', 'Company', 'Mobile', 'Visitor Type', 'Purpose', 'Host', 'Department', 'Site', 'Status', 'Date', 'Check In Time', 'Check Out Time', 'Pass Number', 'Vehicle Number'];
    
    let csv = headers.join(',') + '\n';
    for (const r of rowsRes.rows) {
      const line = [
        `"${r.visit_code || ''}"`,
        `"${(r.visitor_name || '').replace(/"/g, '""')}"`,
        `"${(r.company_name || '').replace(/"/g, '""')}"`,
        `"${r.mobile_number || ''}"`,
        `"${r.visitor_type || ''}"`,
        `"${(r.purpose || '').replace(/"/g, '""')}"`,
        `"${(r.host_name || '').replace(/"/g, '""')}"`,
        `"${(r.department || '').replace(/"/g, '""')}"`,
        `"${(r.site || '').replace(/"/g, '""')}"`,
        `"${r.status || ''}"`,
        `"${r.expected_date || ''}"`,
        `"${r.check_in_time || ''}"`,
        `"${r.check_out_time || ''}"`,
        `"${r.pass_number || ''}"`,
        `"${r.vehicle_number || ''}"`,
      ].join(',');
      csv += line + '\n';
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=vms_report_${Date.now()}.csv`);
    res.send(csv);
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'CSV_EXPORT_FAILED', message: 'Failed to export CSV report.' } });
  }
});

export const reportRouter = router;
