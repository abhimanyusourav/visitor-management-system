import { Request, Response, Router } from 'express';
import { query } from '../../database/db.js';
import { authMiddleware } from '../../common/middleware/authMiddleware.js';
import { requirePermission } from '../../common/middleware/rbacMiddleware.js';

export interface AuditParams {
  userId?: string;
  organizationId?: string;
  siteId?: string;
  action: string;
  entityType: string;
  entityId: string;
  req?: Request;
  oldValues?: any;
  newValues?: any;
  metadata?: any;
}

export async function logAudit(params: AuditParams): Promise<void> {
  try {
    const ip = params.req ? (params.req.headers['x-forwarded-for'] as string) || params.req.socket.remoteAddress : null;
    const userAgent = params.req ? params.req.headers['user-agent'] : null;

    await query(`
      INSERT INTO audit_logs (
        organization_id, site_id, user_id, action, entity_type, entity_id,
        ip_address, user_agent, old_values, new_values, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    `, [
      params.organizationId || null,
      params.siteId || null,
      params.userId || null,
      params.action,
      params.entityType,
      params.entityId,
      ip,
      userAgent,
      params.oldValues ? JSON.stringify(params.oldValues) : null,
      params.newValues ? JSON.stringify(params.newValues) : null,
      params.metadata ? JSON.stringify(params.metadata) : null,
    ]);
  } catch (err: any) {
    console.error('Failed to write audit log:', err.message);
  }
}

const router = Router();
router.use(authMiddleware);

router.get('/', requirePermission('audit:view'), async (req: Request, res: Response) => {
  try {
    const { action, entityType, siteId, startDate, endDate, page = '1', limit = '50' } = req.query;
    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);
    const offset = (pageNum - 1) * limitNum;

    const conditions: string[] = ['1=1'];
    const params: any[] = [];

    // Scope to organization
    if (req.user?.organizationId) {
      params.push(req.user.organizationId);
      conditions.push(`(a.organization_id = $${params.length} OR a.organization_id IS NULL)`);
    }

    // Site filter
    const targetSiteId = siteId || req.siteId;
    if (targetSiteId && req.user?.role !== 'SUPER_ADMIN') {
      params.push(targetSiteId);
      conditions.push(`(a.site_id = $${params.length} OR a.site_id IS NULL)`);
    }

    if (action) {
      params.push(`%${action}%`);
      conditions.push(`a.action ILIKE $${params.length}`);
    }

    if (entityType) {
      params.push(entityType);
      conditions.push(`a.entity_type = $${params.length}`);
    }

    if (startDate) {
      params.push(startDate);
      conditions.push(`a.created_at >= $${params.length}`);
    }

    if (endDate) {
      params.push(endDate);
      conditions.push(`a.created_at <= $${params.length}`);
    }

    const whereClause = conditions.join(' AND ');

    const countRes = await query(`
      SELECT COUNT(*) as total
      FROM audit_logs a
      WHERE ${whereClause}
    `, params);

    const total = parseInt(countRes.rows[0]?.total || '0', 10);

    params.push(limitNum, offset);
    const dataRes = await query(`
      SELECT 
        a.id, a.action, a.entity_type, a.entity_id, a.ip_address, a.user_agent,
        a.old_values, a.new_values, a.metadata, a.created_at,
        u.first_name, u.last_name, u.email as user_email,
        s.name as site_name
      FROM audit_logs a
      LEFT JOIN users u ON a.user_id = u.id
      LEFT JOIN sites s ON a.site_id = s.id
      WHERE ${whereClause}
      ORDER BY a.created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `, params);

    res.json({
      success: true,
      data: dataRes.rows,
      meta: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      }
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'AUDIT_FETCH_FAILED', message: err.message } });
  }
});

export const auditRouter = router;
