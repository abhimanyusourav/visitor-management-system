import { Request, Response, Router } from 'express';
import QRCode from 'qrcode';
import { query } from '../../database/db.js';
import { authMiddleware } from '../../common/middleware/authMiddleware.js';
import { logAudit } from '../audit/audit.controller.js';
import { config } from '../../config/env.js';

const router = Router();

// Helper to clean incoming token
function cleanVerifyToken(raw: string): string {
  if (!raw) return '';
  let token = raw.trim();
  if (token.includes('/v/')) {
    const afterV = token.substring(token.indexOf('/v/') + 3);
    token = afterV.split('?')[0].split('#')[0].replace(/\/+$/, '');
  }
  return token.trim();
}

// GET /api/passes/verify/:token - Gate / Mobile QR Verification (Zero PII leakage)
router.get('/verify/:token', async (req: Request, res: Response): Promise<void> => {
  try {
    const rawToken = String(req.params.token);
    const token = cleanVerifyToken(rawToken);

    if (!token) {
      res.status(400).json({
        success: false,
        error: { code: 'EMPTY_PASS_TOKEN', message: 'Pass token is required.' }
      });
      return;
    }

    const passRes = await query(`
      SELECT 
        vp.id as pass_id, vp.pass_number, vp.qr_token, vp.status as pass_status,
        vp.issued_at, vp.valid_until,
        v.id as visit_id, v.visit_code, v.visitor_type, v.purpose, v.status as visit_status,
        v.expected_date, v.expected_time, v.check_in_time, v.check_out_time,
        vt.full_name as visitor_name, vt.company_name, vt.photo_url as visitor_photo,
        e.first_name as host_first_name, e.last_name as host_last_name,
        d.name as department_name,
        s.id as site_id, s.name as site_name, s.code as site_code,
        o.name as organization_name
      FROM visitor_passes vp
      JOIN visits v ON vp.visit_id = v.id
      JOIN visitors vt ON v.visitor_id = vt.id
      LEFT JOIN employees e ON v.host_employee_id = e.id
      LEFT JOIN departments d ON v.department_id = d.id
      LEFT JOIN sites s ON v.site_id = s.id
      LEFT JOIN organizations o ON v.organization_id = o.id
      WHERE vp.qr_token = $1 OR vp.pass_number = $1 OR v.visit_code = $1
    `, [token]);

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

    res.json({
      success: true,
      data: {
        verificationStatus,
        isValid: verificationStatus === 'VALID',
        passNumber: pass.pass_number,
        visitCode: pass.visit_code,
        qrToken: pass.qr_token,
        visitorName: pass.visitor_name,
        companyName: pass.company_name,
        visitorPhoto: pass.visitor_photo,
        hostName: pass.host_first_name ? `${pass.host_first_name} ${pass.host_last_name || ''}`.trim() : 'Duty Host',
        department: pass.department_name || 'General Operations',
        purpose: pass.purpose,
        visitorType: pass.visitor_type,
        visitStatus: pass.visit_status,
        siteName: pass.site_name || 'Main Plant',
        siteCode: pass.site_code || 'SITE',
        organizationName: pass.organization_name || 'VMS',
        checkInTime: pass.check_in_time,
        checkOutTime: pass.check_out_time,
        visitId: pass.visit_id,
      }
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'VERIFY_FAILED', message: err.message } });
  }
});

// Authenticated pass management routes
router.use(authMiddleware);

// GET /api/passes/:visitId - Get pass info and generated QR image Data URL
router.get('/:visitId', async (req: Request, res: Response): Promise<void> => {
  try {
    const visitId = String(req.params.visitId);
    const orgId = req.user!.organizationId;

    const passRes = await query(`
      SELECT 
        vp.*,
        v.visit_code, v.visitor_type, v.purpose, v.status as visit_status,
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
      JOIN employees e ON v.host_employee_id = e.id
      JOIN departments d ON v.department_id = d.id
      JOIN sites s ON v.site_id = s.id
      JOIN organizations o ON v.organization_id = o.id
      WHERE vp.visit_id = $1 AND v.organization_id = $2
    `, [visitId, orgId]);

    if (passRes.rows.length === 0) {
      res.status(404).json({ success: false, error: { code: 'PASS_NOT_FOUND', message: 'Pass not found for this visit.' } });
      return;
    }

    const passData = passRes.rows[0];

    // Generate high-quality QR code data URL
    const qrUrl = `${config.qr.verifyBaseUrl}/${passData.qr_token}`;
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
    res.status(500).json({ success: false, error: { code: 'PASS_FETCH_FAILED', message: err.message } });
  }
});

// POST /api/passes/:id/reprint - Increment print count & record audit
router.post('/:id/reprint', async (req: Request, res: Response): Promise<void> => {
  try {
    const passId = String(req.params.id);

    await query(`
      UPDATE visitor_passes
      SET printed_count = printed_count + 1
      WHERE id = $1
    `, [passId]);

    await logAudit({
      userId: req.user!.userId,
      organizationId: req.user!.organizationId,
      siteId: req.siteId,
      action: 'VISITOR_PASS_PRINTED',
      entityType: 'VisitorPass',
      entityId: passId,
      req,
    });

    res.json({ success: true, message: 'Pass print recorded.' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'REPRINT_FAILED', message: err.message } });
  }
});

export const passRouter = router;
