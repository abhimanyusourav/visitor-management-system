import { describe, it, before } from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { initDatabase } from '../src/database/db.js';
import { runSeed } from '../src/database/seed.js';

describe('VMS Visits & Gate Operations Workflow Tests', () => {
  let app: any;
  let securityToken: string;
  let baghpatSiteId: string;
  let hostEmployeeId: string;

  before(async () => {
    await initDatabase();
    await runSeed();
    app = createApp();

    // Authenticate as gate security user
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'security@vms.local',
        password: 'Password@123'
      });

    securityToken = loginRes.body.data.token;
    baghpatSiteId = loginRes.body.data.user.authorizedSites[0].id;

    // Authenticate as superadmin to register a department and host employee for the test workflow
    const superAdminRes = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'superadmin@vms.local',
        password: 'Password@123',
      });
    const superToken = superAdminRes.body.data.token;

    const suffix = Math.floor(Math.random() * 1000000);
    const createDeptRes = await request(app)
      .post('/api/departments')
      .set('Authorization', `Bearer ${superToken}`)
      .send({
        name: `IT Engineering & Infrastructure ${suffix}`,
        code: `IT-${suffix}`,
        description: 'Testing Department',
      });
    const testDeptId = createDeptRes.body.data.id;

    const createEmpRes = await request(app)
      .post('/api/employees')
      .set('Authorization', `Bearer ${superToken}`)
      .send({
        employee_code: `HOST-${suffix}`,
        first_name: 'Abhimanyu',
        last_name: 'Kumar',
        email: `host_${suffix}@vms.local`,
        phone: `+91-987${suffix}`,
        designation: 'Systems Architect',
        department_id: testDeptId,
        site_ids: [baghpatSiteId],
      });

    hostEmployeeId = createEmpRes.body.data.id;
  });

  it('should register a walk-in visitor with auto check-in and generate active pass', async () => {
    const registerRes = await request(app)
      .post('/api/visits')
      .set('Authorization', `Bearer ${securityToken}`)
      .set('X-Site-Id', baghpatSiteId)
      .send({
        first_name: 'Test',
        last_name: 'Visitor',
        mobile_number: '+91-9988776655',
        company_name: 'Test Engineering Corp',
        visitor_type: 'Vendor',
        host_employee_id: hostEmployeeId,
        purpose: 'Equipment Safety Audit',
        vehicle_type: 'FOUR_WHEELER',
        vehicle_number: 'DL-01-AB-9999',
        auto_check_in: true,
      });

    assert.strictEqual(registerRes.status, 201);
    assert.strictEqual(registerRes.body.success, true);
    assert.strictEqual(registerRes.body.data.status, 'CHECKED_IN');
    assert.ok(registerRes.body.data.pass_number, 'Must have generated pass number');
    assert.ok(registerRes.body.data.qr_token, 'Must have generated secure QR token');

    const visitId = registerRes.body.data.id;
    const qrToken = registerRes.body.data.qr_token;

    // 2. Verify pass via public QR verify endpoint
    const verifyRes = await request(app)
      .get(`/api/passes/verify/${qrToken}`);

    assert.strictEqual(verifyRes.status, 200);
    assert.strictEqual(verifyRes.body.data.isValid, true);
    assert.strictEqual(verifyRes.body.data.visitorName, 'Test Visitor');
    assert.strictEqual(verifyRes.body.data.companyName, 'Test Engineering Corp');

    // 3. Confirm presence on Currently Inside list
    const insideRes = await request(app)
      .get('/api/visits/currently-inside')
      .set('Authorization', `Bearer ${securityToken}`)
      .set('X-Site-Id', baghpatSiteId);

    assert.strictEqual(insideRes.status, 200);
    const foundInside = insideRes.body.data.find((v: any) => v.id === visitId);
    assert.ok(foundInside, 'Visitor must appear in live on-site rollcall');

    // 4. Perform Gate Check-Out
    const checkOutRes = await request(app)
      .post(`/api/visits/${visitId}/check-out`)
      .set('Authorization', `Bearer ${securityToken}`)
      .set('X-Site-Id', baghpatSiteId);

    assert.strictEqual(checkOutRes.status, 200);
    assert.strictEqual(checkOutRes.body.success, true);

    // 5. Verify that QR pass is invalidated after check-out
    const reVerifyRes = await request(app)
      .get(`/api/passes/verify/${qrToken}`);

    assert.strictEqual(reVerifyRes.status, 200);
    assert.strictEqual(reVerifyRes.body.data.isValid, false);
    assert.strictEqual(reVerifyRes.body.data.verificationStatus, 'ALREADY_CHECKED_OUT');
  });

  it('should generate emergency evacuation roster', async () => {
    const evacRes = await request(app)
      .get('/api/visits/emergency-export')
      .set('Authorization', `Bearer ${securityToken}`)
      .set('X-Site-Id', baghpatSiteId);

    assert.strictEqual(evacRes.status, 200);
    assert.strictEqual(evacRes.body.success, true);
    assert.ok(evacRes.body.data.site, 'Site info must be included in evacuation manifest');
    assert.ok(Array.isArray(evacRes.body.data.records), 'Evacuation records array must be present');
  });
});
