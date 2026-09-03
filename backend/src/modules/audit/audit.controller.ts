import { Request, Response, Router } from 'express';
import crypto from 'crypto';
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

/**
 * Deterministic JSON stringifier to guarantee identical canonical hashing regardless of key order.
 */
export function canonicalJson(obj: any): string {
  if (obj === null || obj === undefined) return '';
  if (typeof obj !== 'object') return String(obj);
  if (Array.isArray(obj)) {
    return '[' + obj.map(item => canonicalJson(item)).join(',') + ']';
  }
  const keys = Object.keys(obj).sort();
  return '{' + keys.map(k => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`).join(',') + '}';
}

/**
 * Recomputes SHA-256 event hash from canonical payload components.
 */
export function computeEventHash(params: {
  previousHash: string;
  timestamp: string;
  organizationId?: string | null;
  siteId?: string | null;
  userId?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  oldValues?: any;
  newValues?: any;
  metadata?: any;
}): string {
  const oldValStr = canonicalJson(params.oldValues);
  const newValStr = canonicalJson(params.newValues);
  const metaStr = canonicalJson(params.metadata);
  const payload = `${params.previousHash}|${params.timestamp}|${params.organizationId || ''}|${params.siteId || ''}|${params.userId || ''}|${params.action}|${params.entityType}|${params.entityId}|${oldValStr}|${newValStr}|${metaStr}`;
  return crypto.createHash('sha256').update(payload).digest('hex');
}

export async function logAudit(params: AuditParams): Promise<void> {
  try {
    const ip = params.req ? (params.req.headers['x-forwarded-for'] as string) || params.req.socket.remoteAddress : null;
    const userAgent = params.req ? params.req.headers['user-agent'] : null;

    // Cryptographic hash chain: retrieve previous event hash
    let previousHash = '0'.repeat(64);
    try {
      const latestRes = await query(`
        SELECT event_hash FROM audit_logs ORDER BY created_at DESC, id DESC LIMIT 1
      `);
      if (latestRes.rows.length > 0 && latestRes.rows[0].event_hash) {
        previousHash = latestRes.rows[0].event_hash;
      }
    } catch {
      // Fallback to genesis hash if query fails
    }

    const timestamp = new Date().toISOString();
    const eventHash = computeEventHash({
      previousHash,
      timestamp,
      organizationId: params.organizationId,
      siteId: params.siteId,
      userId: params.userId,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      oldValues: params.oldValues,
      newValues: params.newValues,
      metadata: params.metadata,
    });

    await query(`
      INSERT INTO audit_logs (
        organization_id, site_id, user_id, action, entity_type, entity_id,
        ip_address, user_agent, old_values, new_values, metadata, previous_hash, event_hash, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
    `, [
      params.organizationId || null,
      params.siteId || null,
      params.userId || null,
      params.action,
      params.entityType,
      params.entityId,
      ip,
      userAgent,
      params.oldValues ? (typeof params.oldValues === 'string' ? params.oldValues : JSON.stringify(params.oldValues)) : null,
      params.newValues ? (typeof params.newValues === 'string' ? params.newValues : JSON.stringify(params.newValues)) : null,
      params.metadata ? (typeof params.metadata === 'string' ? params.metadata : JSON.stringify(params.metadata)) : null,
      previousHash,
      eventHash,
      timestamp,
    ]);
  } catch (err: any) {
    console.error('Failed to write tamper-evident audit log:', err.message);
  }
}

const router = Router();
router.use(authMiddleware);

// GET /api/audit-logs/verify-chain - Cryptographic audit trail integrity verification with hash re-computation
router.get('/verify-chain', requirePermission('audit:view'), async (req: Request, res: Response): Promise<void> => {
  try {
    const logsRes = await query(`
      SELECT id, organization_id, site_id, user_id, action, entity_type, entity_id,
             old_values, new_values, metadata, previous_hash, event_hash, created_at
      FROM audit_logs
      ORDER BY created_at ASC, id ASC
    `);

    const logs = logsRes.rows.filter((l: any) => l.event_hash && l.previous_hash);
    let isValid = true;
    let brokenAt: string | null = null;
    let reason: string | null = null;

    for (let i = 0; i < logs.length; i++) {
      const curr = logs[i];

      const parseField = (val: any) => {
        if (!val) return null;
        if (typeof val === 'string') {
          try { return JSON.parse(val); } catch { return val; }
        }
        return val;
      };

      const recordTimestamp = curr.created_at ? new Date(curr.created_at).toISOString() : '';

      // 1. Reconstruct canonical payload and compute expected SHA-256 hash
      const expectedHash = computeEventHash({
        previousHash: curr.previous_hash,
        timestamp: recordTimestamp,
        organizationId: curr.organization_id,
        siteId: curr.site_id,
        userId: curr.user_id,
        action: curr.action,
        entityType: curr.entity_type,
        entityId: curr.entity_id,
        oldValues: parseField(curr.old_values),
        newValues: parseField(curr.new_values),
        metadata: parseField(curr.metadata),
      });

      if (curr.event_hash !== expectedHash) {
        isValid = false;
        brokenAt = curr.id;
        reason = `Event payload tampering detected at entry ${curr.id}. Expected ${expectedHash}, found ${curr.event_hash}`;
        break;
      }

      // 2. Verify hash chain continuity
      if (i > 0) {
        const prev = logs[i - 1];
        if (curr.previous_hash !== prev.event_hash) {
          isValid = false;
          brokenAt = curr.id;
          reason = `Chain continuity broken at entry ${curr.id}. Expected ${prev.event_hash}, found ${curr.previous_hash}`;
          break;
        }
      } else {
        if (curr.previous_hash !== '0'.repeat(64)) {
          isValid = false;
          brokenAt = curr.id;
          reason = `Genesis hash mismatch at entry ${curr.id}`;
          break;
        }
      }
    }

    res.json({
      success: true,
      data: {
        isChainIntact: isValid,
        totalEntries: logs.length,
        brokenAtEntryId: brokenAt,
        reason: reason || undefined,
        verifiedAt: new Date().toISOString(),
      }
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'VERIFY_CHAIN_FAILED', message: 'Failed to verify audit log integrity.' } });
  }
});

// GET /api/audit-logs - Scoped audit trail search
router.get('/', requirePermission('audit:view'), async (req: Request, res: Response) => {
  try {
    const { action, entityType, siteId, startDate, endDate, page = '1', limit = '50' } = req.query;
    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);
    const offset = (pageNum - 1) * limitNum;

    const conditions: string[] = ['1=1'];
    const params: any[] = [];

    // Scope to organization
    if (req.user?.organizationId && req.user.role !== 'SUPER_ADMIN') {
      params.push(req.user.organizationId);
      conditions.push(`(a.organization_id = $${params.length} OR a.organization_id IS NULL)`);
    }

    // Site filter with authorization check
    const targetSiteId = siteId || req.siteId;
    if (targetSiteId && req.user?.role !== 'SUPER_ADMIN') {
      if (!req.user!.allowedSiteIds.includes(String(targetSiteId))) {
        res.status(403).json({ success: false, error: { code: 'UNAUTHORIZED_SITE_ACCESS', message: 'Not authorized for this site audit logs.' } });
        return;
      }
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
        a.old_values, a.new_values, a.metadata, a.previous_hash, a.event_hash, a.created_at,
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
    res.status(500).json({ success: false, error: { code: 'AUDIT_FETCH_FAILED', message: 'Failed to retrieve audit trail.' } });
  }
});

export const auditRouter = router;
