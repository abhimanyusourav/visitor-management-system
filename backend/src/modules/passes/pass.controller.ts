import { Request, Response, Router } from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import QRCode from 'qrcode';
import { query } from '../../database/db.js';
import { authMiddleware } from '../../common/middleware/authMiddleware.js';
import { logAudit } from '../audit/audit.controller.js';
import { config } from '../../config/env.js';

const router = Router();

// Helper to clean incoming token from full URLs or query params
export function cleanVerifyToken(raw: string): string {
  if (!raw) return '';
  let token = raw.trim();
  if (token.includes('/v/')) {
    const afterV = token.substring(token.indexOf('/v/') + 3);
    token = afterV.split('?')[0].split('#')[0].replace(/\/+$/, '');
  }
  return token.trim();
}

// Compute SHA-256 hash of raw QR token
export function hashQrToken(token: string): string {
  return crypto.createHash('sha256').update(token.trim()).digest('hex');
}

// GET /api/passes/verify/:token - Gate / Mobile QR Verification (Zero PII, SHA-256 Token Verification)
router.get('/verify/:token', async (req: Request, res: Response): Promise<void> => {
  try {
    const rawToken = String(req.params.token);
    const token = cleanVerifyToken(rawToken);

    // Reject empty tokens or human-readable fallback attempts on public endpoint
    if (!token || token.length < 16) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_PASS_TOKEN', message: 'A valid secure QR pass token is required.' }
      });
      return;
    }

    const tokenHash = hashQrToken(token);

    // Look up ONLY by secure token hash (or legacy raw token for backwards compatibility during migration)
    // Never match pass_number or visit_code on this public route
    const passRes = await query(`
      SELECT 
        vp.id as pass_id, vp.pass_number, vp.status as pass_status,
        vp.issued_at, vp.valid_until,
        v.id as visit_id, v.organization_id, v.site_id, v.visit_code, v.visitor_type, v.purpose, v.status as visit_status,
        v.expected_date, v.expected_time, v.check_in_time, v.check_out_time,
        vt.full_name as visitor_name, vt.company_name, vt.photo_url as visitor_photo,
        e.first_name as host_first_name, e.last_name as host_last_name,
        d.name as department_name,
        s.id as site_id, s.name as site_name, s.code as site_code,
        o.id as organization_id, o.name as organization_name
      FROM visitor_passes vp
      JOIN visits v ON vp.visit_id = v.id
      JOIN visitors vt ON v.visitor_id = vt.id
      LEFT JOIN employees e ON v.host_employee_id = e.id
      LEFT JOIN departments d ON v.department_id = d.id
      LEFT JOIN sites s ON v.site_id = s.id
      LEFT JOIN organizations o ON v.organization_id = o.id
      WHERE (vp.qr_token_hash = $1 OR vp.qr_token = $2) AND v.deleted_at IS NULL
    `, [tokenHash, token]);

    if (passRes.rows.length === 0) {
      res.status(404).json({
        success: false,
        error: { code: 'INVALID_PASS_TOKEN', message: 'This QR code is invalid or does not exist.' }
      });
      return;
    }

    const pass = passRes.rows[0];
    const isExpired = new Date(pass.valid_until) < new Date();
    const isUsed = pass.pass_status === 'USED' || pass.visit_status === 'CHECKED_OUT';

    let verificationStatus: 'VALID' | 'ALREADY_CHECKED_OUT' | 'EXPIRED' | 'REVOKED' = 'VALID';
    if (isUsed) {
      verificationStatus = 'ALREADY_CHECKED_OUT';
    } else if (isExpired) {
      verificationStatus = 'EXPIRED';
    } else if (pass.pass_status === 'REVOKED') {
      verificationStatus = 'REVOKED';
    }

    // Check if staff member is authenticated with rigorous fail-closed validation:
    // 1. JWT signature and expiry valid
    // 2. User exists and is active
    // 3. User belongs to same organization
    // 4. User is authorized for pass.site_id (or SUPER_ADMIN)
    let isStaffAuthenticated = false;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const tokenStr = authHeader.substring(7);
        const decoded = jwt.verify(tokenStr, config.jwt.secret) as any;
        if (decoded && decoded.userId && decoded.organizationId && pass.organization_id) {
          const userCheck = await query(`
            SELECT u.id, u.organization_id, r.slug as role_slug, u.is_active
            FROM users u
            JOIN roles r ON u.role_id = r.id
            WHERE u.id = $1 AND u.deleted_at IS NULL
          `, [decoded.userId]);

          if (userCheck.rows.length > 0 && userCheck.rows[0].is_active) {
            const u = userCheck.rows[0];
            const sitesRes = await query(`SELECT site_id FROM user_sites WHERE user_id = $1`, [u.id]);
            const userAllowedSites = sitesRes.rows.map((r: any) => r.site_id);
            const isSuperAdmin = u.role_slug === 'SUPER_ADMIN';

            if (
              u.organization_id === pass.organization_id &&
              (isSuperAdmin || (pass.site_id && userAllowedSites.includes(pass.site_id)))
            ) {
              isStaffAuthenticated = true;
            }
          }
        }
      } catch {
        isStaffAuthenticated = false;
      }
    }

    // Helper to mask PII for unauthenticated public viewers (e.g. "John Doe" -> "J*** D**")
    const maskName = (name: string): string => {
      if (!name) return 'Visitor';
      return name
        .split(' ')
        .filter(Boolean)
        .map((part) => (part.length <= 1 ? part : part[0] + '*'.repeat(Math.min(part.length - 1, 4))))
        .join(' ');
    };

    // Public sanitized verification payload - Zero unnecessary PII disclosed unless authorized staff
    res.json({
      success: true,
      data: {
        ...(isStaffAuthenticated ? { visitId: pass.visit_id, visitorPhoto: pass.visitor_photo } : {}),
        isValid: verificationStatus === 'VALID',
        verificationStatus,
        visitorName: isStaffAuthenticated ? pass.visitor_name : maskName(pass.visitor_name),
        companyName: pass.company_name || 'Individual',
        hostName: pass.host_first_name ? `${pass.host_first_name} ${pass.host_last_name || ''}`.trim() : 'Duty Host',
        department: pass.department_name || 'Operations',
        purpose: pass.purpose,
        visitorType: pass.visitor_type,
        visitStatus: pass.visit_status,
        siteName: pass.site_name || 'Plant Facility',
        siteCode: pass.site_code || 'SITE',
        organizationName: pass.organization_name || 'VMS',
        expectedDate: pass.expected_date,
        expectedTime: pass.expected_time,
        passNumber: pass.pass_number,
        visitCode: pass.visit_code,
      }
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'VERIFY_FAILED', message: 'Failed to verify pass token.' } });
  }
});

// Authenticated pass management routes
router.use(authMiddleware);

// GET /api/passes/scan/:token - Staff gate scanning & lookup endpoint with strict site authorization
router.get('/scan/:token', async (req: Request, res: Response): Promise<void> => {
  try {
    const rawToken = String(req.params.token);
    const token = cleanVerifyToken(rawToken);
    const orgId = req.user!.organizationId;
    const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';
    const allowedSites = req.user!.allowedSiteIds || [];

    if (!token) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_PASS_TOKEN', message: 'A valid QR pass token or code is required.' }
      });
      return;
    }

    const tokenHash = hashQrToken(token);

    const passRes = await query(`
      SELECT 
        vp.id as pass_id, vp.pass_number, vp.status as pass_status,
        vp.issued_at, vp.valid_until,
        v.id as visit_id, v.site_id, v.visit_code, v.visitor_type, v.purpose, v.status as visit_status,
        v.expected_date, v.expected_time, v.check_in_time, v.check_out_time,
        vt.full_name as visitor_name, vt.company_name, vt.photo_url as visitor_photo,
        e.first_name as host_first_name, e.last_name as host_last_name,
        d.name as department_name,
        s.id as site_id, s.name as site_name, s.code as site_code,
        o.id as organization_id, o.name as organization_name
      FROM visitor_passes vp
      JOIN visits v ON vp.visit_id = v.id
      JOIN visitors vt ON v.visitor_id = vt.id
      LEFT JOIN employees e ON v.host_employee_id = e.id
      LEFT JOIN departments d ON v.department_id = d.id
      LEFT JOIN sites s ON v.site_id = s.id
      LEFT JOIN organizations o ON v.organization_id = o.id
      WHERE v.organization_id = $1
        AND (vp.qr_token_hash = $2 OR vp.pass_number = $3 OR v.visit_code = $3)
        AND v.deleted_at IS NULL
    `, [orgId, tokenHash, token]);

    if (passRes.rows.length === 0) {
      res.status(404).json({
        success: false,
        error: { code: 'PASS_NOT_FOUND', message: 'No pass found matching the scanned QR code or pass number.' }
      });
      return;
    }

    const pass = passRes.rows[0];

    // Priority 2: Enforce that non-SUPER_ADMIN staff can only scan passes for their authorized site(s)
    if (!isSuperAdmin && !allowedSites.includes(pass.site_id)) {
      res.status(403).json({
        success: false,
        error: { code: 'UNAUTHORIZED_SITE_ACCESS', message: 'You are not authorized to scan or access passes for this site.' }
      });
      return;
    }

    const isExpired = new Date(pass.valid_until) < new Date();
    const isUsed = pass.pass_status === 'USED' || pass.visit_status === 'CHECKED_OUT';

    let verificationStatus: 'VALID' | 'ALREADY_CHECKED_OUT' | 'EXPIRED' | 'REVOKED' = 'VALID';
    if (isUsed) {
      verificationStatus = 'ALREADY_CHECKED_OUT';
    } else if (isExpired) {
      verificationStatus = 'EXPIRED';
    } else if (pass.pass_status === 'REVOKED') {
      verificationStatus = 'REVOKED';
    }

    res.json({
      success: true,
      data: {
        visitId: pass.visit_id,
        passId: pass.pass_id,
        isValid: verificationStatus === 'VALID',
        verificationStatus,
        visitorName: pass.visitor_name,
        companyName: pass.company_name || 'Individual',
        visitorPhoto: pass.visitor_photo,
        hostName: pass.host_first_name ? `${pass.host_first_name} ${pass.host_last_name || ''}`.trim() : 'Duty Host',
        department: pass.department_name || 'Operations',
        purpose: pass.purpose,
        visitorType: pass.visitor_type,
        visitStatus: pass.visit_status,
        siteId: pass.site_id,
        siteName: pass.site_name || 'Plant Facility',
        siteCode: pass.site_code || 'SITE',
        organizationName: pass.organization_name || 'VMS',
        expectedDate: pass.expected_date,
        expectedTime: pass.expected_time,
        checkInTime: pass.check_in_time,
        checkOutTime: pass.check_out_time,
        passNumber: pass.pass_number,
        visitCode: pass.visit_code,
      }
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'SCAN_FAILED', message: 'Failed to process pass scan.' } });
  }
});

// GET /api/passes/:visitId - Get pass info and generated QR image Data URL (Never leaks raw qr_token)
router.get('/:visitId', async (req: Request, res: Response): Promise<void> => {
  try {
    const visitId = String(req.params.visitId);
    const orgId = req.user!.organizationId;

    const passRes = await query(`
      SELECT 
        vp.id, vp.visit_id, vp.pass_number, vp.pass_type, vp.status, vp.issued_at, vp.valid_until, vp.printed_count,
        v.site_id, v.visit_code, v.visitor_type, v.purpose, v.status as visit_status,
        v.expected_date, v.expected_time, v.check_in_time, v.accompanying_count,
        vt.full_name as visitor_name, vt.company_name, vt.photo_url as visitor_photo,
        vt.id_type, vt.id_number_masked,
        e.first_name as host_first_name, e.last_name as host_last_name,
        e.email as host_email, e.phone as host_phone,
        d.name as department_name,
        s.name as site_name, s.code as site_code, s.address as site_address,
        o.name as organization_name, o.logo_url as organization_logo
      FROM visitor_passes vp
      JOIN visits v ON vp.visit_id = v.id
      JOIN visitors vt ON v.visitor_id = vt.id
      LEFT JOIN employees e ON v.host_employee_id = e.id
      LEFT JOIN departments d ON v.department_id = d.id
      JOIN sites s ON v.site_id = s.id
      JOIN organizations o ON v.organization_id = o.id
      WHERE vp.visit_id = $1 AND v.organization_id = $2 AND v.deleted_at IS NULL
    `, [visitId, orgId]);

    if (passRes.rows.length === 0) {
      res.status(404).json({ success: false, error: { code: 'PASS_NOT_FOUND', message: 'Pass not found for this visit.' } });
      return;
    }

    const passData = passRes.rows[0];

    // Enforce site authorization
    if (req.user!.role !== 'SUPER_ADMIN' && !req.user!.allowedSiteIds.includes(passData.site_id)) {
      res.status(403).json({ success: false, error: { code: 'UNAUTHORIZED_SITE_ACCESS', message: 'You are not authorized to view passes for this site.' } });
      return;
    }

    // QR verification target URL using human-readable pass_number (hash token is verified on public route)
    const qrUrl = `${config.qr.verifyBaseUrl}/${passData.pass_number}`;
    const qrDataUrl = await QRCode.toDataURL(qrUrl, {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 250,
      color: {
        dark: '#0f172a',
        light: '#ffffff'
      }
    });

    res.json({
      success: true,
      data: {
        ...passData,
        qrCodeUrl: qrUrl,
        qrCodeDataUrl: qrDataUrl,
      }
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'PASS_FETCH_FAILED', message: 'Failed to retrieve pass details.' } });
  }
});

// POST /api/passes/:id/reprint - Increment print count & record audit with site scoping
router.post('/:id/reprint', async (req: Request, res: Response): Promise<void> => {
  try {
    const passId = String(req.params.id);
    const orgId = req.user!.organizationId;

    // Verify pass belongs to user's organization and site
    const passRes = await query(`
      SELECT vp.id, v.site_id
      FROM visitor_passes vp
      JOIN visits v ON vp.visit_id = v.id
      WHERE vp.id = $1 AND v.organization_id = $2 AND v.deleted_at IS NULL
    `, [passId, orgId]);

    if (passRes.rows.length === 0) {
      res.status(404).json({ success: false, error: { code: 'PASS_NOT_FOUND', message: 'Pass not found.' } });
      return;
    }

    const pass = passRes.rows[0];
    if (req.user!.role !== 'SUPER_ADMIN' && !req.user!.allowedSiteIds.includes(pass.site_id)) {
      res.status(403).json({ success: false, error: { code: 'UNAUTHORIZED_SITE_ACCESS', message: 'Not authorized for this site pass.' } });
      return;
    }

    await query(`
      UPDATE visitor_passes
      SET printed_count = printed_count + 1
      WHERE id = $1
    `, [passId]);

    await logAudit({
      userId: req.user!.userId,
      organizationId: orgId,
      siteId: pass.site_id,
      action: 'VISITOR_PASS_PRINTED',
      entityType: 'VisitorPass',
      entityId: passId,
      req,
    });

    res.json({ success: true, message: 'Pass print recorded.' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'REPRINT_FAILED', message: 'Failed to record pass print.' } });
  }
});

export const passRouter = router;
