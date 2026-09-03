import { describe, it, before } from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { initDatabase, query } from '../src/database/db.js';
import { runSeed } from '../src/database/seed.js';

describe('VMS QR Pass Security & Privacy Tests', () => {
  let app: any;
  let superAdminToken: string;
  let siteASecurityToken: string;
  let siteBSecurityToken: string;

  const siteAId = '30000000-0000-0000-0000-000000000001'; // Baghpat
  const siteBId = '30000000-0000-0000-0000-000000000002'; // Basi
  const hostEmpAId = '80000000-0000-0000-0000-000000000001';
  const hostEmpBId = '80000000-0000-0000-0000-000000000002';

  let passASecureToken: string;
  let passAPassNumber: string;
  let passAVisitCode: string;
  let passAVisitId: string;

  let passBSecureToken: string;
  let passBPassNumber: string;
  let passBVisitCode: string;
  let passBVisitId: string;

  before(async () => {
    await initDatabase();
    await runSeed();
    app = createApp();

    // 1. Super Admin
    const superRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'superadmin@vms.local', password: 'Password@123' });
    superAdminToken = superRes.body.data.token;

    // 2. Site A Security
    const siteALogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'security@vms.local', password: 'Password@123' });
    siteASecurityToken = siteALogin.body.data.token;

    // 3. Create Site B Security
    const userBRes = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({
        email: `site_b_sec_qr_${Date.now()}@vms.local`,
        password: 'Password@123',
        first_name: 'Basi',
        last_name: 'Guard',
        role_id: '10000000-0000-0000-0000-000000000004',
        site_ids: [siteBId],
      });
    const siteBLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: userBRes.body.data.email, password: 'Password@123' });
    siteBSecurityToken = siteBLogin.body.data.token;

    // 4. Create Pass at Site A
    const regResA = await request(app)
      .post('/api/visits')
      .set('Authorization', `Bearer ${siteASecurityToken}`)
      .set('X-Site-Id', siteAId)
      .send({
        first_name: 'Manish',
        last_name: 'Gupta',
        mobile_number: '+91-9988112266',
        purpose: 'Vendor Meeting',
        visitor_type: 'Vendor',
        host_employee_id: hostEmpAId,
      });
    assert.strictEqual(regResA.status, 201);
    passASecureToken = regResA.body.data.qrToken || regResA.body.data.qr_token;
    passAPassNumber = regResA.body.data.passNumber || regResA.body.data.pass_number;
    passAVisitCode = regResA.body.data.visit_code;
    passAVisitId = regResA.body.data.id;

    // 5. Create Pass at Site B
    const regResB = await request(app)
      .post('/api/visits')
      .set('Authorization', `Bearer ${siteBSecurityToken}`)
      .set('X-Site-Id', siteBId)
      .send({
        first_name: 'Rajesh',
        last_name: 'Sharma',
        mobile_number: '+91-9988112288',
        purpose: 'Machine Overhaul',
        visitor_type: 'Contractor',
        host_employee_id: hostEmpBId,
      });
    assert.strictEqual(regResB.status, 201);
    passBSecureToken = regResB.body.data.qrToken || regResB.body.data.qr_token;
    passBPassNumber = regResB.body.data.passNumber || regResB.body.data.pass_number;
    passBVisitCode = regResB.body.data.visit_code;
    passBVisitId = regResB.body.data.id;
  });

  it('should not persist raw plaintext qr_token in the database', async () => {
    const passRow = await query(`
      SELECT qr_token, qr_token_hash FROM visitor_passes WHERE pass_number = $1
    `, [passAPassNumber]);

    assert.strictEqual(passRow.rows.length, 1);
    assert.strictEqual(passRow.rows[0].qr_token, null, 'qr_token in database MUST be null');
    assert.ok(passRow.rows[0].qr_token_hash, 'qr_token_hash in database MUST be populated');
    assert.strictEqual(passRow.rows[0].qr_token_hash.length, 64, 'SHA-256 hash must be 64 characters');
  });

  it('should reject verification attempts using pass_number or visit_code on public verify endpoint', async () => {
    const passNumRes = await request(app).get(`/api/passes/verify/${passAPassNumber}`);
    assert.strictEqual(passNumRes.status, 404);

    const visitCodeRes = await request(app).get(`/api/passes/verify/${passAVisitCode}`);
    assert.strictEqual(visitCodeRes.status, 404);
  });

  it('should verify with cryptographic token and mask PII for unauthenticated public viewers', async () => {
    const publicRes = await request(app).get(`/api/passes/verify/${passASecureToken}`);
    assert.strictEqual(publicRes.status, 200);
    assert.strictEqual(publicRes.body.data.isValid, true);
    // PII Masking
    assert.match(publicRes.body.data.visitorName, /M\*+ G\*+/, 'Name must be masked for public verification');
    assert.strictEqual(publicRes.body.data.visitId, undefined, 'Must not disclose internal visitId publicly');
    assert.strictEqual(publicRes.body.data.qrToken, undefined, 'Must not leak qrToken');
    assert.strictEqual(publicRes.body.data.mobile_number, undefined);
  });

  it('should return unmasked operational details for authenticated staff on verify endpoint', async () => {
    const authVerifyRes = await request(app)
      .get(`/api/passes/verify/${passASecureToken}`)
      .set('Authorization', `Bearer ${siteASecurityToken}`);

    assert.strictEqual(authVerifyRes.status, 200);
    assert.strictEqual(authVerifyRes.body.data.visitorName, 'Manish Gupta', 'Authorized staff receives unmasked name');
    assert.strictEqual(authVerifyRes.body.data.visitId, passAVisitId, 'Authorized staff receives visitId');
  });

  it('should allow Site A staff to scan Site A pass', async () => {
    const scanRes = await request(app)
      .get(`/api/passes/scan/${passASecureToken}`)
      .set('Authorization', `Bearer ${siteASecurityToken}`);

    assert.strictEqual(scanRes.status, 200);
    assert.strictEqual(scanRes.body.success, true);
    assert.strictEqual(scanRes.body.data.visitorName, 'Manish Gupta');
  });

  it('should strictly deny Site A staff from scanning Site B pass with 403 UNAUTHORIZED_SITE_ACCESS', async () => {
    // 1. Attempt scan using raw token
    const scanTokenRes = await request(app)
      .get(`/api/passes/scan/${passBSecureToken}`)
      .set('Authorization', `Bearer ${siteASecurityToken}`);
    assert.strictEqual(scanTokenRes.status, 403);
    assert.strictEqual(scanTokenRes.body.error.code, 'UNAUTHORIZED_SITE_ACCESS');

    // 2. Attempt scan using pass_number
    const scanPassNumRes = await request(app)
      .get(`/api/passes/scan/${passBPassNumber}`)
      .set('Authorization', `Bearer ${siteASecurityToken}`);
    assert.strictEqual(scanPassNumRes.status, 403);
    assert.strictEqual(scanPassNumRes.body.error.code, 'UNAUTHORIZED_SITE_ACCESS');

    // 3. Attempt scan using visit_code
    const scanVisitCodeRes = await request(app)
      .get(`/api/passes/scan/${passBVisitCode}`)
      .set('Authorization', `Bearer ${siteASecurityToken}`);
    assert.strictEqual(scanVisitCodeRes.status, 403);
    assert.strictEqual(scanVisitCodeRes.body.error.code, 'UNAUTHORIZED_SITE_ACCESS');
  });

  it('should allow SUPER_ADMIN to scan passes across all sites', async () => {
    const superScanRes = await request(app)
      .get(`/api/passes/scan/${passBSecureToken}`)
      .set('Authorization', `Bearer ${superAdminToken}`);

    assert.strictEqual(superScanRes.status, 200);
    assert.strictEqual(superScanRes.body.success, true);
    assert.strictEqual(superScanRes.body.data.visitorName, 'Rajesh Sharma');
  });

  it('should never expose qr_token in standard visits and passes API endpoints', async () => {
    // 1. GET /api/visits
    const visitsRes = await request(app)
      .get('/api/visits')
      .set('Authorization', `Bearer ${siteASecurityToken}`)
      .set('X-Site-Id', siteAId);
    assert.strictEqual(visitsRes.status, 200);
    const hasQrTokenInList = visitsRes.body.data.some((v: any) => v.qr_token !== undefined);
    assert.strictEqual(hasQrTokenInList, false, 'GET /api/visits must never expose qr_token');

    // 2. GET /api/visits/:id
    const visitDetailRes = await request(app)
      .get(`/api/visits/${passAVisitId}`)
      .set('Authorization', `Bearer ${siteASecurityToken}`)
      .set('X-Site-Id', siteAId);
    assert.strictEqual(visitDetailRes.status, 200);
    assert.strictEqual(visitDetailRes.body.data.qr_token, undefined, 'GET /api/visits/:id must never expose qr_token');

    // 3. GET /api/passes/:visitId
    const passDetailRes = await request(app)
      .get(`/api/passes/${passAVisitId}`)
      .set('Authorization', `Bearer ${siteASecurityToken}`);
    assert.strictEqual(passDetailRes.status, 200);
    assert.strictEqual(passDetailRes.body.data.qr_token, undefined, 'GET /api/passes/:visitId must never expose qr_token');
  });
});
