import { describe, it, before } from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { initDatabase } from '../src/database/db.js';
import { runSeed } from '../src/database/seed.js';

describe('🏭 End-to-End Comprehensive VMS Module Test Suite', () => {
  let app: any;
  let adminToken: string;
  let securityToken: string;
  let baghpatSiteId: string;
  let hostEmployeeId: string;
  let sampleVisitorPhone = '+91-9811122233';

  before(async () => {
    await initDatabase();
    await runSeed();
    app = createApp();

    // 1. Authenticate as Super Admin
    const adminLoginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'superadmin@vms.local', password: 'Password@123' });
    
    assert.strictEqual(adminLoginRes.status, 200);
    adminToken = adminLoginRes.body.data.token;
    baghpatSiteId = adminLoginRes.body.data.user.activeSite.id;

    // 2. Authenticate as Gate Security
    const securityLoginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'security@vms.local', password: 'Password@123' });

    assert.strictEqual(securityLoginRes.status, 200);
    securityToken = securityLoginRes.body.data.token;

    // Get a host employee ID
    const empRes = await request(app)
      .get('/api/employees')
      .set('Authorization', `Bearer ${adminToken}`)
      .set('X-Site-Id', baghpatSiteId);
    
    hostEmployeeId = empRes.body.data[0].id;
  });

  // 1. Dashboard Module
  it('✅ [Dashboard Module] Should return KPI metric cards and weekly traffic charts', async () => {
    const [statsRes, chartsRes] = await Promise.all([
      request(app).get('/api/dashboard/stats').set('Authorization', `Bearer ${adminToken}`).set('X-Site-Id', baghpatSiteId),
      request(app).get('/api/dashboard/charts').set('Authorization', `Bearer ${adminToken}`).set('X-Site-Id', baghpatSiteId),
    ]);

    assert.strictEqual(statsRes.status, 200);
    assert.strictEqual(statsRes.body.success, true);
    assert.ok(statsRes.body.data.todayVisitors >= 0);

    assert.strictEqual(chartsRes.status, 200);
    assert.strictEqual(chartsRes.body.success, true);
    assert.ok(Array.isArray(chartsRes.body.data.visitsByDay));
  });

  // 2. Currently Inside & Emergency Evacuation Module
  it('✅ [Gate & Safety Module] Should retrieve live currently inside roster and emergency export manifest', async () => {
    const insideRes = await request(app)
      .get('/api/visits/currently-inside')
      .set('Authorization', `Bearer ${securityToken}`)
      .set('X-Site-Id', baghpatSiteId);

    assert.strictEqual(insideRes.status, 200);
    assert.strictEqual(insideRes.body.success, true);
    assert.ok(insideRes.body.data.length >= 1, 'Should have active checked-in visits from seed');

    const evacRes = await request(app)
      .get('/api/visits/emergency-export')
      .set('Authorization', `Bearer ${securityToken}`)
      .set('X-Site-Id', baghpatSiteId);

    assert.strictEqual(evacRes.status, 200);
    assert.strictEqual(evacRes.body.success, true);
    assert.ok(evacRes.body.data.site, 'Emergency manifest must have plant site header');
    assert.ok(Array.isArray(evacRes.body.data.records));
  });

  // 3. Visitor Directory & Instant Phone Auto-fill Lookup
  it('✅ [Visitor Directory Module] Should support phone auto-lookup and list visitor profiles', async () => {
    const lookupRes = await request(app)
      .post('/api/visitors/lookup')
      .set('Authorization', `Bearer ${adminToken}`)
      .set('X-Site-Id', baghpatSiteId)
      .send({ mobile_number: sampleVisitorPhone });

    assert.strictEqual(lookupRes.status, 200);
    assert.strictEqual(lookupRes.body.success, true);
    assert.ok(lookupRes.body.data, 'Should auto-fill existing visitor profile');
    assert.strictEqual(lookupRes.body.data.mobile_number, sampleVisitorPhone);

    const dirRes = await request(app)
      .get('/api/visitors')
      .set('Authorization', `Bearer ${adminToken}`)
      .set('X-Site-Id', baghpatSiteId);

    assert.strictEqual(dirRes.status, 200);
    assert.strictEqual(dirRes.body.success, true);
    assert.ok(Array.isArray(dirRes.body.data));
  });

  // 4. Walk-In Registration & Active Pass Generation
  it('✅ [Walk-In Visit Module] Should register walk-in visitor, generate pass and vehicle record', async () => {
    const newVisitRes = await request(app)
      .post('/api/visits')
      .set('Authorization', `Bearer ${securityToken}`)
      .set('X-Site-Id', baghpatSiteId)
      .send({
        first_name: 'Manish',
        last_name: 'Tiwari',
        mobile_number: '+91-9911223344',
        company_name: 'Tiwari Industrial Services',
        visitor_type: 'Contractor',
        purpose: 'HVAC Duct Maintenance & Filter Replacement',
        host_employee_id: hostEmployeeId,
        vehicle_type: 'TWO_WHEELER',
        vehicle_number: 'UP-14-CZ-7700',
        auto_check_in: true,
      });

    assert.strictEqual(newVisitRes.status, 201);
    assert.strictEqual(newVisitRes.body.success, true);
    assert.strictEqual(newVisitRes.body.data.status, 'CHECKED_IN');
    assert.ok(newVisitRes.body.data.qr_token, 'Must generate secure QR token');

    const qrToken = newVisitRes.body.data.qr_token;
    const visitId = newVisitRes.body.data.id;

    // 5. Public QR Verification
    const verifyRes = await request(app).get(`/api/passes/verify/${qrToken}`);
    assert.strictEqual(verifyRes.status, 200);
    assert.strictEqual(verifyRes.body.data.isValid, true);
    assert.strictEqual(verifyRes.body.data.visitorName, 'Manish Tiwari');

    // 6. Gate Check-Out
    const checkOutRes = await request(app)
      .post(`/api/visits/${visitId}/check-out`)
      .set('Authorization', `Bearer ${securityToken}`)
      .set('X-Site-Id', baghpatSiteId);

    assert.strictEqual(checkOutRes.status, 200);

    // 7. Verify QR token invalidation
    const reVerifyRes = await request(app).get(`/api/passes/verify/${qrToken}`);
    assert.strictEqual(reVerifyRes.status, 200);
    assert.strictEqual(reVerifyRes.body.data.isValid, false);
    assert.strictEqual(reVerifyRes.body.data.verificationStatus, 'ALREADY_CHECKED_OUT');
  });

  // 8. Employees & Departments Module
  it('✅ [Organization Directory Module] Should list employees and plant departments', async () => {
    const [empRes, deptRes, sitesRes] = await Promise.all([
      request(app).get('/api/employees').set('Authorization', `Bearer ${adminToken}`).set('X-Site-Id', baghpatSiteId),
      request(app).get('/api/departments').set('Authorization', `Bearer ${adminToken}`).set('X-Site-Id', baghpatSiteId),
      request(app).get('/api/sites').set('Authorization', `Bearer ${adminToken}`).set('X-Site-Id', baghpatSiteId),
    ]);

    assert.strictEqual(empRes.status, 200);
    assert.ok(empRes.body.data.length >= 3);

    assert.strictEqual(deptRes.status, 200);
    assert.ok(deptRes.body.data.length >= 6);

    assert.strictEqual(sitesRes.status, 200);
    assert.ok(sitesRes.body.data.length >= 2);
  });

  // 9. Reports & CSV Export Module
  it('✅ [Reports & Analytics Module] Should query visitor reports log and stream CSV export', async () => {
    const reportRes = await request(app)
      .get('/api/reports/visitor-log')
      .set('Authorization', `Bearer ${adminToken}`)
      .set('X-Site-Id', baghpatSiteId);

    assert.strictEqual(reportRes.status, 200);
    assert.strictEqual(reportRes.body.success, true);
    assert.ok(Array.isArray(reportRes.body.data));

    const csvRes = await request(app)
      .get('/api/reports/export/csv')
      .set('Authorization', `Bearer ${adminToken}`)
      .set('X-Site-Id', baghpatSiteId);

    assert.strictEqual(csvRes.status, 200);
    assert.ok(csvRes.text.includes('Visit Code,Visitor Name,Company'));
  });

  // 10. System Users, Settings & Audit Logs Module
  it('✅ [Administration & Compliance Module] Should manage system users, plant settings and audit logs', async () => {
    const [usersRes, settingsRes, auditRes] = await Promise.all([
      request(app).get('/api/users').set('Authorization', `Bearer ${adminToken}`).set('X-Site-Id', baghpatSiteId),
      request(app).get('/api/settings').set('Authorization', `Bearer ${adminToken}`).set('X-Site-Id', baghpatSiteId),
      request(app).get('/api/audit-logs').set('Authorization', `Bearer ${adminToken}`).set('X-Site-Id', baghpatSiteId),
    ]);

    assert.strictEqual(usersRes.status, 200);
    assert.ok(usersRes.body.data.length >= 4);

    assert.strictEqual(settingsRes.status, 200);
    assert.strictEqual(settingsRes.body.success, true);

    assert.strictEqual(auditRes.status, 200);
    assert.ok(Array.isArray(auditRes.body.data));
  });
});
